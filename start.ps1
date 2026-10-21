$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       MyPcInput - Starting Server & App" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed! Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing required packages for the first time (this may take a minute)..." -ForegroundColor Yellow
    npm install --force
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install packages." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# 3. Get LAN IP reliably via Node.js
try {
    node -e "const os = require('os'); const nets = os.networkInterfaces(); let ip = '127.0.0.1'; for (const name of Object.keys(nets)) { for (const net of nets[name]) { if (net.family === 'IPv4' && !net.internal && net.address) { ip = net.address; break; } } } require('fs').writeFileSync('.lanip', ip);"
} catch {}

$lanIp = "127.0.0.1"
if (Test-Path ".lanip") {
    $c = (Get-Content .lanip -Raw -ErrorAction SilentlyContinue).Trim()
    if ($c) { $lanIp = $c }
}

$url = "http://" + $lanIp + ":5000"
Write-Host "[INFO] Detected LAN IP URL: $url" -ForegroundColor Green

# 4. Force kill any existing process on port 5000 to ensure fresh server startup
try {
    $pids = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Seconds 1

Write-Host "[INFO] Starting server in background..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "./node_modules/tsx/dist/cli.mjs server.ts" -WindowStyle Hidden

$portOpen = $false
$attempts = 0
while (-not $portOpen -and $attempts -lt 15) {
    Start-Sleep -Seconds 1
    $attempts++
    try {
        $conn = Test-NetConnection -ComputerName localhost -Port 5000 -InformationLevel Quiet -ErrorAction SilentlyContinue
        if ($conn) { $portOpen = $true }
    } catch {}
}

# 5. Create Desktop .lnk Shortcut with clean system icon
$desktop = [Environment]::GetFolderPath('Desktop')
$oldUrl = Join-Path $desktop 'My Input Pc.url'
if (Test-Path $oldUrl) { Remove-Item $oldUrl -Force }
$oldLnk = Join-Path $desktop 'My Input Pc.lnk'
if (Test-Path $oldLnk) { Remove-Item $oldLnk -Force }

$shortcutPath = Join-Path $desktop 'MyPcInput.lnk'
Write-Host "[INFO] Creating Desktop Shortcut at: $shortcutPath" -ForegroundColor Yellow
try {
    $WshShell = New-Object -comObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = "cmd.exe"
    $Shortcut.Arguments = "/c start $url"
    $Shortcut.Description = "MyPcInput - Wireless Text Input & Clipboard Sync"
    $Shortcut.IconLocation = "shell32.dll,264"
    $Shortcut.Save()
} catch {
    Write-Host "[WARNING] Could not create .lnk shortcut: $_" -ForegroundColor Yellow
}

# 6. Open Browser with LAN IP URL
Write-Host "[INFO] Opening browser at $url ..." -ForegroundColor Yellow
Start-Process $url

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   SUCCESS! MyPcInput is running at $url" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Start-Sleep -Seconds 3
