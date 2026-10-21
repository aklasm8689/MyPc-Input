@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo               Stopping My Input Pc Server
echo ==========================================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    set PID=%%a
    if defined PID (
        echo Stopping background process with PID: %%a ...
        taskkill /F /PID %%a >nul 2>nul
        set FOUND=1
    )
)

if %FOUND% equ 1 (
    echo [SUCCESS] Server stopped successfully.
) else (
    echo Server is not currently running on port 5000.
)

echo.
set /p REMOVE="Do you also want to remove Auto-Start on Windows boot? (y/n, default: n): "
if /i "%REMOVE%"=="y" (
    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MyInputPc" /f >nul 2>nul
    echo Auto-start on boot has been removed.
)

echo.
pause
