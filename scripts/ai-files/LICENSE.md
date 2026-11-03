# Licenses

This repository redistributes third-party files without modification. Each file stays under its own license.
本仓库转存第三方文件，未做任何修改，每个文件沿用其原始许可证。

## Models (`models/`)

`u2netp.onnx`, `silueta.onnx`, `isnet-general-use.onnx` and `u2net_human_seg.onnx` are the ONNX models published by the
[rembg](https://github.com/danielgatis/rembg) project, converted from:

- U²-Net — Copyright (c) Xuebin Qin. Licensed under the Apache License 2.0: https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE
- IS-Net (DIS) — Copyright (c) Xuebin Qin. Licensed under the Apache License 2.0: https://github.com/xuebinqin/DIS/blob/main/LICENSE.md

Apache License 2.0 full text: https://www.apache.org/licenses/LICENSE-2.0

`lama.onnx` is `lama_fp32.onnx` from [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX) (renamed only), an ONNX export of:

- LaMa (Resolution-robust Large Mask Inpainting with Fourier Convolutions) — Copyright (c) the LaMa authors (advimman/lama).
  Licensed under the Apache License 2.0: https://github.com/advimman/lama/blob/main/LICENSE

`migan.onnx` is from [andraniksargsyan/migan](https://huggingface.co/andraniksargsyan/migan), an ONNX export of:

- MI-GAN (Mobile Inpainting GAN) — Copyright (c) 2024 Picsart AI Research (PAIR). Code and weights are licensed under the MIT License:
  https://github.com/Picsart-AI-Research/MI-GAN/blob/main/LICENSE and https://github.com/Picsart-AI-Research/MI-GAN/blob/main/LICENSE-WEIGHTS

## ONNX Runtime (`runtime/*/win-x64/onnxruntime.dll`)

Copyright (c) Microsoft Corporation. Licensed under the MIT License:
https://github.com/microsoft/onnxruntime/blob/main/LICENSE

Third-party notices: https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt

## DirectML (`runtime/*/win-x64/DirectML.dll`)

Copyright (c) Microsoft Corporation. Redistributed under the Microsoft DirectML License, which allows redistributing
the DirectML binary together with an application: https://www.nuget.org/packages/Microsoft.AI.DirectML (see "License").
