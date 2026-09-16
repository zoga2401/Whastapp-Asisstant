param([string]$SessionDir = ".\session_baileys", [string]$OutputDir = ".\backups\baileys")
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $SessionDir -PathType Container)) { throw "Session directory not found" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $OutputDir "baileys-$stamp.zip"
Compress-Archive -Path (Join-Path $SessionDir "*") -DestinationPath $archive -CompressionLevel Optimal
Write-Host "Baileys credentials archived to $archive. Protect this file like a password."
