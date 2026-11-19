import type { TldCategory, TldRating } from './rating';

const STYLE: Record<TldCategory, string> = {
  official: 'border-emerald-500/60 text-emerald-300',
  country: 'border-sky-500/50 text-sky-300',
  generic: 'border-zinc-600 text-zinc-300',
  brand: 'border-violet-500/60 text-violet-300',
  other: 'border-zinc-600 text-zinc-400',
  'high-abuse': 'border-dashed border-amber-400 text-amber-300',
};

/** The rating as a small labelled badge; high-abuse also gets a warning sign and dashed border. */
export function TldBadge({ rating }: { rating: TldRating }) {
  return (
    <span
      data-tld-category={rating.category}
      className={`inline-block rounded border px-1 text-[0.7rem] leading-4 ${STYLE[rating.category]}`}
    >
      {rating.category === 'high-abuse' && <span aria-hidden="true">⚠ </span>}
      {rating.label}
    </span>
  );
}
