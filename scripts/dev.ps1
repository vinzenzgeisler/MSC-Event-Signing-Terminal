param(
  [ValidateSet("start", "stop", "reset")]
  [string]$Command = "start",
  [string]$Stage = "dev",
  [string]$Region = "eu-central-1",
  [string]$AwsProfile = "verein",
  [switch]$DeployBackend = $false,
  [string]$DevProfile = "test",
  [string]$FrontendBranch = $null,
  [string]$FrontendRepoPath = $null,
  [string]$BackendRepoPath = $null
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $AwsProfile

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourceRoot = Split-Path $repoRoot -Parent
$cacheDir = Join-Path $repoRoot ".cache"
$cacheFile = Join-Path $cacheDir "api-url.json"
$envPath = Join-Path $repoRoot ".env.development.local"
$frontendPath = Resolve-Path ($FrontendRepoPath ?? (Join-Path $sourceRoot "MSC-Event-Frontend"))
$backendPath = Resolve-Path ($BackendRepoPath ?? (Join-Path $sourceRoot "MSC-Event-Backend"))
$cacheTtlSeconds = 3600

function Ensure-Cache-Dir {
  if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  }
}

function Get-Current-Branch {
  param([string]$RepoPath)
  Push-Location $RepoPath
  try {
    return git rev-parse --abbrev-ref HEAD
  } finally {
    Pop-Location
  }
}

function Get-Cached-ApiUrl {
  if (-not (Test-Path $cacheFile)) {
    return $null
  }

  try {
    $cache = Get-Content -Path $cacheFile -Raw | ConvertFrom-Json
    $age = [int]((Get-Date) - [datetime]$cache.timestamp).TotalSeconds

    if ($age -lt $cacheTtlSeconds) {
      Write-Host "✓ Using cached API URL (age: ${age}s)" -ForegroundColor Green
      return $cache.url
    }
  } catch {
    # Cache corrupt or invalid, ignore
  }

  return $null
}

function Get-Env-Local-ApiUrl {
  if (-not (Test-Path $envPath)) {
    return $null
  }

  $envContent = Get-Content -Path $envPath -Raw
  if ($envContent -match 'VITE_API_PROXY_TARGET=(.+)') {
    return $matches[1].Trim()
  }

  return $null
}

function Fetch-ApiUrl {
  Write-Host "⟳ Fetching API URL from CloudFormation..." -ForegroundColor Blue

  $stackName = "dreiecksrennen-$Stage-api-stack"

  $apiUrl = aws cloudformation describe-stacks `
    --stack-name $stackName `
    --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" `
    --output text 2>&1

  if ($LASTEXITCODE -eq 0 -and $apiUrl -and $apiUrl -ne "None") {
    return ($apiUrl.Trim().TrimEnd("/"))
  }

  Write-Host ""
  Write-Host "✗ Could not fetch API URL from CloudFormation" -ForegroundColor Yellow
  Write-Host "  Stack: $stackName" -ForegroundColor Gray
  Write-Host "  Output: $apiUrl" -ForegroundColor Gray
  throw "Failed to fetch API URL"
}

function Cache-ApiUrl {
  param([string]$ApiUrl)

  Ensure-Cache-Dir

  $cache = @{
    url = $ApiUrl
    timestamp = (Get-Date).ToString("o")
  }

  $cache | ConvertTo-Json | Set-Content -Path $cacheFile -Encoding UTF8
  Write-Host "✓ Cached API URL" -ForegroundColor Green
}

function Update-Env-Local {
  param([string]$ApiUrl, [string]$ProjectPath)

  # .env.development.local has highest Vite priority and overrides .env.development
  $envPath = Join-Path $ProjectPath ".env.development.local"
  Set-Content -Path $envPath -Encoding UTF8 -Value @(
    "VITE_API_BASE_URL=/api",
    "VITE_API_PROXY_TARGET=$ApiUrl"
  )

  Write-Host "✓ Updated $(Split-Path $ProjectPath -Leaf)/.env.development.local" -ForegroundColor Green
}

function Deploy-Backend-If-Needed {
  if (-not $DeployBackend) {
    return
  }

  Write-Host ""
  Write-Host "Deploying backend..." -ForegroundColor Cyan
  Write-Host ""

  & (Join-Path $PSScriptRoot "deploy-backend.ps1") `
    -BackendRepo $backendPath `
    -DevProfile $DevProfile `
    -Wait

  # Invalidate cache after backend deploy - new API Gateway URL
  Reset-Cache
  Write-Host "✓ Cleared API URL cache (new API Gateway deployed)" -ForegroundColor Green

  Write-Host ""
  Write-Host "Waiting for CloudFormation stacks to stabilize..." -ForegroundColor Yellow
  Start-Sleep -Seconds 10
}

function Start-DevServers {
  $backendBranch = Get-Current-Branch $backendPath
  $terminalBranch = Get-Current-Branch $repoRoot

  if (-not $FrontendBranch) {
    $availableBranches = @(git -C $frontendPath branch --sort=-committerdate --format="%(refname:short)" 2>$null)
    $currentFrontend = Get-Current-Branch $frontendPath

    Write-Host ""
    Write-Host "Available frontend branches:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $availableBranches.Count; $i++) {
      $marker = if ($availableBranches[$i] -eq $currentFrontend) { " (current)" } else { "" }
      Write-Host "  [$($i+1)] $($availableBranches[$i])$marker" -ForegroundColor Gray
    }
    Write-Host ""
    $input = Read-Host "Frontend branch [Enter = keep '$currentFrontend']"

    if (-not $input) {
      $FrontendBranch = $currentFrontend
    } elseif ($input -match '^\d+$' -and [int]$input -ge 1 -and [int]$input -le $availableBranches.Count) {
      $FrontendBranch = $availableBranches[[int]$input - 1]
    } else {
      $FrontendBranch = $input
    }
  }

  Write-Host ""
  Write-Host "Branch Configuration:" -ForegroundColor Cyan
  Write-Host "  Backend:  $backendBranch" -ForegroundColor Gray
  Write-Host "  Terminal: $terminalBranch" -ForegroundColor Gray
  Write-Host "  Frontend: $FrontendBranch" -ForegroundColor Gray
  Write-Host ""

  Deploy-Backend-If-Needed

  $apiUrl = $null

  # Try cache first
  $apiUrl = Get-Cached-ApiUrl
  if ($apiUrl) {
    Write-Host "✓ Using cached API URL" -ForegroundColor Green
  }

  # If no cache, ALWAYS fetch fresh from CloudFormation
  if (-not $apiUrl) {
    Write-Host "Fetching fresh API URL from CloudFormation..." -ForegroundColor Cyan
    try {
      $apiUrl = Fetch-ApiUrl
      if ($apiUrl) {
        Cache-ApiUrl -ApiUrl $apiUrl
        Write-Host "✓ Fetched and cached API URL" -ForegroundColor Green
      }
    } catch {
      # If fetch fails, try old .env.local as fallback
      Write-Host "⚠ CloudFormation fetch failed, trying existing .env.local..." -ForegroundColor Yellow
      $apiUrl = Get-Env-Local-ApiUrl
      if ($apiUrl) {
        Write-Host "✓ Using API URL from existing .env.local (may be outdated)" -ForegroundColor Yellow
      }
    }
  }

  if (-not $apiUrl) {
    throw "Could not determine API URL from any source"
  }

  Write-Host ""
  Write-Host "Updating .env.local files with API URL..." -ForegroundColor Cyan
  Update-Env-Local -ApiUrl $apiUrl -ProjectPath $repoRoot
  Update-Env-Local -ApiUrl $apiUrl -ProjectPath $frontendPath
  Write-Host ""

  # Verify .env.development.local was updated
  $terminalEnv = Get-Content -Path (Join-Path $repoRoot ".env.development.local") -Raw
  $frontendEnv = Get-Content -Path (Join-Path $frontendPath ".env.development.local") -Raw

  if ($terminalEnv -notmatch [regex]::Escape($apiUrl)) {
    Write-Host "✗ WARNING: Terminal .env.development.local not updated correctly" -ForegroundColor Yellow
  }
  if ($frontendEnv -notmatch [regex]::Escape($apiUrl)) {
    Write-Host "✗ WARNING: Frontend .env.development.local not updated correctly" -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "Starting development servers..." -ForegroundColor Cyan
  Write-Host "  Terminal:  http://localhost:5178" -ForegroundColor Gray
  Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor Gray
  Write-Host "  API:       $apiUrl" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Yellow
  Write-Host ""

  # Checkout frontend branch if needed
  $currentFrontendBranch = Get-Current-Branch $frontendPath
  if ($currentFrontendBranch -ne $FrontendBranch) {
    Write-Host "Switching frontend to branch: $FrontendBranch" -ForegroundColor Blue
    Push-Location $frontendPath
    try {
      git checkout $FrontendBranch 2>&1 | Out-Null
    } catch {
      Write-Host "⚠ Could not checkout frontend branch $FrontendBranch" -ForegroundColor Yellow
    }
    Pop-Location
  }

  $pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $pwsh) {
    $pwsh = (Get-Command powershell).Source
  }

  $terminalProcess = Start-Process -FilePath $pwsh -WorkingDirectory $repoRoot -ArgumentList "-NoExit", "-Command", "npm run dev" -PassThru -WindowStyle Hidden
  $frontendProcess = Start-Process -FilePath $pwsh -WorkingDirectory $frontendPath -ArgumentList "-NoExit", "-Command", "npm run dev" -PassThru -WindowStyle Hidden

  Write-Host "✓ Servers started" -ForegroundColor Green
  Write-Host "  Terminal PID:  $($terminalProcess.Id)" -ForegroundColor Gray
  Write-Host "  Frontend PID:  $($frontendProcess.Id)" -ForegroundColor Gray
  Write-Host ""

  try {
    while ($true) {
      Start-Sleep -Seconds 5

      if ($terminalProcess.HasExited) {
        Write-Host "✗ Terminal process exited" -ForegroundColor Red
        break
      }

      if ($frontendProcess.HasExited) {
        Write-Host "✗ Frontend process exited" -ForegroundColor Red
        break
      }
    }
  } catch {
    Write-Host "Error: $_" -ForegroundColor Red
  } finally {
    Write-Host ""
    Write-Host "Stopping servers..." -ForegroundColor Yellow

    try { $terminalProcess | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }
    try { $frontendProcess | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }

    Write-Host "✓ Servers stopped" -ForegroundColor Green
  }
}

function Stop-DevServers {
  $jobs = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "(npm|vite)" }

  if ($jobs.Count -eq 0) {
    Write-Host "No running dev servers found" -ForegroundColor Yellow
    return
  }

  Write-Host "Stopping development servers..." -ForegroundColor Yellow

  $jobs | Stop-Process -Force -ErrorAction SilentlyContinue

  Write-Host "✓ All servers stopped" -ForegroundColor Green
}

function Reset-Cache {
  Ensure-Cache-Dir

  if (Test-Path $cacheFile) {
    Remove-Item -Path $cacheFile -Force
    Write-Host "✓ Cleared API URL cache" -ForegroundColor Green
  }
}

switch ($Command) {
  "start" {
    Start-DevServers
  }
  "stop" {
    Stop-DevServers
  }
  "reset" {
    Reset-Cache
    Write-Host "✓ Reset complete. Run './dev.ps1 start' to fetch fresh API URL" -ForegroundColor Green
  }
}
