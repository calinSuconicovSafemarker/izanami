import { useEffect, useId, useRef, useState } from 'react';
import rdapHosts from '../data/rdap-hosts.json';

interface ThirdParty {
  name: string;
  hosts: string[];
  what: string;
  when: string;
}

/** Every third party the app talks to (SPEC: Privacy, ADR-0001). Keep in sync with lookup/. */
const THIRD_PARTIES: ThirdParty[] = [
  {
    name: 'Cloudflare DNS-over-HTTPS',
    hosts: ['cloudflare-dns.com'],
    what: 'The domain you check and your official counterpart (NS, A, AAAA, MX, TXT records).',
    when: 'Every lookup.',
  },
  {
    name: 'Google Public DNS (DoH)',
    hosts: ['dns.google'],
    what: 'The same DNS questions, only if Cloudflare fails.',
    when: 'Fallback only.',
  },
  {
    name: 'Team Cymru IP-to-ASN',
    hosts: ['origin.asn.cymru.com'],
    what: 'The IP addresses the domains resolve to. Asked through the DoH resolvers above, so your browser never connects to Team Cymru directly.',
    when: 'Every lookup that resolves.',
  },
  {
    name: 'Registry RDAP servers',
    hosts: [`${rdapHosts.hosts.length} registry servers, e.g. rdap.verisign.com, rdap.sidn.nl`],
    what: 'The domain name, to ask whether and when it was registered and by which registrar.',
    when: 'Every lookup, sent to the registry that runs the TLD.',
  },
  {
    name: 'rdap.org',
    hosts: ['rdap.org'],
    what: 'The domain name, for TLDs whose registry is not in our bundled list.',
    when: 'Fallback only.',
  },
  {
    name: 'crt.sh (Certificate Transparency)',
    hosts: ['crt.sh'],
    what: 'The domain name, to find when its first TLS certificate was issued.',
    when: 'Every lookup (optional; ignored if slow).',
  },
  {
    name: 'IANA RDAP bootstrap',
    hosts: ['data.iana.org'],
    what: 'Nothing from you. We download the TLD-to-registry list when we build the site.',
    when: 'Build time only — your browser does not contact IANA.',
  },
];

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

/** Footer link + accessible modal listing every third party a lookup contacts. */
export function PrivacyPanel() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus();
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-300 ${focusRing}`}
      >
        What this tool sends where
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onKeyDown={onKeyDown}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-zinc-700 bg-zinc-900 text-left text-sm text-zinc-200 shadow-xl sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4">
              <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
                What this tool sends where
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 ${focusRing}`}
              >
                Close
              </button>
            </div>
            {/* Focusable so keyboard users can scroll the list (axe: scrollable-region-focusable). */}
            <div
              tabIndex={0}
              aria-label="Third parties contacted"
              role="region"
              className={`flex flex-col gap-4 overflow-y-auto p-4 ${focusRing} focus-visible:-outline-offset-2`}
            >
              <p id={descId} className="text-zinc-300">
                This site is static files only: there is <strong>no backend</strong>,{' '}
                <strong>no analytics</strong>, no cookies and no logging by us. When you run a
                lookup, your browser contacts these public services directly. They see your IP
                address and the domains being checked. Nothing is sent when you only browse
                organisations.
              </p>
              <ul className="flex flex-col gap-3">
                {THIRD_PARTIES.map((party) => (
                  <li key={party.name} className="rounded border border-zinc-800 p-3">
                    <h3 className="font-medium text-zinc-100">{party.name}</h3>
                    <p className="font-mono text-xs break-all text-emerald-400">
                      {party.hosts.join(', ')}
                    </p>
                    <p className="mt-1 text-zinc-300">
                      <span className="text-zinc-400">Sends: </span>
                      {party.what}
                    </p>
                    <p className="text-zinc-300">
                      <span className="text-zinc-400">When: </span>
                      {party.when}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-400">
                The site files are served by Amazon CloudFront with access logging turned off. We
                never contact the domain you check: no HTTP requests, screenshots or scans.
              </p>
              <p className="text-xs text-zinc-400">
                <strong>JSON API (for scripts, not used by this website):</strong> a query sent to{' '}
                <span className="font-mono">/api/check</span> is answered by our AWS Lambda, which
                makes the lookups above from AWS&apos;s network instead of your browser. CloudFront
                caches each answer for up to an hour. The Lambda logs, kept for one week, contain
                only a start, end and duration line per request and, for server errors, the status
                and error code: never the domain, the query string or your IP address.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
