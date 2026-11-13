import { createApp, defineAsyncComponent } from "vue";
import App from "./App.vue";
import ScreenshotWindow from "./tools/image/screenshot-history/components/ScreenshotWindow.vue";
import "./styles/index.css";
import { installSegGlide } from "./utils/motion";
import { i18n, initLocale } from "./locales";

const windowKind = new URLSearchParams(location.search).get("window");
initLocale(windowKind === null);
if (windowKind === "screenshot-overlay") {
  document.documentElement.classList.add("screenshot-overlay-page");
}
const isClipboardWindow = windowKind === "clipboard-history";
const root = isClipboardWindow
  ? defineAsyncComponent(() => import("./tools/encode/clipboard-history/ClipboardHistory.vue"))
  : windowKind ? ScreenshotWindow : App;
createApp(root, isClipboardWindow ? { popup: true } : {}).use(i18n).mount("#app");
if (!windowKind) installSegGlide();
