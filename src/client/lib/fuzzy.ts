/**
 * あいまい検索。query の文字が text に順に現れれば一致とし、
 * 語の頭や連続した一致を高く数える。一致した文字の位置も返す
 */
export interface FuzzyMatch {
  score: number;
  indices: number[];
}

export function fuzzy(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (q === "") return { score: 0, indices: [] };
  const lower = text.toLowerCase();
  // そのまま含むなら、それを最優先にする
  const direct = lower.indexOf(q);
  if (direct !== -1) {
    const atWord = direct === 0 || /[\s/_\-.]/.test(lower[direct - 1] ?? "");
    return {
      score: 1000 - direct + (atWord ? 200 : 0) - text.length * 0.1,
      indices: Array.from({ length: q.length }, (_, i) => direct + i),
    };
  }
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    const at = lower.indexOf(char, from);
    if (at === -1) return null;
    const atWord = at === 0 || /[\s/_\-.]/.test(lower[at - 1] ?? "");
    score += (at === previous + 1 ? 8 : 1) + (atWord ? 6 : 0);
    indices.push(at);
    previous = at;
    from = at + 1;
  }
  return { score: score - text.length * 0.1, indices };
}
