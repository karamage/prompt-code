import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { bootstrap } from "./actions.ts";
import { api } from "./api.ts";
import { App } from "./App.tsx";
import { installKeybindings } from "./commands.ts";
import { enableWindowDrag, routeExternalLinks } from "./desktop.ts";
import "./styles.css";

async function start(): Promise<void> {
  const container = document.getElementById("root");
  if (container === null) throw new Error("#root not found");
  routeExternalLinks(api.post);
  installKeybindings();
  enableWindowDrag();
  // webview の既定の右クリックメニュー（再読み込みなど）は出さない。入力欄では文字の操作に使うので残す
  window.addEventListener("contextmenu", (event) => {
    if (
      (event.target as HTMLElement | null)?.closest("input, textarea, .cm-editor, .preview") ===
      null
    )
      event.preventDefault();
  });
  await bootstrap();
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  document.documentElement.classList.add("is-ready");
}

void start();
