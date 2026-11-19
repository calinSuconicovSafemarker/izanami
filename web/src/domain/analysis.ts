// Derived values for the domain analysis panel (pure, no I/O).
import { editDistance } from './similarity';
import { skeleton } from '../lib/skeleton';

/** How alike two labels are, 0–100: edit distance scaled by the longer label's length. */
export function similarityPercent(label: string, brand: string): number {
  const longest = Math.max([...label].length, [...brand].length);
  if (longest === 0) return 100;
  return Math.round((1 - editDistance(label, brand) / longest) * 100);
}

/** One run of a label: plain text, or a homoglyph swapped in for `looksLike` in the brand. */
export type LabelSegment =
  | { text: string; swapped: false }
  | { text: string; swapped: true; looksLike: string; codePoints: string };

/** Longest look-alike run tried on either side (covers `rn` for `m`). */
const MAX_RUN = 3;

const codePointsOf = (s: string) =>
  [...s].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

/**
 * Split `label` into plain runs and homoglyph swaps against `brand`, aligning both left to right:
 * equal characters stay plain; otherwise the shortest pair of runs with the same confusables
 * skeleton is marked as a swap. Characters that match nothing stay plain.
 */
export function homoglyphSegments(label: string, brand: string): LabelSegment[] {
  const s = [...label];
  const t = [...brand.toLowerCase()];
  const out: LabelSegment[] = [];
  const plain = (text: string) => {
    const last = out[out.length - 1];
    if (last && !last.swapped) last.text += text;
    else out.push({ text, swapped: false });
  };
  let i = 0;
  let j = 0;
  while (i < s.length) {
    if (s[i] === t[j]) {
      plain(s[i]!);
      i++;
      j++;
      continue;
    }
    const swap = findSwap(s, i, t, j);
    if (swap) {
      const text = s.slice(i, i + swap.n).join('');
      const looksLike = t.slice(j, j + swap.m).join('');
      out.push({ text, swapped: true, looksLike, codePoints: codePointsOf(text) });
      i += swap.n;
      j += swap.m;
    } else {
      plain(s[i]!);
      i++;
      j++;
    }
  }
  return out;
}

function findSwap(s: string[], i: number, t: string[], j: number) {
  for (let size = 2; size <= 2 * MAX_RUN; size++) {
    for (let n = 1; n <= MAX_RUN; n++) {
      const m = size - n;
      if (m < 1 || m > MAX_RUN || i + n > s.length || j + m > t.length) continue;
      const a = s.slice(i, i + n).join('');
      const b = t.slice(j, j + m).join('');
      if (a !== b && skeleton(a) === skeleton(b)) return { n, m };
    }
  }
  return undefined;
}

const DAY = 86_400_000;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** `2001-07-01 · 25 years`: the registration date (UTC) and the domain's age at `now`. */
export function registrationAge(registered: string, now: string): string {
  const from = new Date(registered);
  const to = new Date(now);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months--;
  const days = Math.floor((to.getTime() - from.getTime()) / DAY);
  const age =
    months >= 12
      ? plural(Math.floor(months / 12), 'year')
      : months >= 1
        ? plural(months, 'month')
        : days >= 1
          ? plural(days, 'day')
          : 'today';
  return `${from.toISOString().slice(0, 10)} · ${age}`;
}
