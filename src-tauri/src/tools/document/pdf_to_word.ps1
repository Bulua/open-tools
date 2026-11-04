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

# Word asks "Word will now convert your PDF to an editable Word document" before opening a PDF.
# DisplayAlerts does not hide this prompt on every machine; a hidden prompt blocks until the timeout.
# The DisableConvertPdfWarning option turns it off. Set it only for this conversion and restore the old value afterwards.
$optionsKey = $null
$oldWarning = $null
try {
  $curVer = (Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\Word.Application\CurVer' -ErrorAction Stop).'(default)'
  if ($curVer -match '\.(\d+)$') {
    $optionsKey = "HKCU:\Software\Microsoft\Office\$($Matches[1]).0\Word\Options"
    if (-not (Test-Path $optionsKey)) { New-Item $optionsKey -Force | Out-Null }
    $oldWarning = (Get-ItemProperty $optionsKey -Name DisableConvertPdfWarning -ErrorAction SilentlyContinue).DisableConvertPdfWarning
    Set-ItemProperty $optionsKey -Name DisableConvertPdfWarning -Value 1 -Type DWord
  }
} catch { $optionsKey = $null }

# Safety net in case the prompt still shows up (for example when a policy overrides the option):
# a background thread presses OK on message boxes (#32770 dialogs) of the Word process started here.
# Word windows the user opened belong to other processes and are never touched.
$closer = $true
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class OtDialogCloser {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
  static volatile bool running;
  public static void Start(uint pid) {
    running = true;
    var t = new Thread(() => {
      while (running) {
        EnumWindows((hwnd, l) => {
          uint owner;
          GetWindowThreadProcessId(hwnd, out owner);
          if (owner != pid) return true;
          var name = new StringBuilder(64);
          GetClassName(hwnd, name, 64);
          // WM_COMMAND with IDOK: the same as clicking OK
          if (name.ToString() == "#32770") PostMessage(hwnd, 0x0111, (IntPtr)1, IntPtr.Zero);
          return true;
        }, IntPtr.Zero);
        Thread.Sleep(300);
      }
    });
    t.IsBackground = true;
    t.Start();
  }
  public static void Stop() { running = false; }
}
'@
} catch { $closer = $false }

$code = 1
try {
  $before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $app = New-Object -ComObject Word.Application
  $doc = $null
  $mine = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id })
  if ($closer -and $mine.Count -eq 1) { [OtDialogCloser]::Start([uint32]$mine[0].Id) }
  try {
    try { $app.Visible = $false } catch {}
    try { $app.ScreenUpdating = $false } catch {}
    # wdAlertsNone
    try { $app.DisplayAlerts = 0 } catch {}
    # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument)
    # A dummy password makes password-protected files fail at once instead of showing a prompt.
    $doc = $app.Documents.Open($in, $false, $true, $false, 'open-tools-no-password')
    # 16 = wdFormatDocumentDefault (.docx)
    $doc.SaveAs2($out, 16)
  } finally {
    if ($closer) { [OtDialogCloser]::Stop() }
    if ($doc) { try { $doc.Close(0) } catch {} }
    # Only quit when no other document is open, so the user's own Word windows are left alone.
    try { if ($app.Documents.Count -eq 0) { $app.Quit() } } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
  if (Test-Path $out) { Write-Output 'OK'; $code = 0 }
  else { Write-Output 'ERR:no output' }
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
} finally {
  if ($optionsKey) {
    try {
      if ($null -eq $oldWarning) { Remove-ItemProperty $optionsKey -Name DisableConvertPdfWarning -ErrorAction SilentlyContinue }
      else { Set-ItemProperty $optionsKey -Name DisableConvertPdfWarning -Value $oldWarning -Type DWord }
    } catch {}
  }
}
exit $code
