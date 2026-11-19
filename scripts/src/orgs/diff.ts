import type { RelatedDomain } from '../lib/web';
import type { SkippedDomain } from './related';
import type { Org } from './select';

export interface OrgChange {
  org: Org;
  addedDomains: string[];
  removedDomains: string[];
  previousPrimary: string | null;
  addedRelated: RelatedDomain[];
  removedRelated: string[];
}

export interface OrgDiff {
  added: Org[];
  removed: Org[];
  /** Orgs whose official or related domains changed; added orgs with related domains too. */
  changed: OrgChange[];
  /** Curated/published related domains left out because another org has them. */
  skipped?: SkippedDomain[];
  /** Caveats about this build, shown first. */
  notes?: string[];
}

/** Compares two org lists by Wikidata id; `confirmedAt`, rank and name drift are not changes. */
export function diffOrgs(previous: readonly Org[], next: readonly Org[]): OrgDiff {
  const before = new Map(previous.map((o) => [o.wikidataId, o]));
  const after = new Map(next.map((o) => [o.wikidataId, o]));
  const added = next.filter((o) => !before.has(o.wikidataId));
  const removed = previous.filter((o) => !after.has(o.wikidataId));
  const changed: OrgChange[] = [];
  for (const org of next) {
    const old = before.get(org.wikidataId);
    const oldOfficial = old?.officialDomains ?? org.officialDomains;
    // orgs.json written before ticket 15 has no relatedDomains.
    const oldRelated = new Set(
      ((old?.relatedDomains as Org['relatedDomains'] | undefined) ?? []).map((r) => r.domain),
    );
    const newRelated = new Set(org.relatedDomains.map((r) => r.domain));
    const addedDomains = org.officialDomains.filter((d) => !oldOfficial.includes(d));
    const removedDomains = oldOfficial.filter((d) => !org.officialDomains.includes(d));
    const previousPrimary =
      old && old.primaryDomain !== org.primaryDomain ? old.primaryDomain : null;
    const addedRelated = org.relatedDomains.filter((r) => !oldRelated.has(r.domain));
    const removedRelated = [...oldRelated].filter((d) => !newRelated.has(d));
    if (
      addedDomains.length ||
      removedDomains.length ||
      previousPrimary ||
      addedRelated.length ||
      removedRelated.length
    ) {
      changed.push({
        org,
        addedDomains,
        removedDomains,
        previousPrimary,
        addedRelated,
        removedRelated,
      });
    }
  }
  return { added, removed, changed };
}

function label(org: Org): string {
  return `${org.name} (${org.wikidataId})`;
}

/** Markdown for `data-diff.md`. Contains no dates, so unchanged inputs give an identical file. */
export function renderDiff({ added, removed, changed, skipped = [], notes = [] }: OrgDiff): string {
  if (!added.length && !removed.length && !changed.length && !skipped.length && !notes.length) {
    return '# Data diff\n\nNo changes since the previous `orgs.json`.\n';
  }
  const lines = ['# Data diff', '', 'Review before committing (ADR-0002).', ''];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`## ${title} (${items.length})`, '', ...items.map((i) => `- ${i}`), '');
  };
  section('Notes', notes);
  section(
    'Added',
    added.map((o) => `${label(o)}: ${o.officialDomains.join(', ')}`),
  );
  section(
    'Removed',
    removed.map((o) => `${label(o)}: ${o.officialDomains.join(', ')}`),
  );
  section(
    'Changed official domains',
    changed
      .filter((c) => c.addedDomains.length || c.removedDomains.length || c.previousPrimary)
      .map((c) => {
        const parts = [
          ...c.addedDomains.map((d) => `+${d}`),
          ...c.removedDomains.map((d) => `-${d}`),
        ];
        if (c.previousPrimary) parts.push(`primary ${c.previousPrimary} → ${c.org.primaryDomain}`);
        return `${label(c.org)}: ${parts.join(', ')}`;
      }),
  );
  section(
    'Changed related domains',
    changed
      .filter((c) => c.addedRelated.length || c.removedRelated.length)
      .map((c) => {
        const parts = [
          ...c.addedRelated.map((r) => `+${r.domain} (${r.source}${r.via ? `: ${r.via}` : ''})`),
          ...c.removedRelated.map((d) => `-${d}`),
        ];
        return `${label(c.org)}: ${parts.join(', ')}`;
      }),
  );
  section(
    'Skipped related domains',
    skipped.map((s) => `${s.orgId}: ${s.domain} (${s.source}) — ${s.reason}`),
  );
  return lines.join('\n');
}
