import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    // メインの画面と、グローバルショートカットで出すクイックペースト
    rolldownOptions: {
      input: {
        main: new URL("src/client/index.html", import.meta.url).pathname,
        picker: new URL("src/client/picker.html", import.meta.url).pathname,
      },
    },
    // WKWebView（macOS 11 以降の Safari 14 相当）で動けばよい
    target: "safari14",
    reportCompressedSize: false,
  },
  server: {
    port: 5183,
    // 開発時のみのプロキシ。API サーバが 4721 以外で起動した場合は PROMPT_CODE_PORT を指定する
    proxy: { "/api": `http://localhost:${process.env.PROMPT_CODE_PORT ?? 4721}` },
  },
});
