param(
  [string]$Archive,
  [string]$Version = "latest",
  [string]$Repo = "marius-patrik/skyagent",
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "SkyAgent\bin"),
  [switch]$NoPath
)

$ErrorActionPreference = "Stop"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("skyagent-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $InstallDir, $TempDir | Out-Null

function Invoke-SkyAgentValidation {
  param(
    [string]$ExePath,
    [string[]]$Arguments
  )

  & $ExePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "skyagent $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  if (-not $Archive) {
    $Release = if ($Version -eq "latest") { "latest/download" } else { "download/$Version" }
    $Archive = Join-Path $TempDir "skyagent-windows-x64.zip"
    $Url = "https://github.com/$Repo/releases/$Release/skyagent-windows-x64.zip"
    Invoke-WebRequest -Uri $Url -OutFile $Archive
  }

  Expand-Archive -LiteralPath $Archive -DestinationPath $TempDir -Force
  $Exe = Get-ChildItem -Path $TempDir -Recurse -Filter "skyagent.exe" | Select-Object -First 1
  if (-not $Exe) {
    throw "skyagent.exe was not found in $Archive"
  }
  Copy-Item -LiteralPath $Exe.FullName -Destination (Join-Path $InstallDir "skyagent.exe") -Force

  if (-not $NoPath) {
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $Parts = @($UserPath -split ";" | Where-Object { $_ })
    if ($Parts -notcontains $InstallDir) {
      [Environment]::SetEnvironmentVariable("Path", (($Parts + $InstallDir) -join ";"), "User")
      Write-Host "Added $InstallDir to the user PATH. Restart terminals to pick it up."
    }
  }

  $InstalledExe = Join-Path $InstallDir "skyagent.exe"
  Invoke-SkyAgentValidation -ExePath $InstalledExe -Arguments @("version")
  Invoke-SkyAgentValidation -ExePath $InstalledExe -Arguments @("doctor")
} finally {
  Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
