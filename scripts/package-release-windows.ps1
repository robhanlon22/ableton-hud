param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"

$artifactPath = "dist/Ableton-HUD-$Tag-windows-x64-installer.exe"
$shaPath = "$artifactPath.sha256"

foreach ($path in @($artifactPath, $shaPath)) {
  if (Test-Path $path) {
    Remove-Item -Force $path
  }
}

$installerCandidates = @(Get-ChildItem -Path "dist" -Filter "*.exe" -File)
if ($installerCandidates.Count -eq 0) {
  Write-Error "Missing Windows installer in dist"
}

if ($installerCandidates.Count -ne 1) {
  $installerNames = $installerCandidates | ForEach-Object { $_.Name } | Sort-Object
  Write-Error ("Expected exactly one Windows installer in dist, found: " + ($installerNames -join ", "))
}

$installerPath = $installerCandidates[0].FullName

Copy-Item $installerPath $artifactPath
$hash = (Get-FileHash -Algorithm SHA256 $artifactPath).Hash.ToLowerInvariant()
"{0}  {1}" -f $hash, (Split-Path -Leaf $artifactPath) | Out-File -FilePath $shaPath -Encoding ascii -NoNewline
