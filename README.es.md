# Prompt Code

<p align="center"><a href="https://karamage.github.io/prompt-code/es/"><img src="docs/screenshots/promo-en.png" alt="Prompt Code: deja de reescribir tus prompts. Plantillas Markdown con variables que rellenas y pegas en cualquier sitio."></a></p>

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

Un editor de Markdown y gestor de fragmentos para prompts de IA, para macOS.

Prompt Code toma de Obsidian lo que hace agradable escribir —archivos Markdown normales en una carpeta tuya, `[[enlaces]]`, retroenlaces, un grafo, una paleta de comandos— y de massCode lo que hace rápido reutilizar —carpetas, etiquetas, favoritos, copia con un clic—. Sobre ambos añade lo que necesitan los prompts: variables para rellenar, fragmentos reutilizables insertados y notas para ti que nunca llegan al modelo.

[Sitio web](https://karamage.github.io/prompt-code/es/) · [Descargar](https://github.com/karamage/prompt-code/releases/latest)

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md) · Español · [Deutsch](README.de.md) · [Français](README.fr.md)

![Prompt Code: la lista de notas, un prompt con variables y el panel Usar con el prompt terminado](docs/screenshots/main-en.png)

## Qué puedes hacer

- **Variables.** Escribe `{{topic}}`, `{{audience: engineers}}` (valor por defecto) o `{{tone: friendly | formal}}` (opciones). El panel **Usar** las convierte en campos y muestra el prompt terminado mientras escribes. `⌘↵` lo copia.
- **Inserciones.** `![[Formato de respuesta]]` trae otra nota al copiar. Guarda una persona o un formato de salida en un solo sitio e insértalo en todas partes.
- **Notas para ti.** `<!-- así -->` se queda en el archivo y se elimina al copiar.
- **Enlaces y etiquetas.** Enlaces `[[Nota]]` con autocompletado, retroenlaces, `#etiquetas` y una vista de grafo (`⌘G`). Al renombrar una nota se reescriben los enlaces que apuntan a ella.
- **Navegación rápida.** `⌘K` salta a cualquier nota, `>` ejecuta comandos, `⇧⌘F` busca en el texto de todas las notas.
- **Tus archivos, tal cual.** La bóveda es una carpeta de archivos `.md` con frontmatter YAML (`tags`, `favorite`, `description`). Edítalos con cualquier otra app: Prompt Code detecta los cambios al instante. Las notas eliminadas van a `.trash/` dentro de la bóveda.
- **Pegado rápido desde cualquier sitio.** Pulsa `⌥⌘V` en cualquier app para abrir una ventana pequeña con tu historial del portapapeles y tus prompts. Elige uno y se pega directamente en la app que estabas usando. En los prompts con variables puedes rellenarlas ahí mismo antes.
- **Historial del portapapeles en la barra de menús.** Prompt Code se queda en la barra de menús y guarda el texto que copias (200 elementos por defecto). Las copias que los gestores de contraseñas marcan como ocultas nunca se registran. Los recortes recientes y los prompts favoritos están a un clic en el menú de la barra de menús.
- **Escribir, dividir, leer.** Un editor de Markdown con resaltado de sintaxis en los bloques de código y una vista de lectura.
- Temas claro y oscuro y cinco colores de acento. La interfaz de la app está en inglés y japonés.

<p align="center"><img src="docs/screenshots/quick-paste-en.png" width="600" alt="Pegado rápido: elige un prompt desde cualquier app y pégalo donde estabas escribiendo"></p>

Nada sale de tu Mac. Prompt Code no tiene cuenta ni telemetría y no hace peticiones de red.

Para pegar en otras apps, la primera vez macOS te pide que permitas Prompt Code en **Ajustes del Sistema › Privacidad y seguridad › Accesibilidad**. Sin ese permiso, el pegado rápido igualmente copia el texto para que lo pegues con `⌘V`. Al cerrar la ventana, Prompt Code sigue en la barra de menús; sal desde el menú de la barra de menús o con `⌘Q`.

## Atajos

| Tecla | Acción |
| --- | --- |
| `⌘K` | Saltar a una nota (escribe `>` para comandos) |
| `⌘N` / `⇧⌘N` | Nueva nota / nueva carpeta |
| `⇧⌘F` | Buscar en todas las notas |
| `⌘↵` | Rellenar variables; dentro del panel, copiar |
| `⇧⌘C` | Copiar el prompt con los valores actuales |
| `⌘E` | Cambiar entre escribir y leer |
| `⌘\` | Ocultar o mostrar las barras laterales |
| `⌘G` | Grafo |
| `⌘D` | Duplicar nota |
| `⌘⌫` | Mover la nota a la papelera (se deshace desde el aviso) |
| `⌘,` | Ajustes |
| `⌥⌘V` (en cualquier sitio) | Pegado rápido — cámbialo en Ajustes |
| `↵` / `⌘↵` / `⌘1`–`⌘9` | En el pegado rápido: pegar / solo copiar / pegar esa fila |
| `⌘`-clic | Seguir un `[[enlace]]` en el editor |

## Compilar

Requisitos: macOS 11 o posterior, [Bun](https://bun.sh) y Rust (rustup instala automáticamente la toolchain de `rust-toolchain.toml`).

```sh
bun install
bun run app:build        # src-tauri/target/release/bundle/macos/Prompt Code.app
bun run app:dmg          # un DMG sin firmar
bun run release:mac      # DMG firmados y notarizados (requiere un Developer ID; ver el script)
```

Desarrollar en un navegador:

```sh
bun run build:client && bun run dev:server   # http://127.0.0.1:4721
bun run dev:client                            # Vite con recarga en caliente en :5183 (redirige /api)
bun run check                                 # tipos, lint, formato y tests
```

`dev:server` acepta `--vault <dir>` para abrir otra carpeta. Los ajustes se guardan en `~/.config/prompt-code/` (se cambia con `PROMPT_CODE_HOME`). La bóveda por defecto es `~/PromptCode`.

## Cómo está hecha

La app es pequeña a propósito: unos 12 MB en disco y unos 40 MB de memoria para el backend.

- **Tauri** proporciona la ventana usando el WebKit del sistema, así que no incluye ningún motor de navegador.
- La interfaz (React, CodeMirror 6) y la API (Hono) las sirve un servidor local enlazado a `127.0.0.1` en un puerto aleatorio. Cada llamada a la API necesita un token que la app genera al arrancar.
- Ese servidor se ejecuta sobre **[txiki.js](https://github.com/saghul/txiki.js)**, un runtime de JavaScript de ~6 MB basado en QuickJS, en lugar de incluir Bun o Node (~60 MB). En desarrollo el mismo código se ejecuta sobre Bun; `src/server/runtime/` oculta las diferencias.
- `scripts/build-server.ts` empaqueta el servidor en un solo archivo y descarga un binario de txiki.js con suma de verificación comprobada como sidecar de Tauri.

```
src/
  shared/   frontmatter, sintaxis de prompts, metadatos de notas (usados por ambos lados, con tests)
  server/   bóveda (índice, vigilancia, búsqueda, papelera), API HTTP, runtimes (Bun / txiki.js)
  client/   interfaz React, extensiones de CodeMirror, vista previa de Markdown
src-tauri/  el contenedor nativo: arranca el sidecar y apunta la ventana a él
```

## Licencia

MIT
