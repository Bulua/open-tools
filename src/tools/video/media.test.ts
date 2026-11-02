import { describe, expect, it } from "vitest";
import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output } from "mediabunny";
import { StreamResampler, canCopyConcat, codecName, concatVideos, formatDuration, openInput, probeVideo } from "./media";

/**
 * 生成测试用的 MP4：数据包内容是假的（不解码），只用来检查读取信息和直接拼接。
 * 画面 30 帧/秒，第一帧是关键帧；声音是 AAC，每包 1024 个采样（48 kHz）
 */
async function makeMp4(seconds: number, { width = 640, height = 360, audio = true } = {}) {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new EncodedVideoPacketSource("avc");
  output.addVideoTrack(video, { frameRate: 30 });
  const sound = audio ? new EncodedAudioPacketSource("aac") : null;
  if (sound) output.addAudioTrack(sound);
  await output.start();

  const description = new Uint8Array([1, 0x42, 0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0, 0x1f, 1, 0, 4, 0x68, 0xce, 0x3c, 0x80]);
  const frames = Math.round(seconds * 30);
  for (let i = 0; i < frames; i++) {
    const packet = new EncodedPacket(new Uint8Array([0, 0, 0, 1, i & 255]), i % 30 === 0 ? "key" : "delta", i / 30, 1 / 30);
    await video.add(packet, i === 0 ? { decoderConfig: { codec: "avc1.42001f", codedWidth: width, codedHeight: height, description } } : undefined);
  }
  if (sound) {
    const step = 1024 / 48000;
    for (let i = 0; i * step < seconds; i++) {
      const packet = new EncodedPacket(new Uint8Array([0x21, i & 255]), "key", i * step, step);
      await sound.add(packet, i === 0 ? { decoderConfig: { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, description: new Uint8Array([0x11, 0x90]) } } : undefined);
    }
  }
  await output.finalize();
  return new Blob([output.target.buffer!], { type: "video/mp4" });
}

async function packetTimes(blob: Blob, kind: "video" | "audio") {
  const input = openInput(blob);
  const track = kind === "video" ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack();
  const times: number[] = [];
  for await (const p of new EncodedPacketSink(track!).packets()) times.push(p.timestamp);
  input.dispose();
  return times;
}

describe("视频：读取信息", () => {
  it("时长、画面大小、编码", async () => {
    const info = await probeVideo(await makeMp4(2));
    expect(info.duration).toBeCloseTo(2, 1);
    expect(info).toMatchObject({ width: 640, height: 360, videoCodec: "avc", audio: { codec: "aac", sampleRate: 48000, channels: 2 } });
    expect(codecName(info.videoCodec)).toBe("H.264");
  });

  it("不是视频的文件给出提示", async () => {
    await expect(probeVideo(new Blob([new Uint8Array(100)]))).rejects.toThrow("无法读取这个视频");
  });

  it("时长显示", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
});

describe("视频：直接拼接", () => {
  it("格式相同可以直接拼接，画面大小不同、没有声音的不行", async () => {
    const a = await makeMp4(1);
    const b = await makeMp4(2);
    expect(await canCopyConcat([a, b])).toBe(true);
    expect(await canCopyConcat([a, await makeMp4(1, { width: 1280, height: 720 })])).toBe(false);
    expect(await canCopyConcat([a, await makeMp4(1, { audio: false })])).toBe(false);
  });

  it("按顺序接起来，后一段的时间戳接在前一段后面", async () => {
    const a = await makeMp4(1);
    const b = await makeMp4(2);
    const result = await concatVideos([a, b], { width: 640, height: 360, quality: "high" });
    expect(result.copied).toBe(true);
    const out = new Blob([result.data as Uint8Array<ArrayBuffer>]);
    const info = await probeVideo(out);
    expect(info.duration).toBeCloseTo(3, 1);

    const video = await packetTimes(out, "video");
    expect(video).toHaveLength(90);
    // 第一段的声音比画面长一点（最后一包声音超过 1 秒），第二段从第一段的结尾开始
    expect(video[30]).toBeCloseTo(1, 2);
    // 时间戳一直递增
    expect(video.every((t, i) => i === 0 || t > video[i - 1])).toBe(true);
    const audio = await packetTimes(out, "audio");
    expect(audio.every((t, i) => i === 0 || t > audio[i - 1])).toBe(true);
    expect(audio[audio.length - 1]).toBeGreaterThan(2.9);
  });
});

describe("视频：拼接时统一声音格式", () => {
  /** 正弦波按 sizes 切成几块依次输入，拼起来的输出应与一次输入相同 */
  const run = (rate: number, sizes: number[]) => {
    const total = sizes.reduce((a, b) => a + b, 0);
    const wave = Float32Array.from({ length: total }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));
    const r = new StreamResampler(rate, 48000);
    const out: number[] = [];
    let at = 0;
    for (const n of sizes) {
      const chunk = wave.subarray(at, at + n);
      out.push(...r.push(chunk, chunk)[0]);
      at += n;
    }
    return { out, total };
  };

  it("44.1 kHz 转 48 kHz：帧数按比例，分块输入与一次输入结果相同", () => {
    const whole = run(44100, [44100]);
    const parts = run(44100, [1000, 4410, 1, 38689]);
    expect(whole.out.length).toBeGreaterThan(47990);
    expect(whole.out.length).toBeLessThanOrEqual(48000);
    expect(parts.out.length).toBe(whole.out.length);
    parts.out.forEach((v, i) => expect(v).toBeCloseTo(whole.out[i], 6));
  });

  it("插值结果接近原波形", () => {
    const { out } = run(44100, [2000, 2000]);
    out.forEach((v, k) => expect(v).toBeCloseTo(Math.sin((2 * Math.PI * 440 * k) / 48000), 2));
  });

  it("采样率相同时原样输出", () => {
    const { out } = run(48000, [100, 100]);
    expect(out).toHaveLength(199);
    out.forEach((v, k) => expect(v).toBeCloseTo(Math.sin((2 * Math.PI * 440 * k) / 48000), 6));
  });
});
