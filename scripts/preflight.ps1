param([string]$DraftRoot)

$ErrorActionPreference = 'Stop'
# Read-only: does not install tools, launch CapCut, or alter drafts.
$toolStatus = foreach ($toolName in @('git', 'node', 'python', 'ffmpeg', 'ffprobe', 'uv')) {
    $command = Get-Command $toolName -ErrorAction SilentlyContinue | Select-Object -First 1
    [pscustomobject]@{
        Name = $toolName
        Found = [bool]$command
        Path = if ($command) { $command.Source } else { $null }
        Note = if ($command -and $command.Source -like '*\WindowsApps\python.exe') { 'Windows alias; interpreter not verified' } else { $null }
    }
}
if (-not $DraftRoot) {
    $DraftRoot = Join-Path $env:LOCALAPPDATA 'CapCut\User Data\Projects\com.lveditor.draft'
}
$draftExists = Test-Path -LiteralPath $DraftRoot -PathType Container
$drafts = @()
if ($draftExists) {
    $drafts = @(Get-ChildItem -LiteralPath $DraftRoot -Directory | ForEach-Object {
        $contentPath = Join-Path $_.FullName 'draft_content.json'
        if (Test-Path -LiteralPath $contentPath -PathType Leaf) {
            $readableJson = $false
            try {
                $null = Get-Content -LiteralPath $contentPath -Raw | ConvertFrom-Json
                $readableJson = $true
            } catch { }
            [pscustomobject]@{ Name = $_.Name; ReadableJson = $readableJson }
        }
    })
}
[pscustomobject]@{
    Tools = @($toolStatus)
    DraftRoot = $DraftRoot
    DraftRootExists = $draftExists
    Drafts = $drafts
    CapCutRunning = [bool](Get-Process -Name CapCut -ErrorAction SilentlyContinue)
} | ConvertTo-Json -Depth 5
