$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (!(Test-Path -LiteralPath '.env')) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  function New-LocalSecret {
    $bytes = New-Object byte[] 24
    $rng.GetBytes($bytes)
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
  }
  $config = [IO.File]::ReadAllText((Join-Path $projectRoot '.env.example'))
  $config = $config.Replace('firewatch-local-only', (New-LocalSecret))
  $config = $config.Replace('ChangeMe-FireWatch-2026!', (New-LocalSecret))
  $config = $config.Replace('ChangeMe-Manager-2026!', (New-LocalSecret))
  [IO.File]::WriteAllText((Join-Path $projectRoot '.env'), $config, (New-Object Text.UTF8Encoding $false))
  $rng.Dispose()
  Write-Host 'Created .env with unique local credentials. Read it to sign in.'
}
docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with Linux containers, then run this script again.' }
docker compose --profile demo up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed; inspect the output above.' }
Write-Host 'FireWatch: http://localhost:3002'
