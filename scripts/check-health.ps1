param([string]$BaseUrl = "http://127.0.0.1:3000")
$ErrorActionPreference = "Stop"
foreach ($path in @("/health/live", "/health/ready")) {
  $response = Invoke-WebRequest -Uri ($BaseUrl + $path) -UseBasicParsing
  Write-Host "${path}: $($response.StatusCode) $($response.Content)"
}
