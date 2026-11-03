<div align="center">

<img src="app-icon.png" width="96" height="96" alt="Open Tools" />

# Open Tools

[English](README.md) | [简体中文](README.zh-CN.md) | 日本語

**Windows 向け開発者ツールボックス**

JSON・エンコード・変換・画像・音声・文書などのよく使うツールを、軽量なデスクトップアプリ 1 つにまとめました。ほとんどの処理は PC 上で行い、ファイルをアップロードしません。

[![ビルド状況](https://github.com/Bulua/open-tools/actions/workflows/build.yml/badge.svg)](https://github.com/Bulua/open-tools/actions/workflows/build.yml)
[![最新リリース](https://img.shields.io/github/v/release/Bulua/open-tools?label=%E6%9C%80%E6%96%B0%E3%83%AA%E3%83%AA%E3%83%BC%E3%82%B9)](https://github.com/Bulua/open-tools/releases/latest)
[![プラットフォーム](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-c96442)](#ダウンロードとインストール)
[![ライセンス](https://img.shields.io/github/license/Bulua/open-tools?label=license)](LICENSE)

[ダウンロード](#ダウンロードとインストール) · [機能](#機能) · [使い方のヒント](#使い方のヒント) · [Star の推移](#star-の推移)

</div>

---

## 概要

JSON の整形、Base64 のデコード、タイムスタンプの変換、画像の圧縮……。こうした作業のたびに別々の Web サイトを開き、データがどこに送られるのか気にしていませんか。Open Tools はこれらの日常的なツールを 1 つのデスクトップアプリにまとめます。

- **ローカル処理**：ファイルや内容は PC 上で処理します。ネットワークにアクセスする機能は[プライバシー](#プライバシー)を参照してください。
- **軽量**：インストーラーは小さく、起動も高速です。
- **1 つの画面で完結**：上部でカテゴリを切り替え、左のサイドバーでツールを選び、`Ctrl K` でいつでも検索できます。
- **作業内容を保持**：ツールを切り替えても、直前の入力と結果は残ります。
- **自動アップデート**：新しいバージョンがあるとアプリ内で通知し、そのまま更新できます。
- **多言語対応**：簡体字中国語・English・日本語に対応し、初期設定ではシステムの言語に従います。

## 機能

9 カテゴリ、57 ツール：

| カテゴリ | ツール |
| --- | --- |
| JSON | 整形と検証（コード / ツリー表示）、差分比較、文字列エスケープ、YAML への変換、TypeScript 型の生成 |
| テキスト・エンコード | Base64、URL / Unicode / HTML エンコード、ハッシュ計算、JWT デコード、パスワード生成、パスワード帳、正規表現テスト、命名規則の変換 |
| 時間 | タイムスタンプ変換、タイムゾーンと世界時計、Cron 式、カウントダウン通知 |
| 計算・換算 | 電卓、単位換算、進数変換、カラー変換 |
| 画像 | 圧縮、形式変換、切り抜き、回転、色調整、結合、モザイク、透かし、背景除去（AI による被写体認識）、色の取得、ICO アイコン生成 |
| 音声 | 形式変換（動画からの音声抽出を含む）、編集、結合、ボイスレコーダー、テキスト読み上げ |
| 動画 | bilibili 動画ダウンロード（アプリ内再生対応）、Douyin の透かしなしダウンロード、動画から音声へ（元の音声トラックのコピー、または MP3・M4A・WAV に変換）、動画の結合、BGM の追加、画面録画、カメラ録画 |
| 文書 | Word → PDF、PDF → Word、Word の透かし追加と削除、PDF ページ編集、PDF の透かし削除、Markdown の編集・プレビューと Word 書き出し、ファイルの圧縮と展開 |
| ネットワーク | HTTP リクエスト、IP アドレスと位置情報、Ping テスト、リクエストヘッダー → JSON / cURL |

## ダウンロードとインストール

1. [GitHub の最新リリース](https://github.com/Bulua/open-tools/releases/latest)、または [Gitee のミラー](https://gitee.com/bulua/open-tools/releases)を開きます。
2. `Open Tools_x.x.x_x64-setup.exe` をダウンロードします。
3. インストーラーを実行し、スタートメニューまたはデスクトップのショートカットから Open Tools を起動します。

**動作環境**：64 ビット版 Windows 10 / 11 と WebView2（Windows 10 以降は標準搭載）。Word → PDF 変換には、Microsoft Word・WPS・LibreOffice のいずれかが必要です。

> **初回起動時に Windows SmartScreen の警告が出る場合**：現在、インストーラーにはコード署名がありません。ダウンロードしたリリースを信頼できる場合は、**詳細情報** → **実行** を選んでください。

### アップデート

アプリは起動後しばらくしてアップデートを確認します。新しいバージョンがあると右上に通知が出るので、そこからダウンロードしてインストールできます。上部のアップデートボタンから手動で確認することもできます。

## 使い方のヒント

| 操作 | 内容 |
| --- | --- |
| `Ctrl K` | すべてのツールを名前や説明で検索し、Enter で開く |
| サイドバーの検索 | 現在のカテゴリ内のツールを絞り込む |
| セッションタブ | JSON ツール・正規表現テスト・Markdown 編集・ヘッダー変換は独立したセッションに対応。`+` で追加、ダブルクリックで名前を変更、中クリックまたは `×` で閉じる |
| `Ctrl V` | 対応する画像・ファイルツールにスクリーンショットやコピーしたファイルを貼り付ける |
| ドラッグ & ドロップ | 画像やファイルをウィンドウに直接追加する |
| `Ctrl F` | JSON エディター内を検索する |
| サイドバー左下のボタン | サイドバーを折りたたむ |
| 上部のテーマボタン | ライト / ダークテーマを切り替える |
| 上部の言語ボタン | システムに従う / 简体中文 / English / 日本語 を切り替える |
| ウィンドウを閉じる | アプリをシステムトレイに隠す。トレイアイコンのクリックで復元、右クリックで終了 |
| 区切り線をドラッグ | JSON 整形の入力 / 出力欄の幅を調整。ダブルクリックで元に戻す |

最後に開いたカテゴリとツール、テーマ、言語、よく使うツールの設定はアプリが記憶します。

## プライバシー

ネットワークが必要な機能を除き、処理はすべてローカルで行います。

- **アップデートの確認**：Gitee または GitHub からリリース情報を読み取ります。ファイルは送信しません。
- **IP の検索**：公開サービス（ip-api.com、ipwho.is、ipapi.co の順）に問い合わせます。検索する IP はサービス提供元に送信され、ip-api.com は暗号化されていない HTTP を使います。
- **Ping**：入力したホストに ping を送ります。
- **AI 背景除去モデルのダウンロード**：要求したときだけ rembg の GitHub リリースからモデルをダウンロードします。画像はローカルで処理します。
- **Markdown 内のリモート画像**：HTTP(S) の画像を参照する Markdown を Word に書き出すとき、その URL から画像を取得します。

## 技術スタック

| 分野 | 技術 |
| --- | --- |
| デスクトップ | Tauri 2（Rust とシステムの WebView2） |
| UI | Vue 3、TypeScript、Vite、vue-i18n |
| コードエディター | CodeMirror 6 |
| 文書 | PDF.js、pdf-lib、docx、docx-preview、marked |
| 音声 | Web Audio、wasm-media-encoders（MP3）、Windows の音声合成 |
| 動画 | Mediabunny（WebCodecs） |
| AI 背景除去 | ONNX Runtime Web、rembg モデル（U²-Net、IS-Net） |
| アイコン | Lucide |
| テスト | Vitest |
| ビルドとリリース | GitHub Actions、tauri-action |

## Star の推移

Open Tools が役に立ったら、ぜひ Star をお願いします。不具合の報告やツールの提案は [Issues](https://github.com/Bulua/open-tools/issues) までどうぞ。

<a href="https://star-history.com/#Bulua/open-tools&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date&theme=dark" />
    <img alt="Star の推移" src="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date" />
  </picture>
</a>

## ライセンス

[AGPL-3.0](LICENSE) © Bulua
