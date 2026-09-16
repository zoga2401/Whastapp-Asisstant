param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "Backup file not found: $BackupFile" }
Write-Host "DRY RUN ONLY - no database connection or writes will be made."
Write-Host "Archive contents:"
& pg_restore --list --file=$BackupFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore archive validation failed" }
Write-Host "To restore, use a reviewed change window and an explicit, separately approved command."
