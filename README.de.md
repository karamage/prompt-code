# Prompt Code

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

Ein Markdown-Editor und Snippet-Manager für KI-Prompts, für macOS.

Prompt Code übernimmt von Obsidian, was das Schreiben angenehm macht – einfache Markdown-Dateien in einem eigenen Ordner, `[[Links]]`, Backlinks, einen Graphen, eine Befehlspalette – und von massCode, was das Wiederverwenden schnell macht – Ordner, Tags, Favoriten, Kopieren mit einem Klick. Darauf setzt es, was Prompts brauchen: Variablen zum Ausfüllen, wiederverwendbare eingebettete Bausteine und Notizen für dich selbst, die nie beim Modell ankommen.

[Website](https://karamage.github.io/prompt-code/de/) · [Download](https://github.com/karamage/prompt-code/releases/latest)

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md) · [Español](README.es.md) · Deutsch · [Français](README.fr.md)

![Prompt Code: die Notizliste, ein Prompt mit Variablen und das Verwenden-Feld mit dem fertigen Prompt](docs/screenshots/main-en.png)

## Was du damit machen kannst

- **Variablen.** Schreibe `{{topic}}`, `{{audience: engineers}}` (Standardwert) oder `{{tone: friendly | formal}}` (Auswahl). Das Feld **Verwenden** macht daraus Eingabefelder und zeigt den fertigen Prompt, während du tippst. `⌘↵` kopiert ihn.
- **Einbettungen.** `![[Antwortformat]]` holt beim Kopieren eine andere Notiz herein. Lege eine Persona oder ein Ausgabeformat an einer Stelle ab und bette es überall ein.
- **Notizen für dich.** `<!-- so etwas -->` bleibt in der Datei und wird beim Kopieren entfernt.
- **Links und Tags.** `[[Notiz]]`-Links mit Autovervollständigung, Backlinks, `#Tags` und eine Graphansicht (`⌘G`). Wenn du eine Notiz umbenennst, werden Links darauf umgeschrieben.
- **Schnelle Navigation.** `⌘K` springt zu jeder Notiz, `>` führt Befehle aus, `⇧⌘F` durchsucht den Text aller Notizen.
- **Deine Dateien, wie sie sind.** Der Vault ist ein Ordner mit `.md`-Dateien und YAML-Frontmatter (`tags`, `favorite`, `description`). Bearbeite sie mit jeder anderen App – Prompt Code übernimmt die Änderungen sofort. Gelöschte Notizen landen in `.trash/` im Vault.
- **Schnelles Einfügen von überall.** Drücke in jeder App `⌥⌘V`, um ein kleines Fenster mit deinem Zwischenablageverlauf und deinen Prompts zu öffnen. Wähle einen aus, und er wird direkt in die App eingefügt, die du gerade benutzt hast. Bei Prompts mit Variablen füllst du sie vorher direkt dort aus.
- **Zwischenablageverlauf in der Menüleiste.** Prompt Code bleibt in der Menüleiste und behält den Text, den du kopierst (standardmäßig 200 Einträge). Kopien, die Passwortmanager als verborgen markieren, werden nie aufgezeichnet. Die letzten Einträge und Lieblings-Prompts erreichst du mit einem Klick im Menüleistenmenü.
- **Schreiben, teilen, lesen.** Ein Markdown-Editor mit Syntaxhervorhebung für Codeblöcke und eine Leseansicht.
- Helles und dunkles Design, fünf Akzentfarben. Die App-Oberfläche gibt es auf Englisch und Japanisch.

<p align="center"><img src="docs/screenshots/quick-paste-en.png" width="600" alt="Schnelles Einfügen: einen Prompt aus jeder App auswählen und dort einfügen, wo du getippt hast"></p>

Nichts verlässt deinen Mac. Prompt Code hat kein Konto und keine Telemetrie und stellt keine Netzwerkanfragen.

Zum Einfügen in andere Apps bittet macOS dich beim ersten Mal, Prompt Code unter **Systemeinstellungen › Datenschutz & Sicherheit › Bedienungshilfen** zu erlauben. Ohne diese Erlaubnis kopiert das schnelle Einfügen den Text trotzdem, und du fügst ihn mit `⌘V` ein. Wenn du das Fenster schließt, bleibt Prompt Code in der Menüleiste; beende es über das Menüleistenmenü oder mit `⌘Q`.

## Tastenkürzel

| Taste | Funktion |
| --- | --- |
| `⌘K` | Zu einer Notiz springen (`>` für Befehle) |
| `⌘N` / `⇧⌘N` | Neue Notiz / neuer Ordner |
| `⇧⌘F` | Alle Notizen durchsuchen |
| `⌘↵` | Variablen ausfüllen; im Feld kopieren |
| `⇧⌘C` | Prompt mit aktuellen Werten kopieren |
| `⌘E` | Zwischen Schreiben und Lesen wechseln |
| `⌘\` | Seitenleisten aus- oder einblenden |
| `⌘G` | Graph |
| `⌘D` | Notiz duplizieren |
| `⌘⌫` | Notiz in den Papierkorb (in der Meldung rückgängig machen) |
| `⌘,` | Einstellungen |
| `⌥⌘V` (überall) | Schnelles Einfügen – in den Einstellungen änderbar |
| `↵` / `⌘↵` / `⌘1`–`⌘9` | Im schnellen Einfügen: einfügen / nur kopieren / diese Zeile einfügen |
| `⌘`-Klick | Einem `[[Link]]` im Editor folgen |

## Bauen

Voraussetzungen: macOS 11 oder neuer, [Bun](https://bun.sh) und Rust (die Toolchain aus `rust-toolchain.toml` installiert rustup automatisch).

```sh
bun install
bun run app:build        # src-tauri/target/release/bundle/macos/Prompt Code.app
bun run app:dmg          # ein unsigniertes DMG
bun run release:mac      # signierte und notarisierte DMGs (braucht eine Developer ID; siehe Skript)
```

Im Browser entwickeln:

```sh
bun run build:client && bun run dev:server   # http://127.0.0.1:4721
bun run dev:client                            # Vite mit Hot Reload auf :5183 (leitet /api weiter)
bun run check                                 # Typprüfung, Lint, Formatprüfung, Tests
```

`dev:server` akzeptiert `--vault <dir>`, um einen anderen Ordner zu öffnen. Einstellungen liegen in `~/.config/prompt-code/` (mit `PROMPT_CODE_HOME` überschreibbar). Der Standard-Vault ist `~/PromptCode`.

## Wie sie gebaut ist

Die App ist absichtlich klein: etwa 12 MB auf der Festplatte und etwa 40 MB Arbeitsspeicher für das Backend.

- **Tauri** stellt das Fenster mit dem WebKit des Systems bereit, es wird also keine Browser-Engine mitgeliefert.
- Die Oberfläche (React, CodeMirror 6) und die API (Hono) liefert ein lokaler Server aus, der an `127.0.0.1` auf einem zufälligen Port gebunden ist. Jeder API-Aufruf braucht ein Token, das die App beim Start erzeugt.
- Dieser Server läuft auf **[txiki.js](https://github.com/saghul/txiki.js)**, einer ~6 MB großen JavaScript-Laufzeit auf Basis von QuickJS, statt Bun oder Node (~60 MB) mitzuliefern. In der Entwicklung läuft derselbe Code auf Bun; `src/server/runtime/` verbirgt die Unterschiede.
- `scripts/build-server.ts` bündelt den Server in eine Datei und lädt eine per Prüfsumme verifizierte txiki.js-Binärdatei als Tauri-Sidecar herunter.

```
src/
  shared/   Frontmatter, Prompt-Syntax, Notiz-Metadaten (von beiden Seiten genutzt, mit Unit-Tests)
  server/   Vault (Index, Überwachung, Suche, Papierkorb), HTTP-API, Laufzeiten (Bun / txiki.js)
  client/   React-Oberfläche, CodeMirror-Erweiterungen, Markdown-Vorschau
src-tauri/  die native Hülle: startet den Sidecar und richtet das Fenster darauf aus
```

## Lizenz

MIT
