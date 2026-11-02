# Convert a PDF to .docx with Microsoft Word (Word 2013 and later can open PDFs and reflow them into an editable document).
# WPS and LibreOffice are not used: WPS needs a paid membership for this, LibreOffice only produces floating text boxes.
# Input:  $env:OT_IN (pdf path), $env:OT_OUT (docx path)
# Output: "OK" on success; "NONE" when Word is not installed; "ERR:<message>" otherwise.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:OT_IN
$out = $env:OT_OUT

if (-not (Test-Path 'Registry::HKEY_CLASSES_ROOT\Word.Application')) { Write-Output 'NONE'; exit 2 }

try {
  $app = New-Object -ComObject Word.Application
  $doc = $null
  try {
    try { $app.Visible = $false } catch {}
    # wdAlertsNone: skips the "Word will now convert your PDF" prompt
    try { $app.DisplayAlerts = 0 } catch {}
    # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument)
    # A dummy password makes password-protected files fail at once instead of showing a prompt.
    $doc = $app.Documents.Open($in, $false, $true, $false, 'open-tools-no-password')
    # 16 = wdFormatDocumentDefault (.docx)
    $doc.SaveAs2($out, 16)
  } finally {
    if ($doc) { try { $doc.Close(0) } catch {} }
    # Only quit when no other document is open, so the user's own Word windows are left alone.
    try { if ($app.Documents.Count -eq 0) { $app.Quit() } } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
  if (Test-Path $out) { Write-Output 'OK'; exit 0 }
  Write-Output 'ERR:no output'
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}
exit 1
