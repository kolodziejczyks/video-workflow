$ErrorActionPreference = 'Stop'
$rootDirectory = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$taskName = 'Cutroom PC Worker'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$launcher = "$env:SystemRoot\System32\wscript.exe"
$action = New-ScheduledTaskAction -Execute $launcher -Argument ('//B //NoLogo "{0}\worker\launch-background.vbs" worker "{1}"' -f $rootDirectory, $nodePath) -WorkingDirectory $rootDirectory
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $identity),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Keeps the Cutroom PC worker running in the signed-in user session; retries every minute and records persistent logs.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
$cleanupAction = New-ScheduledTaskAction -Execute $launcher -Argument ('//B //NoLogo "{0}\worker\launch-background.vbs" cleanup "{1}"' -f $rootDirectory, $nodePath) -WorkingDirectory $rootDirectory
Register-ScheduledTask -TaskName 'Cutroom Upload Cleanup' -Action $cleanupAction -Trigger $triggers -Settings $settings -Principal $principal -Description 'Gracefully closes only a Cutroom-owned CapCut home window after its exact draft upload completes.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Cutroom Upload Cleanup'
