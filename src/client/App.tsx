import {
  ConfirmDialog,
  ContextMenu,
  Resizer,
  SettingsDialog,
  Toasts,
  VaultAccessDialog,
} from "./components/Chrome.tsx";
import { Graph } from "./components/Graph.tsx";
import { Guide } from "./components/Guide.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { NoteList } from "./components/NoteList.tsx";
import { NoteView } from "./components/NoteView.tsx";
import { Palette } from "./components/Palette.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { useApp } from "./store.ts";

export function App() {
  const ui = useApp((s) => s.ui);
  const overlay = useApp((s) => s.overlay);
  // 言語が変わったら全体を描き直す
  useApp((s) => s.settings.lang);

  const columns = [
    ui.showSidebar ? `${ui.sidebarWidth}px` : null,
    ui.showSidebar ? `${ui.listWidth}px` : null,
    "minmax(420px, 1fr)",
    ui.showInspector ? `${ui.inspectorWidth}px` : null,
  ]
    .filter((column) => column !== null)
    .join(" ");

  return (
    <div className="app" style={{ gridTemplateColumns: columns }}>
      {ui.showSidebar && (
        <>
          <div className="pane pane-sidebar">
            <Sidebar />
            <Resizer target="sidebarWidth" edge="right" />
          </div>
          <div className="pane pane-list">
            <NoteList />
            <Resizer target="listWidth" edge="right" />
          </div>
        </>
      )}
      <div className={`pane pane-note${ui.showSidebar ? "" : " is-solo"}`}>
        <NoteView />
      </div>
      {ui.showInspector && (
        <div className="pane pane-inspector">
          <Resizer target="inspectorWidth" edge="left" />
          <Inspector />
        </div>
      )}

      {(overlay === "palette" || overlay === "commands" || overlay === "search") && (
        <Palette key={overlay} mode={overlay} />
      )}
      {overlay === "graph" && <Graph />}
      {overlay === "settings" && <SettingsDialog />}
      {overlay === "guide" && <Guide />}
      <ConfirmDialog />
      <VaultAccessDialog />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
