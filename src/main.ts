import { createApp } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import { installSegGlide } from "./utils/motion";

createApp(App).mount("#app");
installSegGlide();
