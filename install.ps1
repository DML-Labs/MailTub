# MailTub Installer for Windows 10/11 (PowerShell)
# Usage:
#   iwr https://raw.githubusercontent.com/dml-labs/mailtub/main/install.ps1 | iex
#   .\install.ps1 [-Version v1.0.0] [-InstallDir "C:\Program Files\MailTub"] [-AddToPath]
#
# Copyright 2026 DML Labs - Apache 2.0
#Requires -Version 5.1
param(
    [string]$Version    = "",
    [string]$InstallDir = "$env:LOCALAPPDATA\MailTub",
    [string]$DataDir    = "$env:APPDATA\MailTub",
    [switch]$AddToPath
)

$ErrorActionPreference = "Stop"
$Repo = "dml-labs/mailtub"

function Write-Info  { Write-Host "[mailtub] $args" -ForegroundColor Cyan   }
function Write-Ok    { Write-Host "[mailtub] $args" -ForegroundColor Green  }
function Write-Warn  { Write-Host "[mailtub] $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[mailtub] ERROR: $args" -ForegroundColor Red; exit 1 }

Write-Info "MailTub Windows Installer"

# ── Resolve version ─────────────────────────────────────────────────────────
if (-not $Version) {
    Write-Info "Fetching latest release..."
    try {
        $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
        $Version = $rel.tag_name
    } catch {
        Write-Fail "Could not fetch latest release. Pass -Version v1.0.0 explicitly."
    }
}
Write-Info "Installing MailTub $Version (windows/amd64)"

# ── Download ────────────────────────────────────────────────────────────────
$VerNum  = $Version.TrimStart("v")
$Archive = "mailtub_${VerNum}_windows_amd64.zip"
$Url     = "https://github.com/$Repo/releases/download/$Version/$Archive"
$TmpDir  = Join-Path $env:TEMP "mailtub_install_$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir | Out-Null

Write-Info "Downloading $Archive..."
try {
    Invoke-WebRequest $Url -OutFile "$TmpDir\$Archive" -UseBasicParsing
} catch {
    Write-Fail "Download failed: $Url`n$_"
}

Write-Info "Extracting..."
Expand-Archive "$TmpDir\$Archive" -DestinationPath $TmpDir -Force

# ── Install binary ──────────────────────────────────────────────────────────
$Binary = Get-ChildItem -Path $TmpDir -Filter "mailtub.exe" -Recurse | Select-Object -First 1
if (-not $Binary) { Write-Fail "mailtub.exe not found in archive" }

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item $Binary.FullName "$InstallDir\mailtub.exe" -Force
Write-Ok "Installed to $InstallDir\mailtub.exe"

# ── Data directory ──────────────────────────────────────────────────────────
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
Write-Info "Data directory: $DataDir"

# ── Create default .env ─────────────────────────────────────────────────────
$EnvFile = "$DataDir\.env"
if (-not (Test-Path $EnvFile)) {
    @"
PORT=8080
SMTP_PORT=2525
DATABASE_PATH=$DataDir\mailtub.db
MAILBOX_TTL=24h
"@ | Set-Content $EnvFile
    Write-Info "Created default config: $EnvFile"
}

# ── Add to PATH ─────────────────────────────────────────────────────────────
if ($AddToPath) {
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$InstallDir", "User")
        Write-Ok "Added $InstallDir to user PATH (restart your terminal)"
    }
}

# ── Cleanup ─────────────────────────────────────────────────────────────────
Remove-Item $TmpDir -Recurse -Force

# ── Done ────────────────────────────────────────────────────────────────────
Write-Ok "MailTub $Version installed successfully!"
Write-Host ""
Write-Host "  Quick start (run from $DataDir):"
Write-Host "    mailtub.exe serve             # Start server (HTTP :8080, SMTP :2525)"
Write-Host "    mailtub.exe new               # Create a mailbox"
Write-Host "    mailtub.exe --version         # Show version"
Write-Host ""
Write-Host "  Docs: https://github.com/dml-labs/mailtub"
if (-not $AddToPath) {
    Write-Warn "Tip: Run with -AddToPath to add MailTub to your PATH automatically"
}
