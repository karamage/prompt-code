import { dirname, join } from "./tjs-node/path.ts";
import type { CommandResult, CommandRunner, RunOptions } from "../exec.ts";
import type { FileSystem, Runtime } from "./types.ts";

const decoder = new TextDecoder();

export class TjsCommandRunner implements CommandRunner {
  async run(cmd: string[], opts: RunOptions = {}): Promise<CommandResult> {
    // txiki.js 26.6 の tjs.spawn は、stdin のパイプに書くと書き終わらずに止まる（saghul/txiki.js#1027）。
    // 一時ファイルに書いて、sh のリダイレクトで渡す
    const stdinDir =
      opts.stdin === undefined
        ? undefined
        : await tjs.makeTempDir(join(tjs.tmpDir, "prompt-code-stdin-XXXXXX"));
    const argv =
      stdinDir === undefined
        ? cmd
        : ["/bin/sh", "-c", 'exec "$@" < "$0"', join(stdinDir, "stdin"), ...cmd];
    if (stdinDir !== undefined) await tjs.writeFile(join(stdinDir, "stdin"), opts.stdin ?? "");

    try {
      let proc: tjs.Process;
      try {
        proc = tjs.spawn(argv, {
          env: tjs.env,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
      } catch (error) {
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
          proc.stdout?.text() ?? "",
          proc.stderr?.text() ?? "",
        ]);
        const status = await proc.wait();
        // シグナルで止められたときの exit_status は 0 なので、失敗として 1 を返す
        const exitCode = status.term_signal === null ? status.exit_status : 1;
        return { stdout, stderr, exitCode, timedOut };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } finally {
      if (stdinDir !== undefined) await tjs.remove(stdinDir);
    }
  }
}

let tempCounter = 0;

export const tjsFileSystem: FileSystem = {
  readText: async (path) => decoder.decode(await tjs.readFile(path)),
  async readBytes(path) {
    try {
      return await tjs.readFile(path);
    } catch {
      return null;
    }
  },
  async writeText(path, text) {
    await tjs.makeDir(dirname(path), { recursive: true });
    tempCounter += 1;
    const temp = `${path}.${tjs.pid}-${tempCounter}.tmp`;
    await tjs.writeFile(temp, text);
    await tjs.rename(temp, path);
  },
  async list(dir) {
    const entries: { name: string; isDirectory: boolean; isFile: boolean }[] = [];
    for await (const entry of await tjs.readDir(dir)) {
      entries.push({ name: entry.name, isDirectory: entry.isDirectory, isFile: entry.isFile });
    }
    return entries;
  },
  async stat(path) {
    try {
      const s = await tjs.stat(path);
      return {
        isDirectory: s.isDirectory,
        isFile: s.isFile,
        size: s.size,
        mtime: s.mtim.getTime(),
        birthtime: s.birthtim.getTime(),
      };
    } catch {
      return null;
    }
  },
  async makeDir(path) {
    await tjs.makeDir(path, { recursive: true });
  },
  rename: (from, to) => tjs.rename(from, to),
  remove: (path) => tjs.remove(path),
  watch(dir, onChange) {
    const watcher = tjs.watch(dir, (path) => onChange(path));
    return () => watcher.close();
  },
};

export function tjsRuntime(): Runtime {
  return {
    runner: new TjsCommandRunner(),
    fs: tjsFileSystem,
    serve(port, fetch) {
      // tjs は 2 つ目の引数に接続の情報を渡す。Hono が環境変数と取り違えないよう、request だけを渡す
      const server = tjs.serve({ port, listenIp: "127.0.0.1", fetch: (request) => fetch(request) });
      return { port: server.port, stop: () => server.close() };
    },
    // tjs.serve は使用中のポートでも失敗しない（SO_REUSEPORT で重ねて待ち受ける）ので、
    // 先に繋いでみて、繋がったら使用中とみなす
    async isPortFree(port) {
      try {
        (await tjs.connect("tcp", "127.0.0.1", port)).close();
        return false;
      } catch {
        return true;
      }
    },
    homeDir: () => tjs.homeDir,
  };
}
