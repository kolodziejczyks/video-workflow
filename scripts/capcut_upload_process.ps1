param([ValidateSet('inspect','close')][string]$Mode='inspect',[int]$ExpectedPid=0,[string]$ExpectedStartedAt='')
$ErrorActionPreference='Stop'
$draftRoot='C:\Users\bezaw\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft'
$windows=@(Get-Process CapCut -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
$locked=@(Get-ChildItem -LiteralPath $draftRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '.locked') })
if($windows.Count -ne 1) { @{processInfo=$null;lockedProjects=$locked.Count} | ConvertTo-Json -Compress; exit 0 }
$app=$windows[0]
$started=$app.StartTime.ToUniversalTime().ToString('o')
if($Mode -eq 'close') {
 if($app.Id -ne $ExpectedPid -or $started -ne $ExpectedStartedAt -or $app.MainWindowTitle -ne 'CapCut' -or $locked.Count -ne 0) { throw 'CapCut identity or editing state changed; leaving it open.' }
 # Graceful close only. Never force-kill CapCut or dismiss a save prompt.
 $requested=$app.CloseMainWindow()
 $exited=$requested -and $app.WaitForExit(10000)
 @{closeRequested=$requested;exited=$exited} | ConvertTo-Json -Compress
} else {
 $parent=(Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $app.Id)).ParentProcessId
 @{processInfo=@{pid=$app.Id;parentPid=[int]$parent;startedAt=$started;title=$app.MainWindowTitle};lockedProjects=$locked.Count} | ConvertTo-Json -Compress
}
