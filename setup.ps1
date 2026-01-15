#Requires -Version 5.1
<#
.SYNOPSIS
    OpenPoo Desktop App Setup Script for Windows

.DESCRIPTION
    This script checks for prerequisites (Bun, Rust), installs dependencies,
    and launches the OpenPoo desktop application.

.EXAMPLE
    .\setup.ps1

.NOTES
    Run this script from the repository root directory.
#>

$ErrorActionPreference = "Stop"

# Colors and formatting
function Write-Step {
    param([string]$Message)
    Write-Host "==> " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[!] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "[X] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# Check for Bun
function Test-Bun {
    try {
        $bunVersion = & bun --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Bun is installed (version $bunVersion)"
            return $true
        }
    }
    catch {
        # Bun not found
    }
    return $false
}

# Check for Rust/Cargo
function Test-Rust {
    try {
        $rustVersion = & rustc --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $version = $rustVersion -replace 'rustc ', ''
            Write-Success "Rust is installed ($version)"
            return $true
        }
    }
    catch {
        # Rust not found
    }
    return $false
}

# Check for Visual Studio Build Tools (required for Rust on Windows)
function Test-VSBuildTools {
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vsPath) {
            Write-Success "Visual Studio Build Tools detected"
            return $true
        }
    }

    # Check for standalone Build Tools
    $buildToolsPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
    $buildToolsPath2019 = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools"

    if ((Test-Path $buildToolsPath) -or (Test-Path $buildToolsPath2019)) {
        Write-Success "Visual Studio Build Tools detected"
        return $true
    }

    return $false
}

# Install dependencies
function Install-Dependencies {
    Write-Step "Installing dependencies..."

    $nodeModulesPath = Join-Path $PWD "node_modules"
    $lockfilePath = Join-Path $PWD "bun.lockb"

    if ((Test-Path $nodeModulesPath) -and (Test-Path $lockfilePath)) {
        $nodeModulesTime = (Get-Item $nodeModulesPath).LastWriteTime
        $lockfileTime = (Get-Item $lockfilePath).LastWriteTime

        if ($lockfileTime -gt $nodeModulesTime) {
            Write-Step "Lockfile changed, reinstalling dependencies..."
            & bun install
        }
        else {
            Write-Success "Dependencies already installed (skipping)"
        }
    }
    else {
        & bun install
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install dependencies"
    }

    Write-Success "Dependencies installed"
}

# Main function
function Main {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "         OpenPoo Desktop App Setup (Windows)           " -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host ""

    # Check prerequisites
    Write-Step "Checking prerequisites..."
    Write-Host ""

    $missingPrereqs = $false

    if (-not (Test-Bun)) {
        Write-Error "Bun is not installed"
        Write-Host ""
        Write-Host "  Install Bun using one of these methods:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Option 1 - PowerShell:" -ForegroundColor Gray
        Write-Host "    irm bun.sh/install.ps1 | iex"
        Write-Host ""
        Write-Host "  Option 2 - npm (if Node.js is installed):" -ForegroundColor Gray
        Write-Host "    npm install -g bun"
        Write-Host ""
        Write-Host "  Option 3 - Scoop:" -ForegroundColor Gray
        Write-Host "    scoop install bun"
        Write-Host ""
        $missingPrereqs = $true
    }

    if (-not (Test-Rust)) {
        Write-Error "Rust is not installed"
        Write-Host ""
        Write-Host "  Install Rust:" -ForegroundColor Yellow
        Write-Host "    1. Download and run: https://win.rustup.rs/x86_64"
        Write-Host "    2. Or visit: https://www.rust-lang.org/tools/install"
        Write-Host ""
        $missingPrereqs = $true
    }
    else {
        # Check for VS Build Tools only if Rust is installed
        if (-not (Test-VSBuildTools)) {
            Write-Warning "Visual Studio Build Tools may be required for Rust compilation"
            Write-Host ""
            Write-Host "  If you encounter build errors, install Visual Studio Build Tools:" -ForegroundColor Yellow
            Write-Host "    1. Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
            Write-Host "    2. Select 'Desktop development with C++' workload"
            Write-Host ""
        }
    }

    if ($missingPrereqs) {
        Write-Host ""
        Write-Error "Please install the missing prerequisites and run this script again."
        Write-Host ""
        Write-Host "After installing, you may need to restart your terminal or run:" -ForegroundColor Gray
        Write-Host "  refreshenv  (if using Chocolatey)" -ForegroundColor Gray
        Write-Host "  Or restart PowerShell" -ForegroundColor Gray
        Write-Host ""
        exit 1
    }

    Write-Host ""

    # Install dependencies
    Install-Dependencies

    Write-Host ""
    Write-Step "Launching OpenPoo Desktop App..."
    Write-Host ""

    # Run tauri dev from the desktop package
    Set-Location -Path "packages\desktop"
    & bun run tauri dev
}

# Run main
try {
    Main
}
catch {
    Write-Error "An error occurred: $_"
    exit 1
}
