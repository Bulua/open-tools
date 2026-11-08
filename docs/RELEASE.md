# 发布指南

## 两种打包

| 触发方式 | 结果 |
| --- | --- |
| 推送到 `master` | 云端编译，在 [Actions](https://github.com/Bulua/open-tools/actions) 页面的 Artifacts 中下载 exe 与安装包，供测试使用 |
| 推送 `v` 开头的标签 | 发布到 [Releases](https://github.com/Bulua/open-tools/releases)，并生成在线更新文件，已安装的程序会收到更新 |

Android 流程也会在推送标签时构建，并在 Windows 流程创建 Release 后附加 ARM64 测试 APK。两个平台独立运行，APK 可能稍晚出现；APK 当前使用调试签名，尚不是正式签名版本。推送 `master` 或手动运行 Android 流程时，APK 只上传到 Actions 的 Artifacts。

需要补传已有 APK 时，在 Actions 中手动运行 `Attach Android APK`，填写 Release 标签和成功的 Android 构建运行编号。流程会核对提交与标签一致后上传，且不会覆盖已有的同名附件；源 Artifact 必须尚未过期。

配置了 `GITEE_TOKEN` 后，每次推送都会把代码同步到 [Gitee](https://gitee.com/bulua/open-tools)，发布版本时安装包也会发到 Gitee Releases，日常只推送 GitHub 即可。

## 发布新版本

版本号只在 `package.json` 中维护，程序版本会自动读取它。

1. 修改版本号并提交：

   ```bash
   npm version 0.2.0 --no-git-tag-version
   ```

   ```bash
   git commit -am "chore: 发布 v0.2.0"
   ```

2. 打带说明的标签并推送。`-m` 后面的文字就是用户在更新对话框中看到的「更新内容」，可以写多行：

   ```bash
   git tag -a v0.2.0 -m "新增图片工具；界面重新设计"
   ```

   更新内容可以按语言分段，用户看到的是自己界面语言的那一段。每段前面单独一行写 `<!-- 语言代码 -->`，开头没有标记的部分是中文：

   ```text
   - 新增图片工具
   - 界面重新设计
   <!-- en -->
   - Added image tools
   - Redesigned the interface
   <!-- ja -->
   - 画像ツールを追加
   - インターフェースを刷新
   ```

   当前语言没有对应的段落时，先显示英文段落，再显示中文。只写中文也可以，所有语言都显示中文。这些标记在 GitHub Release 页面上不显示。
   多行的说明可以先写进文件，再用 `git tag -a v0.2.0 -F notes.txt` 打标签。不写说明时，自动从提交记录生成的说明只有中文。

   ```bash
   git push origin master v0.2.0
   ```

3. 等待 GitHub Actions 完成（约 10 分钟），Releases 页面会出现新版本，包含：
   - `Open Tools_0.2.0_x64-setup.exe`：安装包
   - `Open Tools_0.2.0_x64-setup.exe.sig`：更新包签名
   - `latest.json`：在线更新信息
   - `OpenTools_0.2.0_arm64-v8a.apk`：Android ARM64 测试安装包（由 Android 流程附加）

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：修复问题升第三位（0.2.1），新增功能升第二位（0.3.0）。

## 在线更新的原理

1. 程序启动几秒后，依次尝试读取下面两个地址，先读到哪个就用哪个：
   - Gitee：`https://gitee.com/bulua/open-tools/raw/updater/latest.json`（安装包从 Gitee Releases 下载，国内更快）
   - GitHub：`https://github.com/Bulua/open-tools/releases/latest/download/latest.json`
2. 如果其中的版本号比当前版本新，右上角显示「新版本」提示。
3. 用户确认后下载安装包，**校验签名**通过才会安装，安装完成后程序自动重启。

相关配置在 `src-tauri/tauri.conf.json` 的 `plugins.updater` 中。

Gitee 的更新文件由 `scripts/publish-gitee.mjs` 生成：把 GitHub Release 中的安装包上传到 Gitee Releases，再把 `latest.json` 中的下载地址换成 Gitee 的，写到 Gitee 的 `updater` 分支（与 `master` 分开，不影响代码历史）。签名只和安装包内容有关，换下载地址不影响校验。

> 0.5.1 及更早的版本只认 GitHub 地址，需要先从 GitHub 更新一次，之后才会走 Gitee。

## Gitee 同步

1. 在 Gitee 打开 设置 → 私人令牌，生成一个令牌，勾选 `projects` 权限。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加 `GITEE_TOKEN`，值为该令牌。
3. Gitee 仓库需要保持**公开**，否则程序读不到更新文件。

没有配置 `GITEE_TOKEN` 时会跳过同步，不影响 GitHub 的打包与发布。

## 签名密钥

更新包必须签名，程序只会安装签名正确的更新，防止被伪造。

| | 位置 | 说明 |
| --- | --- | --- |
| 公钥 | `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` | 随程序发布，可以公开 |
| 私钥 | 本机 `C:\Users\<用户名>\.tauri\open-tools.key` | **绝不能提交到仓库** |

### 在 GitHub 中配置私钥

打开仓库的 Settings → Secrets and variables → Actions → New repository secret：

| Name | Secret |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件的全部内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（当前未设置密码，可以不添加） |

### 注意

- **请备份私钥**。私钥丢失后，已安装的程序将无法再收到更新，只能让用户手动重新安装。
- 如果需要更换密钥，用 `npx tauri signer generate -w <路径>` 生成新的一对，更新 `tauri.conf.json` 中的公钥和 GitHub 中的私钥。更换后，旧版本程序无法自动更新到新版本，需要手动安装一次。
- 只有推送标签时才会用到私钥；日常推送到 `master` 不需要私钥也能正常打包。
