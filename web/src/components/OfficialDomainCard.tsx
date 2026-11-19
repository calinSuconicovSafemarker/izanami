import type { Org, RelatedDomain, RelatedDomainGroup } from '../orgs';
import { isCurated, relatedDomainGroups, wikidataUrl } from '../orgs';

const linkClass =
  'text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400';

/** Groups longer than this start collapsed. */
const COLLAPSE_AFTER = 12;

/** Official-domain card. Wording stays honest: listed as official + heavily used, not ownership. */
export function OfficialDomainCard({ org }: { org: Org }) {
  const others = org.officialDomains.filter((domain) => domain !== org.primaryDomain);
  const groups = relatedDomainGroups(org);
  return (
    <section
      aria-labelledby="official-domains-heading"
      className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="official-domains-heading" className="text-xs uppercase tracking-wide text-zinc-400">
          Official domains
        </h2>
        <p data-primary className="font-mono text-xl break-all text-emerald-400 sm:text-2xl">
          {org.primaryDomain}
        </p>
      </div>

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 id="own-sites-heading" className="text-sm text-zinc-400">
            Own sites
          </h3>
          <ul aria-labelledby="own-sites-heading" className="flex flex-wrap gap-2">
            {others.map((domain) => (
              <li
                key={domain}
                className="rounded border border-zinc-700 px-2 py-0.5 font-mono text-sm break-all text-zinc-200"
              >
                {domain}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((group) => (
        <RelatedGroup key={group.source} group={group} />
      ))}
      {groups.length > 0 && (
        <p className="text-xs text-zinc-400">
          Related domains count as official when you check a lookalike on this page.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 id="evidence-heading" className="text-sm text-zinc-400">
          Evidence
        </h3>
        <ul
          aria-labelledby="evidence-heading"
          className="flex flex-col gap-1 text-sm text-zinc-300"
        >
          {isCurated(org) ? (
            <li>
              Curated entry — source:{' '}
              <a href={wikidataUrl(org)} target="_blank" rel="noreferrer" className={linkClass}>
                Wikidata {org.wikidataId}
              </a>
            </li>
          ) : (
            <li>
              Wikidata lists this as the official website (P856) —{' '}
              <a href={wikidataUrl(org)} target="_blank" rel="noreferrer" className={linkClass}>
                Wikidata {org.wikidataId}
              </a>
            </li>
          )}
          {org.trancoRank !== null && (
            <li>Tranco rank {org.trancoRank.toLocaleString('en-US')} — heavily used</li>
          )}
          <li>Confirmed at {org.confirmedAt}</li>
        </ul>
        <p className="text-xs text-zinc-400">
          Listed as official and heavily used. This is not proof of who owns the domain.
        </p>
      </div>
    </section>
  );
}

function RelatedGroup({ group }: { group: RelatedDomainGroup }) {
  const headingId = `related-${group.source}-heading`;
  const list = (
    <ul aria-labelledby={headingId} className="flex flex-col gap-1">
      {group.domains.map((related) => (
        <li key={related.domain} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-mono break-all text-zinc-200">{related.domain}</span>
          <SourceNote related={related} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm text-zinc-400">
        {group.title} <span className="text-zinc-400">({group.domains.length})</span>
      </h3>
      {group.domains.length > COLLAPSE_AFTER ? (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm text-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">
            Show all {group.domains.length} domains
          </summary>
          {list}
        </details>
      ) : (
        list
      )}
    </div>
  );
}

/** Where a related domain comes from, linked to its evidence. */
function SourceNote({ related }: { related: RelatedDomain }) {
  const label =
    related.source === 'wikidata-owned'
      ? `Wikidata: ${related.via ?? 'owned entity'}`
      : related.source === 'published-list'
        ? (related.via ?? 'published list')
        : 'curated — source';
  return (
    <span className="text-xs text-zinc-400">
      {related.url ? (
        <a href={related.url} target="_blank" rel="noreferrer" className={linkClass}>
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}
