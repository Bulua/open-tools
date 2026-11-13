# Convert a document to PDF with the office suite installed on this computer.
# Tries Microsoft Word, then WPS, then LibreOffice.
# Input:  $env:OT_IN (document path), $env:OT_OUT (pdf path), $env:OT_SOFFICE (soffice.exe path, optional)
# Output: "OK:<engine>" on success; "NONE" when no office suite is installed; "ERR:<engine>: <message>" lines otherwise.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:OT_IN
$out = $env:OT_OUT
$errors = @()
$found = $false

function Convert-WithCom([string]$progId) {
  $app = New-Object -ComObject $progId
  $doc = $null
  try {
    try { $app.Visible = $false } catch {}
    try { $app.DisplayAlerts = 0 } catch {}
    # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument)
    # A dummy password makes password-protected files fail at once instead of showing a prompt.
    $doc = $app.Documents.Open($in, $false, $true, $false, 'open-tools-no-password')
    try {
      $doc.ExportAsFixedFormat($out, 17)
    } catch {
      $doc.SaveAs2($out, 17)
    }
  } finally {
    if ($doc) { try { $doc.Close(0) } catch {} }
    # Only quit when no other document is open, so the user's own Word windows are left alone.
    try { if ($app.Documents.Count -eq 0) { $app.Quit() } } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
}

foreach ($id in @('Word.Application', 'KWps.Application')) {
  if (-not (Test-Path ('Registry::HKEY_CLASSES_ROOT\' + $id))) { continue }
  $found = $true
  try {
    Convert-WithCom $id
    if (Test-Path $out) { Write-Output "OK:$id"; exit 0 }
    $errors += "${id}: no output"
  } catch {
    $errors += "${id}: $($_.Exception.Message)"
  }
}

$soffice = $env:OT_SOFFICE
if ($soffice -and (Test-Path $soffice)) {
  $found = $true
  try {
    $dir = Split-Path $out
    & $soffice --headless --convert-to pdf --outdir $dir $in | Out-Null
    $produced = Join-Path $dir ([System.IO.Path]::GetFileNameWithoutExtension($in) + '.pdf')
    if (Test-Path $produced) {
      if ($produced -ne $out) { Move-Item $produced $out -Force }
      Write-Output 'OK:LibreOffice'
      exit 0
    }
    $errors += 'LibreOffice: no output'
  } catch {
    $errors += "LibreOffice: $($_.Exception.Message)"
  }
}

if (-not $found) { Write-Output 'NONE'; exit 2 }
$errors | ForEach-Object { Write-Output "ERR:$_" }
exit 1
