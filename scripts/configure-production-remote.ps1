# Idempotent: production remote only ever pushes local master -> remote master; default push target is origin.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

$productionUrl = if ($env:FLEET_PRODUCTION_GIT_URL) { $env:FLEET_PRODUCTION_GIT_URL.Trim() } else { 'https://github.com/malachiroei/fleet-manager-2026.git' }

$names = git remote
if ($names -notcontains 'production') {
  git remote add production $productionUrl
} else {
  git remote set-url production $productionUrl
}
git config remote.production.push refs/heads/master:refs/heads/master
git config remote.pushDefault origin
Write-Host "OK: remote production -> $productionUrl (push: master only); pushDefault=origin"
