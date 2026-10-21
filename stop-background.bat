@echo off
title My Input Pc - Stop Server
echo ==========================================================
echo        Stopping My Input Pc Server & Cleanup...
echo ==========================================================

:: Kill process running on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Remove Desktop Shortcuts
if exist "%USERPROFILE%\Desktop\My Input Pc.lnk" (
    del /f /q "%USERPROFILE%\Desktop\My Input Pc.lnk" >nul 2>&1
)
if exist "%USERPROFILE%\Desktop\My Input Pc.url" (
    del /f /q "%USERPROFILE%\Desktop\My Input Pc.url" >nul 2>&1
)

echo Server stopped and desktop shortcut removed successfully.
timeout /t 3 >nul
exit
