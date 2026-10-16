// 更新確認(画面から切り離した純粋な部分と、GitHub Releases API の取得)。
//
// 公開済みのリリースそのものを見る。version.json を見る方式だと、リリース(ビルド・公開)に失敗しても
// version.json だけ先に更新されるため、存在しないリリースを案内してしまう。

export const REPO = "yumebi/tse-stock";
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const ALLOWED_URL_PREFIX = `https://github.com/${REPO}/`;

/** "v1.2.3" / "1.2" などを数値の配列にする。版番号として読めなければ null。 */
export function parseVersion(text) {
  const m = /^[vV]?(\d+(?:\.\d+){0,3})$/.exec(String(text ?? "").trim());
  return m ? m[1].split(".").map(Number) : null;
}

/**
 * latest が current より新しいか。数値で比較する("1.10.0" は "1.9.0" より新しい)。
 * どちらかが版番号として読めない場合は false(誤って「更新あり」と案内しない)。
 * 以前は「文字列が違えば更新あり」だったため、手元が新しい場合や、リモートの記載が遅れている場合も案内していた。
 */
export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** 案内するリンクは自リポジトリのページだけ。 */
export function isAllowedReleaseUrl(url) {
  return typeof url === "string" && url.startsWith(ALLOWED_URL_PREFIX);
}

/**
 * 最新リリースを取得する。取得できない(オフライン・API制限・形式不正など)ときは null。
 * @returns {{version: string, url: string} | null} version は先頭の v を除いたもの。url は許可されない場合は空文字。
 */
export async function fetchLatestRelease(fetchFn = fetch, timeoutMs = 5000) {
  try {
    const res = await fetchFn(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = parseVersion(json.tag_name);
    if (!parsed) return null;
    return {
      version: parsed.join("."),
      url: isAllowedReleaseUrl(json.html_url) ? json.html_url : "",
    };
  } catch {
    return null;
  }
}
