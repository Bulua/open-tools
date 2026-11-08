# Windows 打包依赖

这里保存 Tauri CLI 2.12.4 使用的官方原始文件（未修改），避免 Windows CI 打包时依赖上游 Release 下载服务的即时可用性。总大小约 2.4 MB，直接纳入 Git，不使用 Git LFS。

| 文件 | 官方来源 | SHA-256 |
| --- | --- | --- |
| `nsis-3.13.zip` | https://github.com/tauri-apps/binary-releases/releases/tag/nsis-3.13 | `ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8` |
| `nsis_tauri_utils-0.5.3.dll` | https://github.com/tauri-apps/nsis-tauri-utils/releases/tag/nsis_tauri_utils-v0.5.3 | `5ba143b5db4a87d32d6e7802e033330aae56cbceabe0d1e3ba41948385ad4709` |

NSIS 的许可证及第三方声明保留在压缩包的 `COPYING` 等原始文件中。辅助 DLL 使用 Apache-2.0，许可证见本目录 `nsis-tauri-utils-LICENSE`；源代码位于上述官方仓库对应标签。

工作流通过 `scripts/prepare-windows-tools.ps1` 校验 SHA-256，将文件放入 `%LOCALAPPDATA%\tauri\NSIS`，并检查 Tauri 使用的 SHA-1。这个准备步骤不访问网络，也不需要已存在的 Actions 缓存。其他构建依赖（npm、Cargo 等）仍按原工作流获取。

升级 Tauri CLI 时，应先核对对应版本的 `tauri-bundler/src/bundle/windows/nsis/mod.rs` 中下载地址及校验值，再同步更新本目录文件、说明和准备脚本。脚本遇到不同 CLI 版本会明确报错，避免静默回退到网络下载。

在 PowerShell 7 中可单独验证：

```powershell
./scripts/prepare-windows-tools.ps1
```
