// 列のグループ(表示切替の単位)の並べ替え。画面に触れない純粋な計算なので、Node で単体テストできる。

// colOrder: 列キーの並び。allCols: 列の定義(k, toggle)。newGroupOrder: グループ(toggle)の新しい並び。
// グループ内の列の並びは保ち、グループが占めていた位置に、新しい順でグループの列を詰め直す。
// 不正な並び(件数・重複・知らないグループ)なら null を返す。
export function reorderGroupKeys(colOrder, allCols, newGroupOrder) {
  const toggleOf = (k) => allCols.find((c) => c.k === k)?.toggle;
  const groups = [];
  for (const k of colOrder) {
    const g = toggleOf(k);
    if (g && !groups.includes(g)) groups.push(g);
  }
  if (!Array.isArray(newGroupOrder) || newGroupOrder.length !== groups.length) return null;
  if (new Set(newGroupOrder).size !== groups.length) return null;
  if (newGroupOrder.some((g) => !groups.includes(g))) return null;

  const keysOf = (g) => colOrder.filter((k) => toggleOf(k) === g);
  const positions = groups.flatMap(keysOf).map((k) => colOrder.indexOf(k)).sort((a, b) => a - b);
  const newKeys = newGroupOrder.flatMap(keysOf);
  const result = [...colOrder];
  positions.forEach((pos, i) => { result[pos] = newKeys[i]; });
  return result;
}
