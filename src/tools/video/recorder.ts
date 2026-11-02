/**
 * 视频录制：取得屏幕或摄像头画面，按需混入系统声音和麦克风，交给浏览器自带的 MediaRecorder 录制。
 */

export type RecordSource = "screen" | "camera";

export interface RecordOptions {
  source: RecordSource;
  /** 系统声音：只有录屏幕时可用，需要在系统的选择窗口里勾选「分享音频」 */
  systemAudio: boolean;
  microphone: boolean;
  /** 画面左右翻转（录摄像头时像照镜子），录下来的视频也是翻转的 */
  mirror?: boolean;
}

/** 按优先顺序尝试的格式：优先 MP4（兼容性好、可以拖动进度），不支持时用 WebM */
const FORMATS = [
  { mimeType: "video/mp4;codecs=avc1.42E01F,mp4a.40.2", ext: "mp4" },
  { mimeType: "video/mp4;codecs=avc1,opus", ext: "mp4" },
  { mimeType: "video/mp4", ext: "mp4" },
  { mimeType: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mimeType: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mimeType: "video/webm", ext: "webm" },
];

export function pickFormat(isSupported: (type: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)) {
  return FORMATS.find((f) => isSupported(f.mimeType)) ?? null;
}

/** 录像 1 · 14:05 */
export function recordingName(n: number, date = new Date()) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `录像 ${n} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件名里不能有空格、冒号等：录像 1 · 14:05 → 录像_1_14_05.mp4 */
export const recordingFileName = (name: string, ext: string) => `${name.replace(/[ ·:]+/g, "_")}.${ext}`;

export interface Capture {
  /** 交给 MediaRecorder 的流：一条画面，最多一条（混合后的）声音 */
  stream: MediaStream;
  /** 画面轨道，用户在系统提示条上点「停止共享」时会结束 */
  video: MediaStreamTrack;
  /** 想录系统声音但没有拿到（选择窗口里没有勾选分享音频，或选的是单个窗口） */
  missingSystemAudio: boolean;
  /** 要求翻转但当前环境不支持，录下来的是原始画面 */
  mirrorUnsupported: boolean;
  /** 停止所有设备，释放混音用的资源 */
  release: () => void;
}

// Chromium 提供的逐帧处理画面的接口，TypeScript 自带的类型里还没有
declare const MediaStreamTrackProcessor: (new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> }) | undefined;
declare const MediaStreamTrackGenerator: (new (init: { kind: "video" }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> }) | undefined;

/** 把画面逐帧左右翻转，得到新的画面轨道；不支持时返回 null */
function mirrorTrack(track: MediaStreamTrack): MediaStreamTrack | null {
  if (typeof MediaStreamTrackProcessor === "undefined" || typeof MediaStreamTrackGenerator === "undefined") return null;
  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: "video" });
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  const flip = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      const w = frame.displayWidth;
      const h = frame.displayHeight;
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext("2d")!;
        ctx.setTransform(-1, 0, 0, 1, w, 0);
      }
      ctx!.drawImage(frame, 0, 0);
      controller.enqueue(new VideoFrame(canvas, { timestamp: frame.timestamp }));
      frame.close();
    },
  });
  processor.readable.pipeThrough(flip).pipeTo(generator.writable).catch(() => {});
  return generator;
}

/** 打开画面和声音；用户取消或没有权限时抛出错误（错误信息可以直接显示） */
export async function openCapture(o: RecordOptions): Promise<Capture> {
  const owned: MediaStream[] = [];
  const release = () => owned.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  try {
    let main: MediaStream;
    if (o.source === "screen") {
      try {
        main = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: o.systemAudio });
      } catch (e) {
        throw new Error(e instanceof DOMException && e.name === "NotAllowedError" ? "已取消选择要录制的屏幕" : "无法录制屏幕：当前环境不支持或没有权限");
      }
    } else {
      try {
        main = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: o.microphone });
      } catch {
        throw new Error("无法使用摄像头：请检查是否连接了摄像头，以及系统设置中是否允许应用访问摄像头和麦克风");
      }
    }
    owned.push(main);

    const audioTracks = main.getAudioTracks();
    // 录屏幕时麦克风单独打开
    if (o.source === "screen" && o.microphone) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        owned.push(mic);
        audioTracks.push(...mic.getAudioTracks());
      } catch {
        throw new Error("无法使用麦克风：请检查是否连接了麦克风，以及系统设置中是否允许应用访问麦克风");
      }
    }

    const video = main.getVideoTracks()[0];
    const missingSystemAudio = o.source === "screen" && o.systemAudio && main.getAudioTracks().length === 0;
    // 翻转后的画面单独放进一个流，释放时一起停掉
    const mirrored = o.mirror ? mirrorTrack(video) : null;
    if (mirrored) owned.push(new MediaStream([mirrored]));
    const recorded = mirrored ?? video;
    const mirrorUnsupported = !!o.mirror && !mirrored;
    if (audioTracks.length <= 1) {
      return { stream: new MediaStream([recorded, ...audioTracks]), video, missingSystemAudio, mirrorUnsupported, release };
    }

    // 系统声音和麦克风都有：混成一条声音
    const ctx = new AudioContext();
    const mixed = ctx.createMediaStreamDestination();
    for (const t of audioTracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(mixed);
    return {
      stream: new MediaStream([recorded, ...mixed.stream.getAudioTracks()]),
      video,
      missingSystemAudio,
      mirrorUnsupported,
      release: () => {
        release();
        ctx.close();
      },
    };
  } catch (e) {
    release();
    throw e;
  }
}
