import { join } from "node:path";
import { normalizeSettings, type Settings } from "../shared/settings.ts";
import type { FileSystem } from "./runtime/types.ts";

/** 設定と画面の状態を置くディレクトリを指す環境変数。無ければ ~/.config/prompt-code */
export const ENV_HOME = "PROMPT_CODE_HOME";

export function dataDir(
  home: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return env[ENV_HOME] ?? join(home, ".config", "prompt-code");
}

async function readOrNull(fs: FileSystem, path: string): Promise<string | null> {
  return (await fs.stat(path)) === null ? null : await fs.readText(path);
}

/** 設定。ファイルが無ければ既定値で始め、壊れていても読める項目だけ使う */
export class SettingsStore {
  private current: Settings | null = null;

  constructor(
    private readonly fs: FileSystem,
    private readonly path: string,
  ) {}

  async get(): Promise<Settings> {
    if (this.current !== null) return this.current;
    const raw = await readOrNull(this.fs, this.path);
    let parsed: unknown = null;
    try {
      parsed = raw === null ? null : JSON.parse(raw);
    } catch {
      console.error(`Could not parse ${this.path}. Using the default settings.`);
    }
    this.current = normalizeSettings(parsed);
    return this.current;
  }

  async save(raw: unknown): Promise<Settings> {
    const settings = normalizeSettings(raw);
    await this.fs.writeText(this.path, `${JSON.stringify(settings, null, 2)}\n`);
    this.current = settings;
    return settings;
  }
}

/** 画面の状態（開いていたノート、ペインの幅など）を保存するキー。決めたものだけを受け付ける */
export const STATE_KEYS = ["ui"] as const;
export type StateKey = (typeof STATE_KEYS)[number];

export function isStateKey(value: unknown): value is StateKey {
  return (STATE_KEYS as readonly unknown[]).includes(value);
}

/**
 * 画面の状態をファイルに置く。デスクトップアプリはサーバのポートが起動のたびに変わり、
 * localStorage はオリジンごとに分かれて引き継げないので、サーバ側に持つ
 */
export class StateStore {
  constructor(
    private readonly fs: FileSystem,
    private readonly dir: string,
  ) {}

  load(key: StateKey): Promise<string | null> {
    return readOrNull(this.fs, join(this.dir, `${key}.json`));
  }

  save(key: StateKey, data: string): Promise<void> {
    return this.fs.writeText(join(this.dir, `${key}.json`), data);
  }
}
