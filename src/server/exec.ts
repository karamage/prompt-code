export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface RunOptions {
  timeoutMs?: number;
  stdin?: string;
}

export interface CommandRunner {
  run(cmd: string[], opts?: RunOptions): Promise<CommandResult>;
}

/** テスト用。コマンド行をスペース結合したものをキーに応答を引く */
export class FakeCommandRunner implements CommandRunner {
  readonly calls: string[][] = [];
  readonly stdins: (string | undefined)[] = [];

  constructor(private readonly responses: Record<string, Partial<CommandResult>> = {}) {}

  async run(cmd: string[], opts: RunOptions = {}): Promise<CommandResult> {
    this.calls.push(cmd);
    this.stdins.push(opts.stdin);
    const response = this.responses[cmd.join(" ")] ?? {};
    return {
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
      exitCode: response.exitCode ?? 0,
      timedOut: response.timedOut ?? false,
    };
  }
}
