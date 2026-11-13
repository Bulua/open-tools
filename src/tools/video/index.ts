import type { Category } from "../types";
import videoCompress from "./video-compress";
import bilibiliDownload from "./bilibili-download";
import douyinDownload from "./douyin-download";
import videoToAudio from "./video-to-audio";
import videoTrim from "./video-trim";
import videoToGif from "./video-to-gif";
import videoConcat from "./video-concat";
import videoMusic from "./video-music";
import screenRecorder from "./screen-recorder";
import cameraRecorder from "./camera-recorder";

const video: Category = {
  id: "video",
  name: "视频",
  tools: [videoCompress, bilibiliDownload, douyinDownload, videoToAudio, videoTrim, videoToGif, videoConcat, videoMusic, screenRecorder, cameraRecorder],
};

export default video;
