---
license: other
license_name: mixed-licenses
license_link: LICENSE.md
tags:
- onnx
- image-segmentation
- background-removal
---

# Open Tools 模型 / Open Tools Models

[Open Tools 工具百宝箱](https://github.com/Bulua/open-tools)使用的 AI 模型和运行环境。程序内按需下载，不需要手动下载这里的文件。
同样的文件在[魔搭](https://www.modelscope.cn/models/sebponk/open-tools-models)和 [Hugging Face](https://huggingface.co/penghui002/open-tools-models) 各放一份，国内用户优先从魔搭下载。

AI models and runtime used by [Open Tools](https://github.com/Bulua/open-tools). The app downloads them on demand; you don't need to download anything here by hand.
The same files are mirrored on [ModelScope](https://www.modelscope.cn/models/sebponk/open-tools-models) and [Hugging Face](https://huggingface.co/penghui002/open-tools-models).

## 文件 / Files

所有文件都没有修改，只是转存；各自的许可证见 [LICENSE.md](LICENSE.md)。
All files are redistributed unmodified under their original licenses; see [LICENSE.md](LICENSE.md).

| 文件 / File | 用途 / Use | 来源 / Source | 许可证 / License |
| --- | --- | --- | --- |
| `models/u2netp.onnx` | 去背景（轻量）/ Background removal (light) | [rembg](https://github.com/danielgatis/rembg) · [U²-Net](https://github.com/xuebinqin/U-2-Net) | Apache-2.0 |
| `models/silueta.onnx` | 去背景（标准）/ Background removal (standard) | [rembg](https://github.com/danielgatis/rembg) · U²-Net | Apache-2.0 |
| `models/isnet-general-use.onnx` | 去背景（精细）/ Background removal (fine) | [rembg](https://github.com/danielgatis/rembg) · [IS-Net (DIS)](https://github.com/xuebinqin/DIS) | Apache-2.0 |
| `models/u2net_human_seg.onnx` | 人像抠图 / Portrait segmentation | [rembg](https://github.com/danielgatis/rembg) · U²-Net | Apache-2.0 |
| `runtime/<version>/win-x64/onnxruntime.dll` | AI 运行环境 / AI runtime | [ONNX Runtime](https://github.com/microsoft/onnxruntime)（NuGet `Microsoft.ML.OnnxRuntime.DirectML`） | MIT |
| `runtime/<version>/win-x64/DirectML.dll` | 显卡加速 / GPU acceleration | [DirectML](https://github.com/microsoft/DirectML)（NuGet `Microsoft.AI.DirectML`） | Microsoft DirectML License |
