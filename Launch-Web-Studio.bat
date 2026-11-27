@echo off
title Claude Code Web Studio
color 0b

echo ======================================================
echo    Starting Claude Code Web Studio via OmniRoute...
echo ======================================================
echo.

:: Ensure working directory is repository root
cd /d "%~dp0"

:: Set OmniRoute local proxy defaults
set "ANTHROPIC_BASE_URL=http://localhost:20128"
set "ANTHROPIC_AUTH_TOKEN=omniroute"
set "PORT=3000"

:: Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Wait 1 second and open browser automatically
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start the server
node server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server encountered an error and stopped.
    pause
)
