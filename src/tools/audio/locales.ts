import { defineModuleLocales } from "@/locales/types";

/** 音频模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "audio-convert": { name: "Audio Converter", desc: "Convert between MP3, WAV, M4A, FLAC and more, or extract audio from videos like MP4" },
    "audio-editor": { name: "Audio Editor", desc: "Select a range on the waveform to keep or delete it; fade in/out and adjust volume" },
    "audio-join": { name: "Audio Joiner", desc: "Join several audio clips in order, with reordering and gaps between them" },
    recorder: { name: "Voice Recorder", desc: "Record from the microphone with pause, then preview and save as MP3 or WAV" },
    tts: { name: "Text to Speech", desc: "Read text aloud with the voices built into Windows, and save it as an audio file" },
  },
});
