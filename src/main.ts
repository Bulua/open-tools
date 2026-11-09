import { createApp } from "vue";
import App from "./App.vue";
import ScreenshotWindow from "./tools/image/screenshot/components/ScreenshotWindow.vue";
import "./styles/index.css";
import { installSegGlide } from "./utils/motion";
import { i18n, initLocale } from "./locales";

initLocale();
const isScreenshotWindow = new URLSearchParams(location.search).has("window");
if (new URLSearchParams(location.search).get("window") === "screenshot-overlay") {
  document.documentElement.classList.add("screenshot-overlay-page");
}
createApp(isScreenshotWindow ? ScreenshotWindow : App).use(i18n).mount("#app");
if (!isScreenshotWindow) installSegGlide();
