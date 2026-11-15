# Text to speech with the voices installed in Windows (System.Speech / SAPI).
# $env:OT_MODE = 'list': print "VOICE:<name>|<culture>|<gender>" for each enabled voice.
# Otherwise: read UTF-8 text from $env:OT_TEXT, speak it with $env:OT_VOICE at $env:OT_RATE (-10..10) into the WAV file $env:OT_OUT.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($env:OT_MODE -eq 'list') {
    foreach ($v in $synth.GetInstalledVoices()) {
      if ($v.Enabled) {
        $info = $v.VoiceInfo
        Write-Output ('VOICE:' + $info.Name + '|' + $info.Culture.Name + '|' + $info.Gender)
      }
    }
    exit 0
  }
  $text = [System.IO.File]::ReadAllText($env:OT_TEXT, [System.Text.Encoding]::UTF8)
  if ($env:OT_VOICE) {
    try { $synth.SelectVoice($env:OT_VOICE) } catch {}
  }
  $synth.Rate = [int]$env:OT_RATE
  $synth.SetOutputToWaveFile($env:OT_OUT)
  $synth.Speak($text)
  $synth.SetOutputToNull()
  Write-Output 'OK'
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
  exit 1
} finally {
  $synth.Dispose()
}
