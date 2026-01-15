@echo off
REM OpenPoo Desktop App Setup Script (Windows)
REM This is a wrapper that calls the PowerShell script
REM
REM Usage: setup.bat
REM

echo.
echo Starting OpenPoo Desktop App Setup...
echo.

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell is not available on this system.
    echo Please run setup.ps1 directly from PowerShell.
    pause
    exit /b 1
)

REM Run the PowerShell script with execution policy bypass for this session
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Setup encountered an error. Please check the output above.
    pause
    exit /b %ERRORLEVEL%
)
