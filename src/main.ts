import { createApp } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import { installSegGlide } from "./utils/motion";
import { i18n, initLocale } from "./locales";

initLocale();
createApp(App).use(i18n).mount("#app");
installSegGlide();
