export const USAGE = `Usage: prompt-code-server [--port <number>] [--desktop] [--client-dir <dir>] [--vault <dir>]

  --port <number>     Port to listen on (default 4721; the next free port is used if busy; 0 lets the OS pick)
  --desktop           Started by the desktop app: do not open a browser, print the URL when ready
  --client-dir <dir>  Directory of the built UI (default dist/client)
  --vault <dir>       Open this folder as the vault instead of the one in the settings
  -h, --help          Show this help`;

export interface RunOptions {
  kind: "run";
  port: number | null;
  desktop: boolean;
  clientDir: string | null;
  vault: string | null;
}

export type CliOptions = RunOptions | { kind: "help" } | { kind: "error"; message: string };

/** --opt value と --opt=value の両方を受け付ける。どちらでもなければ null */
function optionValue(
  args: readonly string[],
  index: number,
  name: string,
): { value: string | undefined; next: number } | null {
  const arg = args[index];
  if (arg === name) return { value: args[index + 1], next: index + 1 };
  if (arg?.startsWith(`${name}=`)) return { value: arg.slice(name.length + 1), next: index };
  return null;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  const options: RunOptions = {
    kind: "run",
    port: null,
    desktop: false,
    clientDir: null,
    vault: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") return { kind: "help" };
    if (arg === "--desktop") {
      options.desktop = true;
      continue;
    }

    const port = optionValue(args, i, "--port");
    if (port !== null) {
      i = port.next;
      const value = Number(port.value);
      if (!/^\d+$/.test(port.value ?? "") || value > 65535) {
        return {
          kind: "error",
          message: `--port must be a number from 0 to 65535: ${port.value ?? "(none)"}`,
        };
      }
      options.port = value;
      continue;
    }

    let matched = false;
    for (const [name, key] of [
      ["--client-dir", "clientDir"],
      ["--vault", "vault"],
    ] as const) {
      const option = optionValue(args, i, name);
      if (option === null) continue;
      i = option.next;
      if (option.value === undefined || option.value === "") {
        return { kind: "error", message: `${name} needs a directory` };
      }
      options[key] = option.value;
      matched = true;
    }
    if (matched) continue;

    return { kind: "error", message: `Unknown option: ${arg}` };
  }
  return options;
}
