import { watch } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { CommandResult, CommandRunner, RunOptions } from "../exec.ts";
import type { FileSystem, Runtime } from "./types.ts";

export class BunCommandRunner implements CommandRunner {
  async run(cmd: string[], opts: RunOptions = {}): Promise<CommandResult> {
    let proc: Bun.Subprocess<"ignore" | Uint8Array, "pipe", "pipe">;
    try {
      proc = Bun.spawn(cmd, {
        stdin: opts.stdin === undefined ? "ignore" : new TextEncoder().encode(opts.stdin),
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      // 実行ファイルが無いと Bun.spawn は throw する。呼び出し側が終了コードだけを見られるよう 127 にする
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 127,
        timedOut: false,
      };
    }
    let timedOut = false;
    const timer =
      opts.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            proc.kill();
          }, opts.timeoutMs);
    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return { stdout, stderr, exitCode: await proc.exited, timedOut };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export const bunFileSystem: FileSystem = {
  readText: (path) => readFile(path, "utf8"),
  async readBytes(path) {
    const file = Bun.file(path);
    return (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : null;
  },
  async writeText(path, text) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, text);
    await rename(temp, path);
  },
  async list(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  },
  async stat(path) {
    try {
      const s = await stat(path);
      return {
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        size: s.size,
        mtime: s.mtimeMs,
        birthtime: s.birthtimeMs,
      };
    } catch {
      return null;
    }
  },
  async makeDir(path) {
    await mkdir(path, { recursive: true });
  },
  rename: (from, to) => rename(from, to),
  remove: (path) => rm(path, { recursive: true, force: true }),
  watch(dir, onChange) {
    const watcher = watch(dir, { recursive: true }, (_event, name) => {
      if (name !== null) onChange(String(name));
    });
    return () => watcher.close();
  },
};

export function bunRuntime(): Runtime {
  return {
    runner: new BunCommandRunner(),
    fs: bunFileSystem,
    serve(port, fetch) {
      // 変更待ちの長いリクエストが idle timeout（既定 10 秒）で切られないよう延ばす
      const server = Bun.serve({ hostname: "127.0.0.1", port, fetch, idleTimeout: 60 });
      return { port: server.port ?? port, stop: () => server.stop(true) };
    },
    async isPortFree(port) {
      try {
        const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("") });
        await server.stop(true);
        return true;
      } catch {
        return false;
      }
    },
    homeDir: () => homedir(),
  };
}
