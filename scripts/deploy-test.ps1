$ErrorActionPreference = 'Stop'

$expectedBranch = 'test-branch'
$expectedProject = 'manager-2026-test'
$expectedScope = 'roeis-projects-92336c3f'

Write-Host "[deploy:test] Validating branch and Vercel target..."

$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "Refusing deploy: current branch is '$branch'. Expected '$expectedBranch'."
}

if (-not (Test-Path '.vercel/project.json')) {
  Write-Host "[deploy:test] Linking Vercel project '$expectedProject'..."
  vercel link --project $expectedProject --scope $expectedScope --yes
}

$projectJson = Get-Content '.vercel/project.json' -Raw | ConvertFrom-Json
if ($projectJson.projectName -ne $expectedProject) {
  throw "Refusing deploy: linked Vercel project is '$($projectJson.projectName)'. Expected '$expectedProject'."
}

Write-Host "[deploy:test] Running build..."
npm run build

Write-Host "[deploy:test] Deploying to Vercel test project..."
# Same repo/public assets as prod: official brand logo is public/og-image.png (favicon, manifest, AppLayout).
vercel --prod --yes

Write-Host "[deploy:test] Done. Expected alias: https://manager-2026-test.vercel.app"
