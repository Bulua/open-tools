import type { Category } from "../types";
import password from "./password";
import passwordVault from "./password-vault";
import clipboardHistory from "./clipboard-history";
import screenshotHistory from "./screenshot-history";
import idCard from "./id-card";
import notebook from "./notebook";

const daily: Category = {
  id: "daily",
  name: "日常工具",
  tools: [password, passwordVault, clipboardHistory, screenshotHistory, idCard, notebook],
};

export default daily;
