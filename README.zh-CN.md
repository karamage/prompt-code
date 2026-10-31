# Prompt Code

<p align="center"><a href="https://karamage.github.io/prompt-code/zh-CN/"><img src="docs/screenshots/promo-en.png" alt="Prompt Code：不再重复输入提示词。带变量的 Markdown 模板，填好即可粘贴到任何地方。"></a></p>

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

一款面向 AI 提示词的 macOS Markdown 编辑器和代码片段管理器。

Prompt Code 借鉴了 Obsidian 中让写作舒适的部分：保存在你自己文件夹里的普通 Markdown 文件、`[[链接]]`、反向链接、关系图和命令面板；也借鉴了 massCode 中让复用快捷的部分：文件夹、标签、收藏和一键复制。在此基础上，它补上了提示词需要的功能：可填写的变量、可复用的嵌入片段，以及永远不会发给模型的个人备注。

[网站](https://karamage.github.io/prompt-code/zh-CN/) · [下载](https://github.com/karamage/prompt-code/releases/latest)

[English](README.md) · [日本語](README.ja.md) · 简体中文 · [한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

![Prompt Code：笔记列表、包含变量的提示词，以及显示最终提示词的“使用”面板](docs/screenshots/main-en.png)

## 功能

- **变量。** 写 `{{topic}}`、`{{audience: engineers}}`（默认值）或 `{{tone: friendly | formal}}`（选项）。“使用”面板会把它们变成输入框，并在你输入时实时显示最终的提示词。按 `⌘↵` 复制。
- **嵌入。** `![[回答格式]]` 会在复制时把另一篇笔记的内容带进来。把角色设定或输出格式要求放在一处，到处嵌入。
- **给自己的备注。** `<!-- 像这样 -->` 会保留在文件中，复制时被移除。
- **链接与标签。** 支持自动补全的 `[[笔记]]` 链接、反向链接、`#标签` 和关系图视图（`⌘G`）。重命名笔记时，指向它的链接会自动更新。
- **快速跳转。** `⌘K` 跳转到任意笔记，`>` 执行命令，`⇧⌘F` 搜索所有笔记的正文。
- **文件保持原样。** 笔记库就是一个存放带 YAML frontmatter（`tags`、`favorite`、`description`）的 `.md` 文件的文件夹。用其他应用编辑，Prompt Code 会实时读取改动。删除的笔记会移到笔记库内的 `.trash/`。
- **在任意位置快速粘贴。** 在任何应用中按 `⌥⌘V`，会打开一个显示剪贴板历史和提示词的小窗口。选中一项，就会直接粘贴到你刚才使用的应用中。含有变量的提示词可以先在窗口里填好再粘贴。
- **菜单栏中的剪贴板历史。** Prompt Code 常驻菜单栏，保留你复制的文本（默认 200 条）。密码管理器标记为隐藏的复制内容永远不会被记录。最近的剪贴内容和收藏的提示词在菜单栏菜单中一键可达。
- **编写、分栏、阅读。** 代码块带语法高亮的 Markdown 编辑器，以及阅读视图。
- 浅色和深色主题、五种强调色。应用界面支持英语和日语。

<p align="center"><img src="docs/screenshots/quick-paste-en.png" width="600" alt="快速粘贴：在任意应用中选择提示词，并粘贴到正在输入的位置"></p>

数据不会离开你的 Mac。Prompt Code 没有账号和遥测，也不发出任何网络请求。

首次粘贴到其他应用时，macOS 会请求你在 **系统设置 › 隐私与安全性 › 辅助功能** 中允许 Prompt Code。未授权时，快速粘贴仍会帮你复制文本，你可以用 `⌘V` 自行粘贴。关闭窗口后 Prompt Code 会留在菜单栏中；可从菜单栏菜单或按 `⌘Q` 退出。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `⌘K` | 跳转到笔记（输入 `>` 执行命令） |
| `⌘N` / `⇧⌘N` | 新建笔记 / 新建文件夹 |
| `⇧⌘F` | 搜索所有笔记 |
| `⌘↵` | 填写变量；在面板中则为复制 |
| `⇧⌘C` | 以当前值复制提示词 |
| `⌘E` | 在编写和阅读之间切换 |
| `⌘\` | 隐藏或显示侧边栏 |
| `⌘G` | 关系图 |
| `⌘D` | 复制笔记 |
| `⌘⌫` | 将笔记移到废纸篓（可在提示中撤销） |
| `⌘,` | 设置 |
| `⌥⌘V`（任意位置） | 快速粘贴（可在设置中修改） |
| `↵` / `⌘↵` / `⌘1`–`⌘9` | 在快速粘贴中：粘贴 / 仅复制 / 粘贴对应的行 |
| `⌘`-点击 | 在编辑器中打开 `[[链接]]` |

## 构建

要求：macOS 11 及以上、[Bun](https://bun.sh) 和 Rust（rustup 会自动安装 `rust-toolchain.toml` 中指定的工具链）。

```sh
bun install
bun run app:build        # src-tauri/target/release/bundle/macos/Prompt Code.app
bun run app:dmg          # 未签名的 DMG
bun run release:mac      # 已签名并公证的 DMG（需要 Developer ID，详见脚本）
```

在浏览器中开发：

```sh
bun run build:client && bun run dev:server   # http://127.0.0.1:4721
bun run dev:client                            # 在 :5183 上启动带热重载的 Vite（代理 /api）
bun run check                                 # 类型检查、lint、格式检查、测试
```

`dev:server` 支持用 `--vault <dir>` 打开其他文件夹。设置保存在 `~/.config/prompt-code/`（可用 `PROMPT_CODE_HOME` 覆盖）。默认的笔记库是 `~/PromptCode`。

## 实现方式

这个应用刻意保持小巧：磁盘占用约 12 MB，后端内存约 40 MB。

- **Tauri** 使用系统 WebKit 提供窗口，因此不捆绑浏览器引擎。
- UI（React、CodeMirror 6）和 API（Hono）由绑定在 `127.0.0.1` 随机端口上的本地服务器提供。每次 API 调用都需要应用启动时生成的令牌。
- 该服务器运行在 **[txiki.js](https://github.com/saghul/txiki.js)** 上，这是一个基于 QuickJS、约 6 MB 的 JavaScript 运行时，而不是打包 Bun 或 Node（约 60 MB）。开发时同一份代码运行在 Bun 上，`src/server/runtime/` 屏蔽了两者的差异。
- `scripts/build-server.ts` 把服务器打包成单个文件，并下载经过校验和验证的 txiki.js 二进制文件作为 Tauri sidecar。

```
src/
  shared/   frontmatter、提示词语法、笔记元数据（两端共用，有单元测试）
  server/   笔记库（索引、监听、搜索、废纸篓）、HTTP API、运行时（Bun / txiki.js）
  client/   React UI、CodeMirror 扩展、Markdown 预览
src-tauri/  原生外壳：启动 sidecar 并让窗口指向它
```

## 许可证

MIT
