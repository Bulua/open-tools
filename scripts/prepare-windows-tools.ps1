# 为 Tauri 准备仓库内固定版本的打包工具，整个过程不访问网络。
param(
  [string]$ToolsDirectory = (Join-Path $env:LOCALAPPDATA 'tauri')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $repoRoot 'vendor/windows'
$lock = Get-Content (Join-Path $repoRoot 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$cliVersion = $lock.packages['node_modules/@tauri-apps/cli'].version
if ($cliVersion -ne '2.12.4') {
  throw "Tauri CLI 已变为 $cliVersion，请核对并更新 vendor/windows 中的工具版本和校验值"
}

$expected = @{
  'nsis-3.13.zip' = 'BA63DFFC4410EE89193E1CB5A41989991BD77C61068DA17E3156D136B7B0B3D8'
  'nsis_tauri_utils-0.5.3.dll' = '5BA143B5DB4A87D32D6E7802E033330AAE56CBCEABE0D1E3BA41948385AD4709'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $vendor $name) -Algorithm SHA256).Hash
  if ($actual -ne $expected[$name]) { throw "打包依赖校验失败：$name" }
}

# 解压到独立临时目录，再复制完整工具集，保留压缩包内许可证等文件。
$staging = Join-Path ([IO.Path]::GetTempPath()) ('open-tools-nsis-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath (Join-Path $vendor 'nsis-3.13.zip') -DestinationPath $staging
$nsis = Join-Path $ToolsDirectory 'NSIS'
New-Item -ItemType Directory -Path $nsis -Force | Out-Null
Copy-Item -Path (Join-Path $staging 'nsis-3.13/*') -Destination $nsis -Recurse -Force
$plugin = Join-Path $nsis 'Plugins/x86-unicode/additional'
New-Item -ItemType Directory -Path $plugin -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $vendor 'nsis_tauri_utils-0.5.3.dll') -Destination (Join-Path $plugin 'nsis_tauri_utils.dll') -Force

# 与 Tauri 内置校验保持一致，确保它不会认为本地工具过期而重新下载。
if ((Get-FileHash (Join-Path $nsis 'NSIS.exe') -Algorithm SHA1).Hash -ne '6D45D4E8CCF18FE1FDAC9164058F356102A2ECF2') {
  throw 'NSIS.exe 与 Tauri 预期版本不一致'
}
if ((Get-FileHash (Join-Path $plugin 'nsis_tauri_utils.dll') -Algorithm SHA1).Hash -ne '75197FEE3C6A814FE035788D1C34EAD39349B860') {
  throw 'NSIS 辅助 DLL 与 Tauri 预期版本不一致'
}
Write-Host "已从仓库准备 Windows 打包工具：$nsis"
