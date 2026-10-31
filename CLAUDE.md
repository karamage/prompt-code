# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Prompt Code is a macOS Markdown editor and snippet manager for AI prompts (Tauri shell + local HTTP server + React UI). The vault is a plain folder of `.md` files with YAML frontmatter.

## Commands

Package manager and test runner is Bun. Rust toolchain is pinned in `rust-toolchain.toml`.

```sh
bun install
bun run check                    # typecheck (tsc) + oxlint + biome format check + bun test — run before committing
bun test                         # all tests
bun test src/shared/prompt.test.ts          # one file
bun test -t "open seeds a new vault"        # tests matching a name
bun run format                   # biome format --write (biome is formatter only; linting is oxlint)

# Develop in a browser (no Tauri)
bun run build:client && bun run dev:server   # http://127.0.0.1:4721, serves dist/client
bun run dev:client                           # Vite HMR on :5183, proxies /api to 4721 (PROMPT_CODE_PORT overrides)
# dev:server accepts --vault <dir>. Settings live in ~/.config/prompt-code/ (PROMPT_CODE_HOME overrides).

# Desktop app
bun run app:dev                  # builds client + server bundle/sidecar, then tauri dev
bun run app:build                # .app in src-tauri/target/release/bundle/macos/
bun run release:mac              # Developer ID signed + notarized DMGs (see header of scripts/release-mac.ts)
bun run release:appstore         # Mac App Store pkg, sandboxed (see header of scripts/release-appstore.ts)
```

## Architecture

Three processes/layers, with code split under `src/`:

- `src/shared/` — pure logic used by both server and client: frontmatter parsing, prompt syntax (`{{var}}`, `{{var: default}}`, `{{var: a | b}}`, `![[embed]]`, `<!-- comments -->` stripped on copy), note metadata/link resolution, settings, API types. Most unit tests live here.
- `src/server/` — Hono HTTP API + static file server for the built client. `Vault` (`vault/vault.ts`) indexes, watches, searches and trashes notes (`.trash/` inside the vault). Clients get live updates by long-polling `/api/vault/wait?since=<version>`.
- `src/client/` — React 19 + CodeMirror 6 UI. Two Vite entry points: `index.html` (main window) and `picker.html` (the quick-paste window). Global UI state is a single external store in `store.ts` read via `useSyncExternalStore`; `actions.ts` holds the operations; `api.ts` is the typed fetch wrapper.
- `src-tauri/` — Rust shell (`lib.rs`, `macos.rs`). It does not use tauri-plugin-shell; it spawns the server sidecar with `std::process`, watches the clipboard, owns the tray menu, global shortcut, quick-paste window, folder panel, and sends ⌘V back to the previous app.

### Two JS runtimes

The server runs on **Bun** in development/tests (`src/server/index.ts`) but on **txiki.js** (QuickJS-based, ~6 MB) in the shipped app (`src/server/index.tjs.ts`). All runtime-specific I/O goes through the `Runtime`/`FileSystem` interfaces in `src/server/runtime/types.ts`, implemented by `runtime/bun.ts` and `runtime/tjs.ts`.

Consequences when editing server code:
- Do not call Bun or Node APIs directly from server modules; add to the `Runtime`/`FileSystem` interface instead.
- `scripts/build-server.ts` bundles the server into `dist/server/server.js` and rewrites `node:*` imports to shims in `runtime/tjs-node/`. Only `node:os` and `node:path` have shims — importing any other `node:*` module fails the bundle. `tjs:*` imports are external.
- The script also downloads a checksum-pinned txiki.js binary into `src-tauri/binaries/` as the Tauri sidecar.

### Shell ⇄ server protocol

- Server → shell: single lines on stdout. `PROMPT_CODE_READY <url>` on startup, then signals defined in `SIGNAL` in `src/server/desktop.ts` (paste, hide picker, shortcut, tray JSON, choose folder, open at login). The Rust constants at the top of `src-tauri/src/lib.rs` must stay in sync with these.
- Shell → server: HTTP to `/api/desktop/*` and `/api/clipboard`.
- The shell generates a random token per launch, passes it via `PROMPT_CODE_TOKEN` env to the server and via `?token=` to the webview; every API call must carry the `x-prompt-code-token` header. In browser dev there is no token and the check is skipped.
- When not run with the desktop flag, `DesktopChannel` is disabled and emits nothing.

### Mac App Store variant

Differences from the Developer ID build are confined to `src-tauri/tauri.appstore.conf.json`, the Cargo feature `app-store` (`#[cfg(feature = "app-store")]`), and `AppStore.entitlements`. In the sandbox, folder access comes from the shell's NSOpenPanel + security-scoped bookmarks (not osascript), and login items go through SMAppService (server sets `PROMPT_CODE_LOGIN_ITEM_BY_SHELL=1` path).

### i18n

English and Japanese. Server errors are `AppError` carrying both `{ ja, en }` text, localized per request from `Accept-Language` (`server/lang.ts`). Client strings are in `src/client/i18n.ts`. Any new user-facing string needs both languages. The GitHub Pages site in `docs/` also has EN (`docs/`) and JA (`docs/ja/`) pages.

## Conventions

- Code comments and JSDoc are written in Japanese, in a plain explanatory style; keep that when editing.
- Commit messages are English, imperative, one sentence describing the user-visible effect (see `git log`).
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`; imports use explicit `.ts` extensions.
- The client targets `safari14` (WKWebView on macOS 11); avoid newer web APIs without checking.
- The app avoids size growth deliberately (no bundled browser engine, trimmed Tauri features, `opt-level = "s"`). Justify new dependencies, especially in `Cargo.toml`.
