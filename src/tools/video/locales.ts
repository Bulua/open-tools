import { defineModuleLocales } from "@/locales/types";

/** 视频模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "bilibili-download": {
      name: "Bilibili Downloader",
      desc: "Paste a Bilibili link to download video (MP4), audio, cover and danmaku; multi-part videos, quality and codec choice, HD after signing in",
    },
    "douyin-download": {
      name: "Douyin Downloader",
      desc: "Paste a Douyin share link to download watermark-free videos, original photos, live photos, music and covers (desktop app)",
    },
    "video-to-audio": {
      name: "Video to Audio",
      desc: "Extract the sound from videos — copy the original track (fastest, lossless) or convert to MP3, M4A or WAV; batch processing",
    },
    "video-concat": { name: "Video Joiner", desc: "Join several videos into one MP4; same-format clips are joined without re-encoding — fast and lossless" },
    "video-music": {
      name: "Add Music to Video",
      desc: "Add background music with adjustable music and original volume, looped or played a set number of times; video is not re-encoded",
    },
    "screen-recorder": { name: "Screen Recorder", desc: "Record the whole screen, a window or a browser tab, with system audio and microphone; preview and save afterwards" },
    "camera-recorder": { name: "Camera Recorder", desc: "Record a video from the camera, optionally with the microphone; preview and save afterwards" },
  },
});
