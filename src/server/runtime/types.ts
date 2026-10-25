import type { CommandRunner } from "../exec.ts";

export interface FileStat {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  /** ミリ秒 */
  mtime: number;
  birthtime: number;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

/**
 * サーバが使うファイル操作。ランタイムごとに API が違うので、ここで揃える。
 * パスはすべて絶対パス
 */
export interface FileSystem {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** 書きかけのファイルが残らないよう、隣に書いてから置き換える。親のディレクトリも作る */
  writeText(path: string, text: string): Promise<void>;
  list(dir: string): Promise<DirEntry[]>;
  /** 無ければ null */
  stat(path: string): Promise<FileStat | null>;
  makeDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** rm -rf と同じ。無くても失敗しない */
  remove(path: string): Promise<void>;
  /** dir の下のどこかが変わったら、dir からの相対パスで知らせる。止める関数を返す */
  watch(dir: string, onChange: (path: string) => void): () => void;
}

export interface HttpServer {
  readonly port: number;
  stop(): Promise<void>;
}

/**
 * サーバを動かすランタイムごとに違う部分。
 * 開発とテストは Bun で、配布するアプリは txiki.js（小さな JS ランタイム）で動かす
 */
export interface Runtime {
  runner: CommandRunner;
  fs: FileSystem;
  /** 127.0.0.1 で待ち受ける。port が 0 なら空いているポートを OS に選ばせる */
  serve(port: number, fetch: (request: Request) => Response | Promise<Response>): HttpServer;
  isPortFree(port: number): Promise<boolean>;
  homeDir(): string;
}
