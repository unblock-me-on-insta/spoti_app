$ErrorActionPreference = "Stop"
$updateScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "update-events.ps1"))
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$updateScript`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At "05:17"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName "SPOTi Event Update" -Description "Daily refresh of public Ljubljana event data for SPOTi." -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Installed daily task 'SPOTi Event Update' for 05:17."
