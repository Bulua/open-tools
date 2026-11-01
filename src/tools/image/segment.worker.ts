import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

/**
 * 在后台线程运行 AI 抠图模型，计算较慢时界面也不会卡住。
 * 每个模型第一次使用时由主线程传入模型文件，之后复用已加载的模型。
 */
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// 程序没有启用跨源隔离，用单线程运行
ort.env.wasm.numThreads = 1;

const sessions = new Map<string, ort.InferenceSession>();

type Request = { modelId: string; modelBytes?: ArrayBuffer; input: Float32Array; size: number };

self.onmessage = async (e: MessageEvent<Request>) => {
  const { modelId, modelBytes, input, size } = e.data;
  try {
    let session = sessions.get(modelId);
    if (!session) {
      if (!modelBytes) throw new Error("模型未加载");
      session = await ort.InferenceSession.create(new Uint8Array(modelBytes), { executionProviders: ["wasm"] });
      sessions.set(modelId, session);
    }
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, size, size]) };
    const results = await session.run(feeds);
    const output = results[session.outputNames[0]].data as Float32Array;
    // 只取第一张蒙版（size × size）
    const mask = output.slice(0, size * size);
    self.postMessage({ ok: true, mask }, { transfer: [mask.buffer] });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
