# MailTub Uninstaller for Windows 10/11 (PowerShell)
# Usage:
#   .\uninstall.ps1 [-KeepData] [-InstallDir "C:\Program Files\MailTub"]
#
# Copyright 2026 DML Labs - Apache 2.0
#Requires -Version 5.1
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\MailTub",
    [string]$DataDir    = "$env:APPDATA\MailTub",
    [switch]$KeepData
)

$ErrorActionPreference = "Stop"

function Write-Info { Write-Host "[mailtub] $args" -ForegroundColor Cyan   }
function Write-Ok   { Write-Host "[mailtub] $args" -ForegroundColor Green  }
function Write-Warn { Write-Host "[mailtub] $args" -ForegroundColor Yellow }

Write-Info "MailTub Windows Uninstaller"

# ── Stop any running mailtub processes ──────────────────────────────────────
$running = Get-Process -Name mailtub -ErrorAction SilentlyContinue
if ($running) {
    Write-Info "Stopping mailtub process(es)..."
    $running | Stop-Process -Force
    Write-Ok "Stopped"
}

# ── Remove binary ────────────────────────────────────────────────────────────
$Binary = "$InstallDir\mailtub.exe"
if (Test-Path $Binary) {
    Remove-Item $Binary -Force
    Write-Ok "Removed $Binary"
} else {
    Write-Warn "Binary not found at $Binary — already removed?"
}

# Remove install dir if empty
if ((Test-Path $InstallDir) -and (Get-ChildItem $InstallDir -ErrorAction SilentlyContinue).Count -eq 0) {
    Remove-Item $InstallDir -Force
}

# ── Remove PATH entry ────────────────────────────────────────────────────────
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -like "*$InstallDir*") {
    $NewPath = ($CurrentPath -split ";" | Where-Object { $_ -ne $InstallDir }) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Ok "Removed $InstallDir from PATH"
}

# ── Data directory ────────────────────────────────────────────────────────────
if (-not $KeepData -and (Test-Path $DataDir)) {
    $confirm = Read-Host "Remove data directory $DataDir ? This deletes all stored emails. [y/N]"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Remove-Item $DataDir -Recurse -Force
        Write-Ok "Data directory removed"
    } else {
        Write-Ok "Keeping data directory"
    }
} elseif ($KeepData) {
    Write-Ok "Data directory preserved (-KeepData)"
}

Write-Ok "MailTub uninstalled successfully"
