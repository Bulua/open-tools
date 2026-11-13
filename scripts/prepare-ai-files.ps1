# Prepare the files hosted on ModelScope / Hugging Face for in-app AI downloads.
# Builds a folder laid out exactly like the hosting repos (models/..., runtime/<version>/win-x64/...),
# then prints each file's size and SHA-256 for the catalog in src-tauri/src/tools/image/shared/ai_models.rs.
#
# Usage (from the repo root, Windows PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/prepare-ai-files.ps1 -Out D:\ai-files
# Then upload everything under -Out to both repos, keeping the paths:
#   https://www.modelscope.cn/models/sebponk/open-tools-models
#   https://huggingface.co/penghui002/open-tools-models
# The repos' README.md and LICENSE.md come from scripts/ai-files.
# Keep this file ASCII only: Windows PowerShell 5.1 reads scripts without a BOM in the ANSI code page.

param(
  [Parameter(Mandatory = $true)][string]$Out,
  # Must match RUNTIME_VERSION in ai_models.rs and the api-NN feature of ort in Cargo.toml.
  # 1.24.4 is the last ONNX Runtime release published with DirectML; its package depends on DirectML 1.15.4
  [string]$OrtVersion = '1.24.4',
  [string]$DirectMLVersion = '1.15.4'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-File($url, $path) {
  if (Test-Path $path) { return }
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile "$path.part" -UseBasicParsing
  Move-Item "$path.part" $path
}

# Extract one file from a NuGet package (a zip archive)
function Get-FromNuGet($package, $version, $inner, $path) {
  if (Test-Path $path) { return }
  $tmp = Join-Path $env:TEMP "open-tools-nuget-$package-$version"
  $zip = "$tmp.zip"
  Get-File "https://www.nuget.org/api/v2/package/$package/$version" $zip
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Path $zip -DestinationPath $tmp
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  Copy-Item (Join-Path $tmp $inner) $path
  Remove-Item -Recurse -Force $tmp
}

# Background removal models from the rembg project's GitHub releases
$models = Join-Path $Out 'models'
foreach ($id in 'u2netp', 'silueta', 'isnet-general-use', 'u2net_human_seg') {
  Get-File "https://github.com/danielgatis/rembg/releases/download/v0.0.0/$id.onnx" (Join-Path $models "$id.onnx")
}

# Inpainting models for watermark removal (saved under shorter names, file contents unchanged)
# LaMa (Apache-2.0), ONNX export by Carve; the fp32 export is the one its README recommends
Get-File 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx' (Join-Path $models 'lama.onnx')
# MI-GAN (MIT), ONNX export from the Hugging Face repo linked in the MI-GAN README
Get-File 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan.onnx' (Join-Path $models 'migan.onnx')

# ONNX Runtime with DirectML, and the DirectML library it loads
$runtime = Join-Path $Out "runtime\$OrtVersion\win-x64"
Get-FromNuGet 'Microsoft.ML.OnnxRuntime.DirectML' $OrtVersion 'runtimes\win-x64\native\onnxruntime.dll' (Join-Path $runtime 'onnxruntime.dll')
Get-FromNuGet 'Microsoft.AI.DirectML' $DirectMLVersion 'bin\x64-win\DirectML.dll' (Join-Path $runtime 'DirectML.dll')

# README.md and LICENSE.md for the hosting repos
Copy-Item (Join-Path $PSScriptRoot 'ai-files\*.md') $Out

Write-Host ''
Write-Host 'Catalog entries for src-tauri/src/tools/image/shared/ai_models.rs:'
$root = (Resolve-Path $Out).Path.TrimEnd('\') + '\'
Get-ChildItem -Recurse -File $Out | Where-Object { $_.Extension -notin '.part', '.md' } | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).Replace('\', '/')
  $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  Write-Host ('RemoteFile {{ path: "{0}", size: {1}, sha256: "{2}" }}' -f $rel, $_.Length, $hash)
}
