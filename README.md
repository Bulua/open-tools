<div align="center">

<img src="app-icon.png" width="96" height="96" alt="Open Tools" />

# Open Tools

[English](README.md) | [简体中文](README.zh-CN.md)

**A developer toolbox for Windows**

JSON, encoding, conversion, image, audio, and document utilities in one lightweight desktop app. Most processing happens locally, without uploading your files.

[![Build status](https://github.com/Bulua/open-tools/actions/workflows/build.yml/badge.svg)](https://github.com/Bulua/open-tools/actions/workflows/build.yml)
[![Latest release](https://img.shields.io/github/v/release/Bulua/open-tools?label=latest%20release)](https://github.com/Bulua/open-tools/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-c96442)](#download-and-install)
[![License](https://img.shields.io/github/license/Bulua/open-tools?label=license)](LICENSE)

[Download](#download-and-install) · [Features](#features) · [Tips](#tips) · [Star history](#star-history)

</div>

---

## Overview

Formatting JSON, decoding Base64, converting timestamps, or compressing images often means opening several websites and wondering where your data goes. Open Tools brings these everyday utilities into a single desktop app:

- **Local processing:** Your files and content are processed on your computer. See [Privacy](#privacy) for the features that access the network.
- **Lightweight:** A small installer and a fast startup.
- **One workspace:** Switch categories at the top, choose tools in the sidebar, or press `Ctrl K` to search.
- **Keep your work:** Switching tools preserves recent inputs and results.
- **Built-in updates:** Get notified when a new version is available and install it from the app.

## Features

8 categories and 45 tools:

| Category | Tools |
| --- | --- |
| JSON | Format and validate (code/tree views), compare JSON, escape strings, convert to YAML, generate TypeScript types |
| Text & encoding | Base64, URL/Unicode/HTML encoding, hashes, JWT decoding, password generation, regex testing, naming convention conversion |
| Time | Timestamp conversion, time zones and world clocks, cron expressions, countdown reminders |
| Calculators & converters | Calculator, unit conversion, number bases, color conversion |
| Images | Compression, format conversion, cropping, rotation, color adjustment, stitching, mosaic, watermarks, background removal (including AI subject detection), color picker, ICO generation |
| Audio | Format conversion (including extracting audio from video), trimming, joining, recording, text to speech |
| Video | Bilibili video download (with in-app playback), Douyin download without watermark, video to audio (copy the original track or convert to MP3/M4A/WAV), video concatenation |
| Documents & files | Word to PDF, PDF to Word, Word watermarks and watermark removal, PDF page editing, PDF watermark removal, Markdown editing/preview and Word export, archiving and extraction |
| Network | HTTP request client, IP address and location lookup, ping, HTTP headers to JSON/cURL |

## Download and install

1. Open the [latest GitHub release](https://github.com/Bulua/open-tools/releases/latest), or the [Gitee mirror](https://gitee.com/bulua/open-tools/releases).
2. Download `Open Tools_x.x.x_x64-setup.exe`.
3. Run the installer and launch Open Tools from the Start menu or desktop shortcut.

**Requirements:** 64-bit Windows 10 or 11 and WebView2. Word-to-PDF conversion also requires Microsoft Word, WPS, or LibreOffice installed locally.

> **Windows SmartScreen warning on first launch?** The installer is not currently code-signed. If you trust the downloaded release, select **More info** and then **Run anyway**.

### Updates

The app checks for updates shortly after startup. When a new version is available, use the notification in the upper-right corner to download and install it. You can also check manually with the update button in the header.

## Tips

| Action | Result |
| --- | --- |
| `Ctrl K` | Search all tools by name or description and open one with Enter |
| Sidebar search | Filter tools in the current category |
| Session tabs | JSON tools, regex testing, Markdown editing, and header conversion support independent sessions; use `+` to add one, double-click to rename, and middle-click or use `×` to close |
| `Ctrl V` | Paste screenshots or copied files into supported image and file tools |
| Drag and drop | Add images and files directly to the window |
| `Ctrl F` | Search in the JSON editor |
| Lower-left sidebar button | Collapse the sidebar |
| Theme button in the header | Switch between light and dark themes |
| Close the window | Hide the app in the system tray; click the tray icon to restore it, or right-click and choose Exit |
| Drag the divider | Resize the input/output panes in the JSON formatter; double-click to reset |

The app remembers your last category and tool, theme, and commonly used tool options.

## Privacy

Processing is local unless a feature explicitly needs network access:

- **Update checks:** Read release metadata from Gitee or GitHub without sending your files.
- **IP lookup:** Query public services (ip-api.com, ipwho.is, then ipapi.co). The queried IP is sent to the provider; ip-api.com uses unencrypted HTTP.
- **Ping:** Send a ping to the host you enter.
- **AI background-removal model downloads:** Download a model from the rembg GitHub releases only when you request it. Your images are processed locally.
- **Remote images in Markdown:** When exporting Markdown that references an HTTP(S) image to Word, the app fetches that image from its URL.

## Tech stack

| Area | Technology |
| --- | --- |
| Desktop | Tauri 2 (Rust and system WebView2) |
| UI | Vue 3, TypeScript, Vite |
| Code editor | CodeMirror 6 |
| Documents | PDF.js, pdf-lib, docx, docx-preview, marked |
| Audio | Web Audio, wasm-media-encoders (MP3), Windows speech |
| Video | Mediabunny (WebCodecs) |
| AI background removal | ONNX Runtime Web, rembg models (U²-Net, IS-Net) |
| Icons | Lucide |
| Tests | Vitest |
| Builds and releases | GitHub Actions, tauri-action |

## Star history

If Open Tools is useful to you, consider starring the project. Report bugs or suggest tools in [Issues](https://github.com/Bulua/open-tools/issues).

<a href="https://star-history.com/#Bulua/open-tools&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date&theme=dark" />
    <img alt="Star history" src="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date" />
  </picture>
</a>

## License

[MIT](LICENSE) © Bulua
