param(
    [string]$RootDirectory = (Split-Path -Parent $PSScriptRoot),
    [string]$NodePath = (Get-Command node -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
$RootDirectory = (Resolve-Path -LiteralPath $RootDirectory).Path
$logs = Join-Path $RootDirectory 'work/worker-logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
# A named mutex also protects against manually launching this wrapper twice.
$hash = [System.Security.Cryptography.SHA256]::Create()
$key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($RootDirectory.ToLowerInvariant()))).Replace('-', '')
$mutex = New-Object System.Threading.Mutex($false, "Local\CutroomWorker$key")
$owned = $false
function Write-Event([string]$Message) {
    Add-Content -LiteralPath (Join-Path $logs 'supervisor.log') -Value ("{0} {1}" -f [DateTime]::UtcNow.ToString('o'), $Message)
}
try {
    try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { exit 0 }
    $lockPath = Join-Path $RootDirectory 'work/batches/worker.lock'
    # Do not reclaim a lock while a previous worker or orphan processor is alive.
    # CIM failure is fatal: lack of process visibility is not evidence of absence.
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $related = @($processes | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($RootDirectory) -and $_.CommandLine -match '(worker[/\\]run\.mjs|scripts[/\\](process_batch|remove_batch_project|build_reference_style_project)\.mjs)'
    })
    if ($related.Count) { Write-Event 'Existing worker/processor detected; leaving it untouched.'; exit 0 }
    if (Test-Path -LiteralPath $lockPath) {
        $lockOwner = (Get-Content -LiteralPath $lockPath -Raw).Trim()
        if ($lockOwner -notmatch '^\d+$') { throw 'Malformed worker lock; refusing automatic removal.' }
        if ($processes | Where-Object { [string]$_.ProcessId -eq $lockOwner }) {
            Write-Event 'Lock owner is alive; leaving it untouched.'; exit 0
        }
        Move-Item -LiteralPath $lockPath -Destination (Join-Path $logs ("stale-lock-{0}-{1}.txt" -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'), $lockOwner))
        Write-Event 'Archived stale worker lock after confirming its owner and processors are absent.'
    }
    # Keep the newest 20 process logs; never copy credentials into task arguments.
    Get-ChildItem -LiteralPath $logs -Filter 'worker-*.log*' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 40 | Remove-Item
    $logPath = Join-Path $logs ("worker-{0}.log" -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))
    Write-Event "Starting worker; output: $([IO.Path]::GetFileName($logPath))"
    Push-Location $RootDirectory
    try {
        # Scheduled tasks do not inherit Codex's runtime PATH. Child processors
        # and MCP also invoke node, so give the whole worker tree this runtime.
        $env:PATH = (Split-Path -Parent $NodePath) + ';' + $env:PATH
        # Redirect at the OS level so stderr does not become a PowerShell exception.
        $worker = Start-Process -FilePath $NodePath -ArgumentList '--env-file=work/worker.env','worker/run.mjs','worker/config.local.json' -WorkingDirectory $RootDirectory -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError ($logPath + '.stderr') -PassThru
        Write-Event "Worker PID $($worker.Id)"
        $worker.WaitForExit()
        Write-Event "Worker exited with code $($worker.ExitCode); scheduled task will retry."
    } finally { Pop-Location }
} catch {
    Write-Event ("Supervisor failure: " + $_.Exception.Message)
    exit 1
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
