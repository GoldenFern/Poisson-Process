param(
  [int]$ApiPort = 0,
  [int]$FrontendPort = 0
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vsDevCmd = "D:\Software\VSCommunity\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path $vsDevCmd)) {
  Write-Error "VsDevCmd not found: $vsDevCmd"
}

function Test-PortInUse {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-ProjectPortSeed {
  param([string]$RootPath)

  $normalizedRoot = (Resolve-Path -LiteralPath $RootPath).Path.ToLowerInvariant()
  $md5 = [System.Security.Cryptography.MD5]::Create()

  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalizedRoot)
    $hash = $md5.ComputeHash($bytes)
    return [BitConverter]::ToUInt32($hash, 0)
  } finally {
    $md5.Dispose()
  }
}

function Get-ProjectDefaultPort {
  param([ValidateSet("API", "Frontend")] [string]$Label)

  $seed = Get-ProjectPortSeed -RootPath $projectRoot
  $slot = [int]($seed % 2500)

  if ($Label -eq "API") {
    return 34000 + ($slot * 2)
  }

  return 44000 + ($slot * 2)
}

function Get-AvailablePort {
  param(
    [int]$PreferredPort,
    [int]$MaxOffset = 20
  )

  for ($candidate = $PreferredPort; $candidate -le $PreferredPort + $MaxOffset; $candidate += 1) {
    if (-not (Test-PortInUse -Port $candidate)) {
      return $candidate
    }
  }

  throw "No available port found near $PreferredPort."
}

function Resolve-PreferredPort {
  param(
    [int]$PreferredPort,
    [string]$Label
  )

  if (-not (Test-PortInUse -Port $PreferredPort)) {
    return $PreferredPort
  }

  $fallback = Get-AvailablePort -PreferredPort ($PreferredPort + 1)
  Write-Warning "$Label port $PreferredPort is already in use. Falling back to $fallback."
  return $fallback
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$Attempts = 40,
    [int]$DelayMs = 500
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
    } catch {
      if ($attempt -eq $Attempts) {
        throw "Service did not become ready at $Url"
      }
    }

    Start-Sleep -Milliseconds $DelayMs
  }
}

$requestedApiPort = if ($ApiPort -gt 0) { $ApiPort } else { Get-ProjectDefaultPort -Label "API" }
$requestedFrontendPort = if ($FrontendPort -gt 0) { $FrontendPort } else { Get-ProjectDefaultPort -Label "Frontend" }

$resolvedApiPort = Resolve-PreferredPort -PreferredPort $requestedApiPort -Label "API"
$resolvedFrontendPort = Resolve-PreferredPort -PreferredPort $requestedFrontendPort -Label "Frontend"
$apiBase = "http://127.0.0.1:$resolvedApiPort"
$frontendBase = "http://127.0.0.1:$resolvedFrontendPort/frontend/"
$frontendUrl = "${frontendBase}?apiBase=$([uri]::EscapeDataString($apiBase))"

$backendCommand =
  "cd /d `"$projectRoot`" && " +
  "call `"$vsDevCmd`" -host_arch=x64 -arch=x64 && " +
  "set `"POISSON_API_PORT=$resolvedApiPort`" && " +
  "cmake -S backend -B backend/build -G `"NMake Makefiles`" && " +
  "cmake --build backend/build && " +
  "backend\build\poisson_server.exe"

$frontendCommand = "Set-Location -LiteralPath `"$projectRoot`"; python -m http.server $resolvedFrontendPort"

Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $backendCommand | Out-Null
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Wait-HttpOk -Url "$apiBase/api/health"
Wait-HttpOk -Url $frontendBase

$browserOpened = $false
try {
  Start-Process $frontendUrl | Out-Null
  $browserOpened = $true
} catch {
  Write-Warning "Browser could not be opened automatically. Open $frontendUrl manually."
}

Write-Host "Backend window started ($apiBase)."
Write-Host "Frontend window started ($frontendBase)."
Write-Host "Project-aware defaults were API $requestedApiPort and Frontend $requestedFrontendPort."
if ($browserOpened) {
  Write-Host "Browser opened with API base $apiBase."
} else {
  Write-Host "Open this URL manually: $frontendUrl"
}
Write-Host "Close the two spawned terminal windows to stop services."
