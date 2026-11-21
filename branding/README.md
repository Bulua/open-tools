# 远程图标

不发新版本也能换程序图标。程序启动后（以及一直开着时每 6 小时）读取这里的 `icon.json`，
图标变了就自动下载、核对校验值并换上。

- 读取地址：先 Gitee，再 GitHub
  - `https://gitee.com/bulua/open-tools/raw/master/branding/icon.json`
  - `https://raw.githubusercontent.com/Bulua/open-tools/master/branding/icon.json`
- 配置 `GITEE_TOKEN` 后，推送 GitHub 的 `master` 会触发代码同步。详见 [Gitee 同步](../docs/release/RELEASE.md#gitee-同步)。

## 文件

- `icon.json`：所有用过的图标，`current` 是正在用的那个（`default` 表示程序自带的图标）
- `icons/<id>.png`、`icons/<id>.ico`：每个图标的文件。**只增不删**，以后随时可以换回去

## 常用操作

```bash
# 查看所有图标，* 是正在用的
node scripts/branding.mjs list

# 加入新图标并换上（正方形 PNG，至少 512×512，四角透明）
node scripts/branding.mjs add 新图标.png spring-2027 春节版

# 换回历史上的某个图标
node scripts/branding.mjs use classic

# 换回程序自带的图标
node scripts/branding.mjs use default
```

改完后提交并推送 master 即可。Gitee 和 GitHub 的文件会缓存几分钟。

## 能换和不能换的地方

| 位置 | 远程能换吗 |
| --- | --- |
| 顶栏 Logo、窗口标题栏、任务栏、Alt+Tab、托盘 | 能 |
| 桌面、开始菜单、固定到任务栏的快捷方式 | 能（改写快捷方式指向的图标） |
| `.exe` 在资源管理器里的图标、安装包、「应用和功能」 | 不能，这些写在程序文件里，只能随新版本更换 |

## 更新内置 Windows 图标

替换根目录 `app-icon.png`，使用正方形、四角透明的图片。先将图标生成到临时目录：

```powershell
$iconOutput = Join-Path ([IO.Path]::GetTempPath()) ("open-tools-icons-" + [guid]::NewGuid().ToString("N"))
npm run tauri -- icon app-icon.png --output $iconOutput
```

从输出中更新 `src-tauri/icons/` 下的 `icon.ico`、`icon.png` 和现有 PNG 尺寸文件。同步更新 `src/assets/app-logo.png`（96×96）和 `public/favicon.png`（64×64）。生成器也会在临时目录生成其他平台图标，仓库只需要 Windows 用到的资源。

## 只有带这个功能的版本才会读取

0.7.1 及以前的版本没有这个功能，要先更新到之后的版本。
