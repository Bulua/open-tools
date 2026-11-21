import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // vue-i18n 的编译开关：只用 Composition API，不打包旧版 API 和开发者工具支持
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  clearScreen: false,
  // PDF 原文编辑的 WASM 引擎在独立模块 Worker 中初始化，使用顶层 await。
  build: { target: "es2022" },
  worker: { format: "es" },
  // 引擎包含顶层 await 和相对 WASM 资源，开发时直接加载其 ESM。
  optimizeDeps: { exclude: ["mupdf"] },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
