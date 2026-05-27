param(
  [string]$Stage = "dev",
  [string]$Region = "eu-central-1"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env.local"
$stackName = "dreiecksrennen-$Stage-api-stack"

$apiUrl = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" `
  --output text

if (-not $apiUrl -or $apiUrl.Trim() -eq "" -or $apiUrl.Trim() -eq "None") {
  throw "CloudFormation output ApiUrl was not found for stack $stackName."
}

$apiUrl = $apiUrl.Trim().TrimEnd("/")

Set-Content -Path $envPath -Encoding UTF8 -Value @(
  "VITE_API_BASE_URL=/api",
  "VITE_API_PROXY_TARGET=$apiUrl"
)

Write-Host "Updated terminal .env.local for $Stage API: $apiUrl"
