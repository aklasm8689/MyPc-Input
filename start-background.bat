@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo        My Input Pc - Background & Auto-Start Setup
echo ==========================================================
echo.

:: 1. Check Node.js (system or local runtime)
set "NODE_CMD=node"
set "NPM_CMD=npm"
set "NPX_CMD=npx"

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%~dp0runtime\node.exe" (
        set "PATH=%~dp0runtime;%PATH%"
        set "NODE_CMD=%~dp0runtime\node.exe"
        set "NPM_CMD=%~dp0runtime\npm.cmd"
        set "NPX_CMD=%~dp0runtime\npx.cmd"
        echo [OK] Using portable Node.js runtime from ./runtime
    ) else (
        echo [INFO] Node.js is not found on this computer.
        echo [INFO] Auto-downloading portable Node.js runtime for you...
        echo Please wait, this only happens once (approx. 30 seconds)...
        echo.
        mkdir "%~dp0runtime" >nul 2>nul
        powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; Write-Host 'Downloading portable Node.js...'; $wc.DownloadFile('https://nodejs.org/dist/v20.18.0/win-x64/node.exe', '%~dp0runtime\node.exe');"
        if not exist "%~dp0runtime\node.exe" (
            echo [WARN] Standalone binary download failed. Trying official installer...
            powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Start-Process 'msiexec.exe' -ArgumentList '/i https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi /passive' -Wait"
        )
        if exist "%~dp0runtime\node.exe" (
            set "PATH=%~dp0runtime;%PATH%"
            set "NODE_CMD=%~dp0runtime\node.exe"
            echo [OK] Portable Node.js downloaded and configured successfully!
        ) else (
            where node >nul 2>nul
            if %errorlevel% neq 0 (
                echo [ERROR] Could not automatically download Node.js.
                echo Please install Node.js manually once from https://nodejs.org
                echo.
                pause
                exit /b 1
            )
        )
    )
) else (
    echo [OK] Node.js is already installed on your system!
)

:: 2. Auto-install dependencies on first run if missing
if not exist "%~dp0node_modules" (
    echo [INFO] First time run detected. Installing dependencies...
    echo Please wait a moment...
    call npm install
    echo Dependencies installed successfully!
    echo.
)

:: 3. Create the silent VBS launcher (runs completely in background without any window)
set "VBS_FILE=%~dp0run-silent.vbs"
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0"
echo WshShell.Run "cmd /c set PATH=%~dp0runtime;%%PATH%% && set PORT=5000 && npx tsx server.ts", 0, False
) > "%VBS_FILE%"

:: 4. Register in Windows Startup so it starts on every computer reboot
echo [1/3] Enabling automatic startup on Windows boot...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MyInputPc" /t REG_SZ /d "wscript.exe \"%VBS_FILE%\"" /f >nul

:: 5. Create 1-Click Desktop Shortcut
echo [2/3] Creating Desktop Shortcut...
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\My Input Pc.url"
(
echo [InternetShortcut]
echo URL=http://localhost:5000
echo IconIndex=0
echo IconFile=%SystemRoot%\System32\shell32.dll,13
) > "%DESKTOP_SHORTCUT%"

:: 6. Launch the server silently in background right now
echo [3/3] Starting server silently in background...
wscript.exe "%VBS_FILE%"

:: 7. Open in browser automatically
timeout /t 2 /nobreak >nul
start http://localhost:5000

echo.
echo ==========================================================
echo [SUCCESS] My Input Pc is now active and installed!
echo.
echo - A shortcut 'My Input Pc' is created on your Desktop!
echo - Double-click that desktop icon anytime to open in 1 click!
echo - Starts automatically whenever your computer turns on.
echo - You can CLOSE this window now.
echo.
echo To stop it anytime, run: stop-background.bat
echo ==========================================================
echo.
pause
