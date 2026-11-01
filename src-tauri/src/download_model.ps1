# Download a file from $env:OT_URL to $env:OT_OUT using the system proxy settings.
# Prints "OK" on success, "ERR:<message>" on failure.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
  $client = New-Object System.Net.WebClient
  $client.Headers.Add('User-Agent', 'OpenTools')
  $client.DownloadFile($env:OT_URL, $env:OT_OUT)
  Write-Output 'OK'
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
  exit 1
}
