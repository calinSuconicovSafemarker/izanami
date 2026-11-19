// Every data source, live service and shipped library Izanami uses (ticket 17), with licence and
// attribution. One list for the credits page and the export `sources` field. Research and dates:
// docs/research/licences.md. Pure: no React, no DOM.

export type CreditGroup = 'build' | 'live' | 'software';

export type SourceId =
  | 'wikidata'
  | 'tranco'
  | 'iana-rdap-bootstrap'
  | 'iana-root-zone'
  | 'icann-gtlds'
  | 'public-suffix-list'
  | 'unicode-confusables'
  | 'google-supported-domains'
  | 'microsoft-365-endpoints'
  | 'abuse-reports'
  | 'cloudflare-doh'
  | 'google-public-dns'
  | 'team-cymru'
  | 'registry-rdap'
  | 'rdap-org'
  | 'crt-sh';

export interface Licence {
  name: string;
  /** Licence text or the provider's terms page. */
  url: string;
}

export interface Credit {
  id: SourceId;
  group: Exclude<CreditGroup, 'software'>;
  name: string;
  url: string;
  /** What Izanami uses it for, one short sentence. */
  usedFor: string;
  licence: Licence;
  /** Attribution text to show with the data (verbatim where the licence prescribes it). */
  attribution?: string;
  /** A caveat worth showing, e.g. a licence that is not cleared for commercial use. */
  note?: string;
}

export interface SoftwareCredit {
  name: string;
  url: string;
  licence: Licence;
  /** Copyright line(s) from the package's LICENSE file. */
  copyright: string;
}

export const GROUP_TITLES: Record<CreditGroup, string> = {
  build: 'Data used to build the org list',
  live: 'Live lookups',
  software: 'Software',
};

const MIT: Licence = { name: 'MIT', url: 'https://opensource.org/license/mit' };

/** Unicode License V3 requires this notice with copies of the data or in documentation. */
export const UNICODE_NOTICE = `UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a copy of data files and any associated documentation (the "Data Files") or software and any associated documentation (the "Software") to deal in the Data Files or Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, and/or sell copies of the Data Files or Software, and to permit persons to whom the Data Files or Software are furnished to do so, provided that either (a) this copyright and permission notice appear with all copies of the Data Files or Software, or (b) this copyright and permission notice appear in associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall not be used in advertising or otherwise to promote the sale, use or other dealings in these Data Files or Software without prior written authorization of the copyright holder.`;

/** The MIT permission notice; each library's copyright line goes above it. */
export const MIT_NOTICE = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

export const CREDITS: readonly Credit[] = [
  // Data used to build the org list (build time, scripts/)
  {
    id: 'wikidata',
    group: 'build',
    name: 'Wikidata',
    url: 'https://www.wikidata.org/',
    usedFor: 'Organisations, their official websites and the domains they own.',
    licence: { name: 'CC0 1.0', url: 'https://www.wikidata.org/wiki/Wikidata:Licensing' },
  },
  {
    id: 'tranco',
    group: 'build',
    name: 'Tranco list',
    url: 'https://tranco-list.eu/',
    usedFor: 'Which domains are popular (top 100,000), and which organisations to list.',
    licence: { name: 'No licence stated; see its source lists', url: 'https://tranco-list.eu/' },
    attribution:
      'Tranco combines Cisco Umbrella (free of charge), the Majestic Million (CC BY 3.0, majestic.com), Farsight, the Chrome UX Report (CC BY 4.0, Google) and Cloudflare Radar (CC BY-NC 4.0).',
    note: 'Cloudflare Radar data is non-commercial (CC BY-NC 4.0), so this list is not cleared for commercial use.',
  },
  {
    id: 'iana-rdap-bootstrap',
    group: 'build',
    name: 'IANA RDAP bootstrap (domain names)',
    url: 'https://www.iana.org/assignments/rdap-dns/rdap-dns.xhtml',
    usedFor: 'Which registry RDAP server answers for each TLD.',
    licence: { name: 'CC0 1.0', url: 'https://www.iana.org/help/licensing-terms' },
  },
  {
    id: 'iana-root-zone',
    group: 'build',
    name: 'IANA Root Zone Database',
    url: 'https://www.iana.org/domains/root/db',
    usedFor: 'Which organisation runs each TLD (brand TLDs).',
    licence: { name: 'ICANN Terms of Service', url: 'https://www.icann.org/privacy/tos' },
  },
  {
    id: 'icann-gtlds',
    group: 'build',
    name: 'ICANN gTLD list (Specification 13)',
    url: 'https://www.icann.org/resources/registries/gtlds/v2/gtlds.json',
    usedFor: 'Which TLDs are .brand TLDs.',
    licence: { name: 'ICANN Terms of Service', url: 'https://www.icann.org/privacy/tos' },
  },
  {
    id: 'public-suffix-list',
    group: 'build',
    name: 'Public Suffix List (Mozilla)',
    url: 'https://publicsuffix.org/',
    usedFor: 'Finding the registrable part of a domain (bundled through tldts).',
    licence: { name: 'MPL-2.0', url: 'https://mozilla.org/MPL/2.0/' },
    attribution:
      'Public Suffix List, Mozilla Foundation, MPL-2.0. Source: https://publicsuffix.org/list/public_suffix_list.dat',
  },
  {
    id: 'unicode-confusables',
    group: 'build',
    name: 'Unicode confusables (UTS #39)',
    url: 'https://www.unicode.org/Public/security/latest/confusables.txt',
    usedFor: 'Spotting look-alike characters (homoglyphs).',
    licence: { name: 'Unicode License V3', url: 'https://www.unicode.org/license.txt' },
    attribution: 'Copyright © 1991-2026 Unicode, Inc. Unicode License V3.',
  },
  {
    id: 'google-supported-domains',
    group: 'build',
    name: 'Google supported domains',
    url: 'https://www.google.com/supported_domains',
    usedFor: 'Google’s own country domains, as related domains.',
    licence: { name: 'Google Terms of Service', url: 'https://policies.google.com/terms' },
  },
  {
    id: 'microsoft-365-endpoints',
    group: 'build',
    name: 'Microsoft 365 URLs and IP address ranges',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service',
    usedFor: 'Microsoft’s own domains, as related domains.',
    licence: {
      name: 'Microsoft web service terms (no licence stated)',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service',
    },
  },
  {
    id: 'abuse-reports',
    group: 'build',
    name: 'Spamhaus and Interisle abuse reports',
    url: 'https://www.spamhaus.org/',
    usedFor: 'A short hand-picked list of TLDs often used for abuse. Cited, not copied.',
    licence: { name: 'Cited facts only', url: 'https://interisle.net/' },
  },
  // Live lookups (runtime, web/src/lookup)
  {
    id: 'cloudflare-doh',
    group: 'live',
    name: 'Cloudflare DNS over HTTPS (1.1.1.1)',
    url: 'https://developers.cloudflare.com/1.1.1.1/',
    usedFor: 'DNS records (NS, A, AAAA, MX, TXT).',
    licence: {
      name: '1.1.1.1 terms of use',
      url: 'https://developers.cloudflare.com/1.1.1.1/terms-of-use/',
    },
  },
  {
    id: 'google-public-dns',
    group: 'live',
    name: 'Google Public DNS',
    url: 'https://developers.google.com/speed/public-dns',
    usedFor: 'DNS records when Cloudflare fails.',
    licence: {
      name: 'Google Public DNS terms',
      url: 'https://developers.google.com/speed/public-dns/terms',
    },
  },
  {
    id: 'team-cymru',
    group: 'live',
    name: 'Team Cymru IP to ASN mapping',
    url: 'https://www.team-cymru.com/ip-asn-mapping',
    usedFor: 'The network (ASN) that hosts an IP address, asked over DNS.',
    licence: {
      name: 'Free community service, no terms stated',
      url: 'https://www.team-cymru.com/ip-asn-mapping',
    },
  },
  {
    id: 'registry-rdap',
    group: 'live',
    name: 'Registry RDAP servers',
    url: 'https://data.iana.org/rdap/dns.json',
    usedFor: 'Registration date, registrar and nameservers, from the registry that runs the TLD.',
    licence: {
      name: 'Each registry’s terms (e.g. Verisign)',
      url: 'https://www.verisign.com/domain-names/registration-data-access-protocol/terms-service/index.xhtml',
    },
  },
  {
    id: 'rdap-org',
    group: 'live',
    name: 'rdap.org',
    url: 'https://about.rdap.org/',
    usedFor: 'RDAP for TLDs missing from the IANA list.',
    licence: { name: 'No terms stated', url: 'https://about.rdap.org/' },
  },
  {
    id: 'crt-sh',
    group: 'live',
    name: 'crt.sh (Sectigo)',
    url: 'https://crt.sh/',
    usedFor: 'When the first TLS certificate was logged (Certificate Transparency).',
    licence: { name: 'No terms stated', url: 'https://crt.sh/' },
  },
];

/** Libraries shipped in the web bundle (npm runtime dependencies), all MIT. */
export const SOFTWARE: readonly SoftwareCredit[] = [
  {
    name: 'React',
    url: 'https://react.dev/',
    licence: MIT,
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
  },
  {
    name: 'React Router',
    url: 'https://github.com/remix-run/react-router',
    licence: MIT,
    copyright:
      'Copyright (c) React Training LLC 2015-2019. Copyright (c) Remix Software Inc. 2020-2021. Copyright (c) Shopify Inc. 2022-2023.',
  },
  {
    name: 'tldts',
    url: 'https://github.com/remusao/tldts',
    licence: MIT,
    copyright: 'Copyright (c) 2017 Thomas Parisot, 2018 Rémi Berson.',
  },
  {
    name: 'punycode.js',
    url: 'https://github.com/mathiasbynens/punycode.js',
    licence: MIT,
    copyright: 'Copyright Mathias Bynens <https://mathiasbynens.be/>.',
  },
  {
    name: 'cookie (React Router dependency)',
    url: 'https://github.com/jshttp/cookie',
    licence: MIT,
    copyright:
      'Copyright (c) 2012-2014 Roman Shtylman. Copyright (c) 2015 Douglas Christopher Wilson.',
  },
  {
    name: 'set-cookie-parser (React Router dependency)',
    url: 'https://github.com/nfriedly/set-cookie-parser',
    licence: MIT,
    copyright: 'Copyright (c) 2015 Nathan Friedly.',
  },
  {
    name: 'Tailwind CSS',
    url: 'https://tailwindcss.com/',
    licence: MIT,
    copyright: 'Copyright (c) Tailwind Labs, Inc.',
  },
];

export const creditsIn = (group: Credit['group']): Credit[] =>
  CREDITS.filter((c) => c.group === group);

export function credit(id: SourceId): Credit {
  const found = CREDITS.find((c) => c.id === id);
  if (!found) throw new Error(`unknown source ${id}`);
  return found;
}

/** A source as written into exported JSON (and, later, API output). */
export interface ExportSource {
  id: SourceId;
  name: string;
  url: string;
  licence: string;
  licenceUrl: string;
  /** Present where the licence asks for attribution. */
  attribution?: string;
}

export const exportSources = (ids: readonly SourceId[]): ExportSource[] =>
  ids.map((id) => {
    const c = credit(id);
    return {
      id: c.id,
      name: c.name,
      url: c.url,
      licence: c.licence.name,
      licenceUrl: c.licence.url,
      ...(c.attribution && { attribution: c.attribution }),
    };
  });
