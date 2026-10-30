# Build MyPc-Input ultra-lightweight standalone application & installer
$ErrorActionPreference = "Stop"

Write-Host ">>> 1. Building React Web App..." -ForegroundColor Cyan
npm run build

Write-Host ">>> 2. Compressing Web Assets..." -ForegroundColor Cyan
if (Test-Path dist.zip) { Remove-Item dist.zip -Force }
Compress-Archive -Path dist\* -DestinationPath dist.zip -Force

Write-Host ">>> 3. Compiling Native C# Executable (MyPc-Input.exe)..." -ForegroundColor Cyan
Get-Process -Name "MyPc-Input*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
if (Test-Path "MyPc-Input.exe") { Remove-Item "MyPc-Input.exe" -Force -ErrorAction SilentlyContinue }

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = (Get-ChildItem -Path "C:\Windows\Microsoft.NET\Framework64" -Filter "csc.exe" -Recurse | Select-Object -Last 1).FullName
}

& $csc /nologo /target:winexe /win32icon:app.ico /resource:dist.zip,dist.zip /resource:lib\QRCoder.dll,QRCoder.dll /optimize+ /r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll,lib\QRCoder.dll /out:MyPc-Input.exe native\*.cs
if ($LASTEXITCODE -ne 0) {
    Write-Error "C# compilation failed with exit code $LASTEXITCODE"
}

if (Test-Path dist.zip) { Remove-Item dist.zip -Force }

$exeSize = (Get-Item "MyPc-Input.exe").Length / 1MB
Write-Host (">> Built MyPc-Input.exe: {0:N2} MB" -f $exeSize) -ForegroundColor Green

Write-Host ">>> 4. Creating NSIS Setup Installer (MyPc-Input-Setup.exe)..." -ForegroundColor Cyan
$nsis = (Get-ChildItem -Path "$env:LOCALAPPDATA\electron-builder\Cache" -Filter "makensis.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $nsis -or -not (Test-Path $nsis)) {
    $nsis = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source
}
if (-not $nsis) {
    Write-Error "makensis.exe not found. Please install NSIS."
}

& $nsis installer.nsi

$setupSize = (Get-Item "MyPc-Input-Setup.exe").Length / 1KB
Write-Host (">> Built MyPc-Input-Setup.exe: {0:N0} KB ({1:N2} MB)" -f $setupSize, ($setupSize/1024)) -ForegroundColor Green
Write-Host ">>> COMPLETE! Ready to distribute MyPc-Input-Setup.exe" -ForegroundColor Green
