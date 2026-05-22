param(
  [string]$FrontendPath = "C:\Users\VinzenzGeisler\source\MSC-Event-Frontend",
  [string]$SigningPath = "C:\Users\VinzenzGeisler\source\msc-event-signing-terminal",
  [string]$FrontendPort = "5173",
  [string]$SigningPort = "5178",
  [string]$ApiBaseUrl = "",
  [string]$CognitoDomain = "",
  [string]$CognitoClientId = ""
)

$ErrorActionPreference = "Stop"

function Ensure-EnvLocal {
  param([string]$ProjectPath)

  $envPath = Join-Path $ProjectPath ".env.local"
  $examplePath = Join-Path $ProjectPath ".env.local.example"

  if ((Test-Path $envPath) -or -not (Test-Path $examplePath)) {
    return
  }

  Copy-Item -LiteralPath $examplePath -Destination $envPath
  Write-Host "Created $envPath from .env.local.example"
}

function Set-EnvValue {
  param(
    [string]$ProjectPath,
    [string]$Name,
    [string]$Value
  )

  if (-not $Value) {
    return
  }

  $envPath = Join-Path $ProjectPath ".env.local"
  if (-not (Test-Path $envPath)) {
    return
  }

  $escapedName = [regex]::Escape($Name)
  $lines = Get-Content -LiteralPath $envPath
  $replacement = "$Name=$Value"
  if ($lines -match "^$escapedName=") {
    $lines = $lines -replace "^$escapedName=.*$", $replacement
  } else {
    $lines += $replacement
  }
  Set-Content -LiteralPath $envPath -Value $lines
}

foreach ($path in @($FrontendPath, $SigningPath)) {
  if (-not (Test-Path $path)) {
    throw "Project path not found: $path"
  }
  Ensure-EnvLocal -ProjectPath $path
}

foreach ($path in @($FrontendPath, $SigningPath)) {
  Set-EnvValue -ProjectPath $path -Name "VITE_API_BASE_URL" -Value "/api"
  Set-EnvValue -ProjectPath $path -Name "VITE_API_PROXY_TARGET" -Value $ApiBaseUrl
}
Set-EnvValue -ProjectPath $FrontendPath -Name "VITE_COGNITO_DOMAIN" -Value $CognitoDomain
Set-EnvValue -ProjectPath $FrontendPath -Name "VITE_COGNITO_CLIENT_ID" -Value $CognitoClientId

foreach ($path in @($FrontendPath, $SigningPath)) {
  $envPath = Join-Path $path ".env.local"
  if (Test-Path $envPath) {
    $content = Get-Content -LiteralPath $envPath -Raw
    if ($content -match "<[^>]+>") {
      Write-Warning "$envPath contains placeholder values. Pass -ApiBaseUrl, -CognitoDomain and -CognitoClientId or edit .env.local locally."
    }
  }
}

$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) {
  $pwsh = $pwshCommand.Source
} else {
  $pwsh = (Get-Command powershell -ErrorAction Stop).Source
}

Start-Process -FilePath $pwsh -WorkingDirectory $FrontendPath -ArgumentList @(
  "-NoExit",
  "-Command",
  "npm run dev -- --host 0.0.0.0 --port $FrontendPort"
) -WindowStyle Hidden

Start-Process -FilePath $pwsh -WorkingDirectory $SigningPath -ArgumentList @(
  "-NoExit",
  "-Command",
  "npm run dev -- --host 0.0.0.0 --port $SigningPort"
) -WindowStyle Hidden

$ip = $null
try {
  $ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress
} catch {
  $match = ipconfig | Select-String -Pattern "IPv4" | Select-Object -First 1
  if ($match) {
    $ip = $match.ToString().Split(":")[-1].Trim()
  }
}

Write-Host ""
Write-Host "Nennungstool lokal:      http://localhost:$FrontendPort"
Write-Host "Signing Terminal lokal:  http://localhost:$SigningPort"
if ($ip) {
  Write-Host "Signing Terminal Geraet: http://$($ip):$SigningPort"
}
