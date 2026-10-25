import type { ClipboardItem } from "../shared/api.ts";
import type { FileSystem } from "./runtime/types.ts";

/** 1 件の大きさの上限。これより大きいものは履歴に残さない（画像の base64 などで膨らまないように） */
const MAX_TEXT = 200_000;

/**
 * クリップボードの履歴。新しいものが先頭。同じ中身をもう一度コピーしたら、先頭へ移す。
 * 自分の Mac の中だけに置くファイルなので、持ち主だけが読めるようにする
 */
export class ClipboardHistory {
  private items: ClipboardItem[] | null = null;
  private counter = 0;

  constructor(
    private readonly fs: FileSystem,
    private readonly path: string,
    /** 履歴が変わったら呼ぶ。メニューバーのメニューを作り直すのに使う */
    private readonly onChange: (items: readonly ClipboardItem[]) => void = () => {},
  ) {}

  async list(): Promise<ClipboardItem[]> {
    if (this.items !== null) return this.items;
    try {
      const raw: unknown = JSON.parse(await this.fs.readText(this.path));
      this.items = Array.isArray(raw)
        ? raw.filter(
            (item): item is ClipboardItem =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as ClipboardItem).id === "string" &&
              typeof (item as ClipboardItem).text === "string" &&
              typeof (item as ClipboardItem).at === "number",
          )
        : [];
    } catch {
      this.items = [];
    }
    return this.items;
  }

  /** 履歴に足す。空白だけのものや大きすぎるものは足さない。足したら true */
  async add(text: string, limit: number, now = Date.now()): Promise<boolean> {
    if (text.trim() === "" || text.length > MAX_TEXT) return false;
    const items = await this.list();
    if (items[0]?.text === text) return false;
    this.counter += 1;
    const item: ClipboardItem = { id: `${now.toString(36)}-${this.counter}`, text, at: now };
    this.items = [item, ...items.filter((existing) => existing.text !== text)].slice(0, limit);
    await this.save();
    return true;
  }

  async get(id: string): Promise<ClipboardItem | undefined> {
    return (await this.list()).find((item) => item.id === id);
  }

  async remove(id: string): Promise<void> {
    this.items = (await this.list()).filter((item) => item.id !== id);
    await this.save();
  }

  async clear(): Promise<void> {
    this.items = [];
    await this.save();
  }

  /** 件数を減らしたときに、あふれた分を落とす */
  async trim(limit: number): Promise<void> {
    const items = await this.list();
    if (items.length <= limit) return;
    this.items = items.slice(0, limit);
    await this.save();
  }

  private async save(): Promise<void> {
    const items = this.items ?? [];
    await this.fs.writeText(this.path, JSON.stringify(items));
    this.onChange(items);
  }
}
