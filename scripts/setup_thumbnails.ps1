param([string]$Python = (Join-Path $PSScriptRoot '../.venv/Scripts/python.exe'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'work/tools/thumbnail-python'
& $Python -m venv --without-pip $runtime
if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated thumbnail runtime.' }
& $Python -m pip --python (Join-Path $runtime 'Scripts/python.exe') install -r (Join-Path $root 'requirements-thumbnails.lock.txt')
if ($LASTEXITCODE -ne 0) { throw 'Thumbnail dependencies failed to install.' }
$modelDirectory = Join-Path $root 'work/models/thumbnail-face'
New-Item -ItemType Directory -Force $modelDirectory | Out-Null
$model = Join-Path $modelDirectory 'face_landmarker.task'
$expected = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
if (-not (Test-Path -LiteralPath $model)) {
    Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' -OutFile ($model + '.download')
    if ((Get-FileHash -LiteralPath ($model + '.download') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Downloaded face model checksum mismatch.' }
    Move-Item -LiteralPath ($model + '.download') -Destination $model
}
if ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Face model checksum mismatch.' }
Write-Output 'Local thumbnail selection is ready. No worker or CapCut process was changed.'
