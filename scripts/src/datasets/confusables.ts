/** Source scripts we keep: the ones realistically used in IDN homoglyph attacks on Latin brands. */
const SOURCE_SCRIPT = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]$/u;
const LATIN_TARGET = /^\p{Script=Latin}+$/u;

/**
 * Parses Unicode `confusables.txt` into a `{ char: latinSkeleton }` map,
 * keeping single code points from Latin/Cyrillic/Greek whose prototype is
 * made only of Latin letters.
 */
export function parseConfusables(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine
      .replace(/^\uFEFF/, '')
      .split('#')[0]!
      .trim();
    if (!line) continue;
    const [src, dst] = line.split(';').map((f) => f.trim());
    if (!src || !dst) continue;
    const source = String.fromCodePoint(...src.split(/\s+/).map((h) => parseInt(h, 16)));
    const target = String.fromCodePoint(...dst.split(/\s+/).map((h) => parseInt(h, 16)));
    if (!SOURCE_SCRIPT.test(source) || !LATIN_TARGET.test(target) || source === target) continue;
    map[source] = target;
  }
  return map;
}
