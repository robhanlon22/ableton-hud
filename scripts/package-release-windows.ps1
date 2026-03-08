param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"

$appPath = "dist/win-unpacked"
$stagingDir = "dist/Ableton HUD-windows-x64"
$zipPath = "dist/Ableton-HUD-$Tag-windows-x64.zip"
$shaPath = "$zipPath.sha256"

if (-not (Test-Path $appPath -PathType Container)) {
  Write-Error "Missing app bundle at $appPath"
}

if (Test-Path $stagingDir) {
  Remove-Item -Recurse -Force $stagingDir
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

if (Test-Path $shaPath) {
  Remove-Item -Force $shaPath
}

Copy-Item $appPath $stagingDir -Recurse
Compress-Archive -Path $stagingDir -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()
"{0}  {1}" -f $hash, (Split-Path -Leaf $zipPath) | Out-File -FilePath $shaPath -Encoding ascii -NoNewline
