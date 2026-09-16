param([Parameter(Mandatory=$true)][string]$Archive, [string]$TargetDir = ".\session_baileys")
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $Archive -PathType Leaf)) { throw "Archive not found: $Archive" }
Write-Host "DRY RUN ONLY - archive will not be extracted and WhatsApp will not be started."
$entries = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $Archive))
try { $entries.Entries | ForEach-Object { Write-Host $_.FullName } }
finally { $entries.Dispose() }
Write-Host "Reviewed target would be: $TargetDir"
Write-Host "Before a real restore: stop backend, copy current session aside, verify ownership, then extract."
