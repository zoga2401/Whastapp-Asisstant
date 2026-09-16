param(
  [string]$OutputDir = ".\backups\postgres",
  [string]$Database = $env:DB_NAME,
  [string]$Host = $env:DB_HOST,
  [string]$Port = $env:DB_PORT,
  [string]$User = $env:DB_USER
)
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Database)) { throw "Set DB_NAME or pass -Database" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutputDir "zoga-$stamp.dump"
Write-Host "Creating PostgreSQL custom-format backup: $file"
& pg_dump --format=custom --no-owner --no-privileges --file=$file `
  --dbname=$Database --host=$Host --port=$Port --username=$User
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
Write-Host "Backup complete. Verify with: pg_restore --list $file"
