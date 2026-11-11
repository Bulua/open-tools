import happy from "@/assets/mascot/cat-happy.webp";
import happyStill from "@/assets/mascot/cat-happy.png";
import sleep from "@/assets/mascot/cat-sleep.webp";
import sleepStill from "@/assets/mascot/cat-sleep.png";
import squeeze from "@/assets/mascot/cat-squeeze.webp";
import squeezeStill from "@/assets/mascot/cat-squeeze.png";
import thinking from "@/assets/mascot/cat-thinking.webp";
import thinkingStill from "@/assets/mascot/cat-thinking.png";
import walk from "@/assets/mascot/cat-walk.webp";
import walkStill from "@/assets/mascot/cat-walk.png";

export const mascotAnimations = [
  { id: "happy", animated: happy, still: happyStill },
  { id: "sleep", animated: sleep, still: sleepStill },
  { id: "squeeze", animated: squeeze, still: squeezeStill },
  { id: "thinking", animated: thinking, still: thinkingStill },
  { id: "walk", animated: walk, still: walkStill },
] as const;
