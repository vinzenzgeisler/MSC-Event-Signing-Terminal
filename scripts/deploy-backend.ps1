param(
  [string]$BackendRepo = $null,
  [string]$DevProfile = "test",
  [switch]$Wait = $true
)

$ErrorActionPreference = "Stop"

if (-not $BackendRepo) {
  $sourceRoot = Split-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) -Parent
  $BackendRepo = Join-Path $sourceRoot "MSC-Event-Backend"
}

if (-not (Test-Path $BackendRepo)) {
  throw "Backend repository not found: $BackendRepo"
}

Push-Location $BackendRepo

try {
  $branch = git rev-parse --abbrev-ref HEAD
  Write-Host ""
  Write-Host "Triggering Backend CI/CD pipeline..." -ForegroundColor Cyan
  Write-Host "  Branch:      $branch" -ForegroundColor Gray
  Write-Host "  Dev Profile: $DevProfile" -ForegroundColor Gray
  Write-Host ""

  gh workflow run ci-cd.yml `
    --ref $branch `
    -f dev_profile=$DevProfile `
    -f deploy_shared_dev=true

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to trigger workflow. Make sure you're authenticated: gh auth login"
  }

  Write-Host "✓ Workflow triggered" -ForegroundColor Green
  Write-Host ""

  $repoInfo = gh repo view --json nameWithOwner -q '.nameWithOwner' 2>$null
  if ($repoInfo) {
    Write-Host "Monitor progress at:" -ForegroundColor Gray
    Write-Host "https://github.com/$repoInfo/actions" -ForegroundColor Blue
  }
  Write-Host ""

  if ($Wait) {
    Write-Host "Waiting for workflow to complete (max 30min)..." -ForegroundColor Yellow
    Write-Host ""

    $maxWaitSeconds = 1800
    $checkIntervalSeconds = 15
    $elapsed = 0
    $lastCheck = Get-Date

    while ($elapsed -lt $maxWaitSeconds) {
      Start-Sleep -Seconds $checkIntervalSeconds

      try {
        $runList = gh run list --workflow ci-cd.yml --branch $branch --limit 1 --json status,conclusion 2>&1 | Out-String

        if ($runList -match "status") {
          $runList | ForEach-Object {
            if ($_ -match '"status":"(in_progress|queued)"') {
              Write-Host "." -NoNewline
            } elseif ($_ -match '"conclusion":"success"') {
              Write-Host ""
              Write-Host ""
              Write-Host "✓ Workflow completed successfully!" -ForegroundColor Green
              Write-Host ""
              Write-Host "Backend deployed. Waiting for CloudFormation to stabilize..." -ForegroundColor Gray
              Start-Sleep -Seconds 10
              return
            } elseif ($_ -match '"conclusion":"failure"') {
              Write-Host ""
              throw "Workflow failed. Check logs at GitHub."
            }
          }
        }
      } catch {
        Write-Host "." -NoNewline
      }

      $elapsed += $checkIntervalSeconds
    }

    Write-Host ""
    Write-Host "⟳ Workflow still running (check GitHub for details)" -ForegroundColor Yellow

  } else {
    Write-Host "✓ Workflow queued. Monitor progress in GitHub Actions." -ForegroundColor Green
  }

} finally {
  Pop-Location
}

