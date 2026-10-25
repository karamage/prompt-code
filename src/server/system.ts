import type { CommandRunner } from "./exec.ts";

/** OS の機能。テストでは偽物に差し替える */
export interface SystemActions {
  copy(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  /** Finder でファイルを選んだ状態で開く */
  reveal(path: string): Promise<void>;
  /** フォルダを選ぶダイアログを出す。取り消されたら null */
  chooseFolder(prompt: string): Promise<string | null>;
}

/** AppleScript の文字列リテラルに埋め込む。引用符とバックスラッシュだけを逃がす */
export function appleScriptString(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export class MacSystemActions implements SystemActions {
  constructor(private readonly runner: CommandRunner) {}

  async copy(text: string): Promise<void> {
    // pbcopy は環境変数のロケールが無いと UTF-8 を化けさせる
    const result = await this.runner.run(["/usr/bin/env", "LANG=en_US.UTF-8", "pbcopy"], {
      stdin: text,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr || "pbcopy failed");
  }

  async openUrl(url: string): Promise<void> {
    await this.runner.run(["open", url]);
  }

  async reveal(path: string): Promise<void> {
    await this.runner.run(["open", "-R", path]);
  }

  async chooseFolder(prompt: string): Promise<string | null> {
    // osascript は前面に出ないので、System Events ではなくアプリとして choose folder を呼ぶ
    const result = await this.runner.run([
      "osascript",
      "-e",
      `POSIX path of (choose folder with prompt ${appleScriptString(prompt)})`,
    ]);
    if (result.exitCode !== 0) return null;
    const path = result.stdout.trim().replace(/\/$/, "");
    return path === "" ? null : path;
  }
}
