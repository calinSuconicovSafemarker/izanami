import type { Org } from './select';

export interface OrgChange {
  org: Org;
  addedDomains: string[];
  removedDomains: string[];
  previousPrimary: string | null;
}

export interface OrgDiff {
  added: Org[];
  removed: Org[];
  changed: OrgChange[];
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
    if (!old) continue;
    const addedDomains = org.officialDomains.filter((d) => !old.officialDomains.includes(d));
    const removedDomains = old.officialDomains.filter((d) => !org.officialDomains.includes(d));
    const previousPrimary = old.primaryDomain !== org.primaryDomain ? old.primaryDomain : null;
    if (addedDomains.length || removedDomains.length || previousPrimary) {
      changed.push({ org, addedDomains, removedDomains, previousPrimary });
    }
  }
  return { added, removed, changed };
}

function label(org: Org): string {
  return `${org.name} (${org.wikidataId})`;
}

/** Markdown for `data-diff.md`. Contains no dates, so unchanged inputs give an identical file. */
export function renderDiff({ added, removed, changed }: OrgDiff): string {
  if (!added.length && !removed.length && !changed.length) {
    return '# Data diff\n\nNo changes since the previous `orgs.json`.\n';
  }
  const lines = ['# Data diff', '', 'Review before committing (ADR-0002).', ''];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`## ${title} (${items.length})`, '', ...items.map((i) => `- ${i}`), '');
  };
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
    changed.map((c) => {
      const parts = [
        ...c.addedDomains.map((d) => `+${d}`),
        ...c.removedDomains.map((d) => `-${d}`),
      ];
      if (c.previousPrimary) parts.push(`primary ${c.previousPrimary} → ${c.org.primaryDomain}`);
      return `${label(c.org)}: ${parts.join(', ')}`;
    }),
  );
  return lines.join('\n');
}
