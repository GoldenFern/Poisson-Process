$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vsDevCmd = "D:\Software\VSCommunity\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path $vsDevCmd)) {
  Write-Error "VsDevCmd not found: $vsDevCmd"
}

$backendCommand = @"
cd /d "$projectRoot"
call "$vsDevCmd" -host_arch=x64 -arch=x64
if not exist "backend\build\poisson_server.exe" (
  cmake -S backend -B backend/build -G "NMake Makefiles"
  cmake --build backend/build
)
backend\build\poisson_server.exe
"@

$frontendCommand = @"
cd "$projectRoot"
python -m http.server 5500
"@

Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $backendCommand | Out-Null
Start-Sleep -Milliseconds 700
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null
Start-Sleep -Milliseconds 700
Start-Process "http://localhost:5500/frontend/" | Out-Null

Write-Host "Backend window started (http://localhost:8080)."
Write-Host "Frontend window started (http://localhost:5500/frontend/)."
Write-Host "Close the two spawned terminal windows to stop services."
