# Prompt Code

A Markdown editor and snippet manager for AI prompts, for macOS.

Prompt Code takes the parts of Obsidian that make writing pleasant — plain Markdown files in a folder you own, `[[links]]`, backlinks, a graph, a command palette — and the parts of massCode that make reuse fast — folders, tags, favorites, one-click copy. On top of both it adds what prompts need: fill-in variables, reusable embedded fragments, and notes to yourself that never reach the model.

[日本語の README](README.ja.md)

## What you can do

- **Variables.** Write `{{topic}}`, `{{audience: engineers}}` (default value) or `{{tone: friendly | formal}}` (choices). The **Use** panel turns them into fields and shows the finished prompt as you type. `⌘↵` copies it.
- **Embeds.** `![[Answer format]]` pulls another note in when you copy. Keep a persona or an output contract in one place and embed it everywhere.
- **Notes to yourself.** `<!-- like this -->` stays in the file and is removed on copy.
- **Links and tags.** `[[Note]]` links with autocomplete, backlinks, `#tags`, and a graph view (`⌘G`). Renaming a note rewrites links to it.
- **Fast navigation.** `⌘K` jumps to any note, `>` runs commands, `⇧⌘F` searches every note's text.
- **Your files, as they are.** The vault is a folder of `.md` files with YAML frontmatter (`tags`, `favorite`, `description`). Edit them with any other app — Prompt Code picks up the changes live. Deleted notes go to `.trash/` inside the vault.
- **Write, split, read.** A Markdown editor with syntax highlighting for code blocks, and a reading view.
- Light and dark themes, five accent colors, English and Japanese.

Nothing leaves your Mac. Prompt Code has no account, no telemetry, and makes no network requests.

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
