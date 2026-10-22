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
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($RootDirectory, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match '(worker[/\\]run\.mjs|scripts[/\\](process_batch|remove_batch_project|build_reference_style_project)\.mjs)'
    })
    if ($related.Count) { Write-Event 'Existing worker/processor detected; leaving it untouched.'; exit 0 }
    if (Test-Path -LiteralPath $lockPath) {
        $raw = Get-Content -LiteralPath $lockPath -Raw
        $lockOwner = if ($raw) { $raw.Trim() } else { '' }
        if ($lockOwner -eq '') {
            # A worker records its PID right after creating the lock. An empty lock older than two minutes,
            # with no related worker/processor visible above, is a crash remnant rather than a live owner.
            $age = [DateTime]::UtcNow - (Get-Item -LiteralPath $lockPath).LastWriteTimeUtc
            if ($age.TotalMinutes -lt 2) { Write-Event 'Empty worker lock is recent; waiting for its owner to record a PID.'; exit 0 }
            Move-Item -LiteralPath $lockPath -Destination (Join-Path $logs ("stale-lock-{0}-empty.txt" -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')))
            Write-Event 'Archived an empty stale worker lock after confirming no worker or processor runs.'
        } else {
            if ($lockOwner -notmatch '^\d+$') { throw 'Malformed worker lock; confirm no worker runs, then remove work/batches/worker.lock manually.' }
            $owner = $processes | Where-Object { [string]$_.ProcessId -eq $lockOwner } | Select-Object -First 1
            if ($owner -and $owner.Name -eq 'node.exe') { Write-Event 'Lock owner is alive; leaving it untouched.'; exit 0 }
            if ($owner) { Write-Event ("Lock PID {0} now belongs to {1}, not a Node worker; treating the lock as stale." -f $lockOwner, $owner.Name) }
            Move-Item -LiteralPath $lockPath -Destination (Join-Path $logs ("stale-lock-{0}-{1}.txt" -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'), $lockOwner))
            Write-Event 'Archived stale worker lock after confirming its owner and processors are absent.'
        }
    }
    # Keep the newest 40 process log files (20 runs); never copy credentials into task arguments.
    Get-ChildItem -LiteralPath $logs -Filter 'worker-*.log*' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 40 | Remove-Item
    $logPath = Join-Path $logs ("worker-{0}.log" -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))
    Write-Event "Starting worker; output: $([IO.Path]::GetFileName($logPath))"
    Push-Location $RootDirectory
    try {
        # Scheduled tasks do not inherit Codex's runtime PATH. Child processors
        # and MCP also invoke node, so give the whole worker tree this runtime.
        $env:PATH = (Split-Path -Parent $NodePath) + ';' + $env:PATH
        # Redirect at the OS level so stderr does not become a PowerShell exception.
        # Absolute arguments make the worker visible to the related-process scan above.
        $arguments = @(
            ('--env-file="{0}"' -f (Join-Path $RootDirectory 'work\worker.env')),
            ('"{0}"' -f (Join-Path $RootDirectory 'worker\run.mjs')),
            ('"{0}"' -f (Join-Path $RootDirectory 'worker\config.local.json'))
        )
        $worker = Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory $RootDirectory -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError ($logPath + '.stderr') -PassThru
        Write-Event "Worker PID $($worker.Id)"
        # Touching Handle first makes ExitCode available after the process exits.
        $null = $worker.Handle
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
