import type { Category } from "../types";
import audioCompress from "./audio-compress";
import audioConvert from "./audio-convert";
import audioEditor from "./audio-editor";
import audioJoin from "./audio-join";
import recorder from "./recorder";
import tts from "./tts";

const audio: Category = {
  id: "audio",
  name: "音频",
  tools: [audioCompress, audioConvert, audioEditor, audioJoin, recorder, tts],
};

export default audio;
