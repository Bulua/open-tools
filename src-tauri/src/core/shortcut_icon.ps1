# Point the app's shortcuts (desktop, Start menu, pinned taskbar) at another icon.
# $env:OT_EXE: full path of the running exe; only shortcuts that open it are changed.
# $env:OT_ICON: .ico file to use; empty means the icon built into the exe.
# Prints "CHANGED:<path>" for each shortcut it rewrote.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$exe = $env:OT_EXE
$icon = if ($env:OT_ICON) { $env:OT_ICON + ',0' } else { $exe + ',0' }

# Desktop folders hold the shortcuts directly; Start menu shortcuts sit in a sub folder
$flat = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
)
$deep = @(
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms')
)

$files = @()
foreach ($dir in $flat) {
  if ($dir -and (Test-Path -LiteralPath $dir)) { $files += Get-ChildItem -LiteralPath $dir -Filter *.lnk -ErrorAction SilentlyContinue }
}
foreach ($dir in $deep) {
  if ($dir -and (Test-Path -LiteralPath $dir)) { $files += Get-ChildItem -LiteralPath $dir -Filter *.lnk -Recurse -ErrorAction SilentlyContinue }
}

$shell = New-Object -ComObject WScript.Shell
$changed = 0
foreach ($file in $files) {
  try {
    $lnk = $shell.CreateShortcut($file.FullName)
    if ($lnk.TargetPath -ieq $exe -and $lnk.IconLocation -ne $icon) {
      $lnk.IconLocation = $icon
      $lnk.Save()
      $changed++
      Write-Output ('CHANGED:' + $file.FullName)
    }
  } catch {
    # Shortcuts for all users need admin rights; skip them
  }
}

# Ask Explorer to refresh its icon cache so the new icon shows up without a restart
if ($changed -gt 0) {
  Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
}
