# Prompt Code

<p align="center"><a href="https://karamage.github.io/prompt-code/"><img src="docs/screenshots/promo-video-en.gif" width="960" alt="Prompt Code in 10 seconds: write templates with variables, fill in the blanks, and paste from any app with Option-Command-V."></a></p>

[![CI](https://github.com/karamage/prompt-code/actions/workflows/ci.yml/badge.svg)](https://github.com/karamage/prompt-code/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/karamage/prompt-code)](https://github.com/karamage/prompt-code/releases/latest)
[![License: MIT](https://img.shields.io/github/license/karamage/prompt-code)](LICENSE)
![macOS 11+](https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white)

[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![CodeMirror 6](https://img.shields.io/badge/CodeMirror-6-D30707?logo=codemirror&logoColor=white)](https://codemirror.net/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![txiki.js](https://img.shields.io/badge/txiki.js-QuickJS-4B4B4B)](https://github.com/saghul/txiki.js)

A Markdown editor and snippet manager for AI prompts, for macOS.

Prompt Code takes the parts of Obsidian that make writing pleasant — plain Markdown files in a folder you own, `[[links]]`, backlinks, a graph, a command palette — and the parts of massCode that make reuse fast — folders, tags, favorites, one-click copy. On top of both it adds what prompts need: fill-in variables, reusable embedded fragments, and notes to yourself that never reach the model.

[Website](https://karamage.github.io/prompt-code/) · [Download](https://github.com/karamage/prompt-code/releases/latest)

English · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

![Prompt Code: the note list, a prompt with variables, and the Use panel showing the finished prompt](docs/screenshots/main-en.png)

## What you can do

- **Variables.** Write `{{topic}}`, `{{audience: engineers}}` (default value) or `{{tone: friendly | formal}}` (choices). The **Use** panel turns them into fields and shows the finished prompt as you type. `⌘↵` copies it.
- **Embeds.** `![[Answer format]]` pulls another note in when you copy. Keep a persona or an output contract in one place and embed it everywhere.
- **Notes to yourself.** `<!-- like this -->` stays in the file and is removed on copy.
- **Links and tags.** `[[Note]]` links with autocomplete, backlinks, `#tags`, and a graph view (`⌘G`). Renaming a note rewrites links to it.
- **Fast navigation.** `⌘K` jumps to any note, `>` runs commands, `⇧⌘F` searches every note's text.
- **Your files, as they are.** The vault is a folder of `.md` files with YAML frontmatter (`tags`, `favorite`, `description`). Edit them with any other app — Prompt Code picks up the changes live. Deleted notes go to `.trash/` inside the vault.
- **Quick paste from anywhere.** Press `⌥⌘V` in any app to open a small window with your clipboard history and your prompts. Pick one and it is pasted straight into the app you were using. Prompts with variables let you fill them in right there first.
- **Clipboard history in the menu bar.** Prompt Code stays in the menu bar and keeps the text you copy (200 items by default). Copies that password managers mark as concealed are never recorded. Recent clips and favorite prompts are one click away in the menu bar menu.
- **Write, split, read.** A Markdown editor with syntax highlighting for code blocks, and a reading view.
- Light and dark themes, five accent colors, English and Japanese.

<p align="center"><img src="docs/screenshots/quick-paste-en.png" width="600" alt="Quick paste: pick a prompt from any app and paste it where you were typing"></p>

Nothing leaves your Mac. Prompt Code has no account, no telemetry, and makes no network requests.

To paste into other apps, macOS asks you to allow Prompt Code under **System Settings › Privacy & Security › Accessibility** the first time. Without it, quick paste still copies the text for you to paste with `⌘V`. Closing the window keeps Prompt Code in the menu bar; quit it from the menu bar menu or with `⌘Q`.

## Keys

| Key | Does |
| --- | --- |
| `⌘K` | Jump to a note (type `>` for commands) |
| `⌘N` / `⇧⌘N` | New note / new folder |
| `⇧⌘F` | Search every note |
| `⌘↵` | Fill variables; inside the panel, copy |
| `⇧⌘C` | Copy the prompt with current values |
| `⌘E` | Switch between write and read |
| `⌘\` | Hide or show the sidebars |
| `⌘G` | Graph |
| `⌘D` | Duplicate note |
| `⌘⌫` | Move note to trash (undo from the toast) |
| `⌘,` | Settings |
| `⌥⌘V` (anywhere) | Quick paste — change it in Settings |
| `↵` / `⌘↵` / `⌘1`–`⌘9` | In quick paste: paste / copy only / paste that row |
| `⌘`-click | Follow a `[[link]]` in the editor |

## Build

Requirements: macOS 11+, [Bun](https://bun.sh), and Rust (the toolchain in `rust-toolchain.toml` is installed automatically by rustup).

```sh
bun install
bun run app:build        # src-tauri/target/release/bundle/macos/Prompt Code.app
bun run app:dmg          # an unsigned DMG
bun run release:mac      # signed and notarized DMGs (needs a Developer ID; see the script)
```

Develop in a browser:

```sh
bun run build:client && bun run dev:server   # http://127.0.0.1:4721
bun run dev:client                            # Vite with hot reload on :5183 (proxies /api)
bun run check                                 # typecheck, lint, format check, tests
```

`dev:server` accepts `--vault <dir>` to open a different folder. Settings live in `~/.config/prompt-code/` (override with `PROMPT_CODE_HOME`). The default vault is `~/PromptCode`.

## How it is built

The app is small on purpose: about 12 MB on disk and about 40 MB of memory for the backend.

- **Tauri** provides the window using the system WebKit, so there is no bundled browser engine.
- The UI (React, CodeMirror 6) and the API (Hono) are served by a local server bound to `127.0.0.1` on a random port. Every API call needs a token that the app generates at launch.
- That server runs on **[txiki.js](https://github.com/saghul/txiki.js)**, a ~6 MB JavaScript runtime built on QuickJS, instead of shipping Bun or Node (~60 MB). In development the same code runs on Bun; `src/server/runtime/` hides the differences.
- `scripts/build-server.ts` bundles the server into one file and downloads a checksum-verified txiki.js binary as the Tauri sidecar.

```
src/
  shared/   frontmatter, prompt syntax, note metadata (used by both sides, unit-tested)
  server/   vault (index, watch, search, trash), HTTP API, runtimes (Bun / txiki.js)
  client/   React UI, CodeMirror extensions, Markdown preview
src-tauri/  the native shell: starts the sidecar and points the window at it
```

## License

MIT
