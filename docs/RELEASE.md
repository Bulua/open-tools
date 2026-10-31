# 发布指南

## 两种打包

| 触发方式 | 结果 |
| --- | --- |
| 推送到 `master` | 云端编译，在 [Actions](https://github.com/Bulua/open-tools/actions) 页面的 Artifacts 中下载 exe 与安装包，供测试使用 |
| 推送 `v` 开头的标签 | 发布到 [Releases](https://github.com/Bulua/open-tools/releases)，并生成在线更新文件，已安装的程序会收到更新 |

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

   ```bash
   git push origin master v0.2.0
   ```

3. 等待 GitHub Actions 完成（约 10 分钟），Releases 页面会出现新版本，包含：
   - `Open Tools_0.2.0_x64-setup.exe`：安装包
   - `Open Tools_0.2.0_x64-setup.exe.sig`：更新包签名
   - `latest.json`：在线更新信息

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：修复问题升第三位（0.2.1），新增功能升第二位（0.3.0）。

## 在线更新的原理

1. 程序启动几秒后，读取 `https://github.com/Bulua/open-tools/releases/latest/download/latest.json`。
2. 如果其中的版本号比当前版本新，右上角显示「新版本」提示。
3. 用户确认后下载安装包，**校验签名**通过才会安装，安装完成后程序自动重启。

相关配置在 `src-tauri/tauri.conf.json` 的 `plugins.updater` 中。

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
