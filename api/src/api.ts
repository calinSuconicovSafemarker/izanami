// JSON API routes (ticket 18, ADR-0006). Transport-agnostic: `handler.ts` adapts Lambda function
// URL events to `ApiRequest`. Every result comes from the website's own modules (startCheck,
// toLookupExport, officialContext), so the API and "Export JSON" give the same document.
import { startCheck } from '../../web/src/check';
import { toLookupExport } from '../../web/src/export/lookup';
import type { LookupClient } from '../../web/src/lookup';
import {
  allOrgs,
  dataVersion,
  getOrg,
  isOfficialSource,
  officialContext,
  toOrgInput,
  type Org,
} from '../../web/src/orgs';

export interface ApiRequest {
  method: string;
  /** URL path, e.g. `/api/check`. */
  path: string;
  /** Raw query string without the `?`. */
  query: string;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ApiDeps {
  /** A fresh LookupClient for one check. Aborting `signal` must fail its pending lookups. */
  createClient: (signal: AbortSignal) => LookupClient;
  /** Clock for `checkedAt` / `exportedAt`. */
  now?: () => Date;
  /** Lookups still running after this long are cut off and become unknown. Default 9000. */
  lookupBudgetMs?: number;
  /** Safety net: answer 504 if the check has not settled after this long. Default 11000. */
  hardTimeoutMs?: number;
  /** Error log sink (5xx only). Never receives the query. Default: console.error. */
  logError?: (entry: { status: number; code: string }) => void;
}

/** CloudFront caches successful answers for an hour (ADR-0006). */
export const CACHE_SUCCESS = 'public, max-age=3600';
export const CACHE_NONE = 'no-store';

/** RFC 1035 limit on a domain name; also enforced by the parser on the punycode form. */
export const MAX_DOMAIN_LENGTH = 253;

const ORG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A bare domain only: no scheme, path, query, fragment, userinfo, port, IPv6 brackets. */
const NOT_A_BARE_DOMAIN = /[\s/\\?#@:[\]]/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class CheckTimeout extends Error {}

function json(status: number, body: unknown, cache: string, extra: Record<string, string> = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Read-only, no credentials: any site or script may call it.
      'access-control-allow-origin': '*',
      'cache-control': cache,
      ...extra,
    },
    body: JSON.stringify(body),
  } satisfies ApiResponse;
}

/** Creates the real client on the first lookup, so invalid or official input never builds one. */
function lazyClient(create: () => LookupClient): LookupClient {
  let client: LookupClient | undefined;
  const get = () => (client ??= create());
  return {
    dns: (name, type) => get().dns(name, type),
    rdap: (domain) => get().rdap(domain),
    asn: (ip) => get().asn(ip),
    certs: (domain) => get().certs(domain),
  };
}

const error = (e: ApiError, extra?: Record<string, string>) =>
  json(e.status, { error: { code: e.code, message: e.message } }, CACHE_NONE, extra);

/** The single value of a query parameter; 400 when missing, empty or repeated. */
function param(query: URLSearchParams, name: string): string {
  const values = query.getAll(name);
  if (values.length > 1)
    throw new ApiError(400, 'duplicate-parameter', `Give "${name}" only once.`);
  const value = values[0]?.trim();
  if (!value) throw new ApiError(400, 'missing-parameter', `Missing query parameter "${name}".`);
  return value;
}

function findOrg(id: string): Org {
  const org = ORG_ID.test(id) ? getOrg(id) : undefined;
  if (!org)
    throw new ApiError(404, 'unknown-org', 'Unknown organisation id; see /api/orgs for the list.');
  return org;
}

function validDomainInput(domain: string): string {
  if (domain.length > MAX_DOMAIN_LENGTH)
    throw new ApiError(
      400,
      'invalid-domain',
      `"domain" is longer than ${MAX_DOMAIN_LENGTH} characters.`,
    );
  if (CONTROL_CHARS.test(domain) || NOT_A_BARE_DOMAIN.test(domain))
    throw new ApiError(
      400,
      'invalid-domain',
      '"domain" must be a bare domain name (no scheme, path, port or spaces), e.g. example.com.',
    );
  return domain;
}

/** `GET /api/orgs/<id>`: the org's official context with each domain's trust level (R1). */
function orgDetail(org: Org) {
  const ctx = officialContext(org);
  return {
    id: org.slug,
    name: org.name,
    wikidataId: org.wikidataId,
    country: org.country,
    primary: ctx.primary,
    /** Official level: a variant here is verdict Official. */
    officialDomains: [
      ...org.officialDomains.map((domain) => ({
        domain,
        source: org.wikidataDomain === null ? 'curated-extra' : 'wikidata-official-website',
        trust: 'official' as const,
      })),
      ...org.relatedDomains
        .filter((r) => isOfficialSource(r.source))
        .map((r) => ({ ...r, trust: 'official' as const })),
    ],
    /** Verify level: listed by Wikidata as owned; scored, with the `listed-related` signal. */
    relatedOwned: org.relatedDomains
      .filter((r) => !isOfficialSource(r.source))
      .map((r) => ({ ...r, trust: 'verify' as const })),
    brandTlds: [...ctx.brandTlds],
    confirmedAt: org.confirmedAt,
  };
}

/** Builds the request handler. `deps` decide where lookups go (live services or fixtures). */
export function createApi(deps: ApiDeps): (request: ApiRequest) => Promise<ApiResponse> {
  const now = deps.now ?? (() => new Date());
  const lookupBudgetMs = deps.lookupBudgetMs ?? 9000;
  const hardTimeoutMs = deps.hardTimeoutMs ?? 11000;
  const logError = deps.logError ?? ((entry) => console.error(JSON.stringify(entry)));

  async function check(query: URLSearchParams): Promise<ApiResponse> {
    const orgId = param(query, 'org');
    const domain = validDomainInput(param(query, 'domain'));
    const org = findOrg(orgId);

    const deadline = new AbortController();
    const budget = setTimeout(() => deadline.abort(), lookupBudgetMs);
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const startedAt = now();
      const client = lazyClient(() => deps.createClient(deadline.signal));
      const result = startCheck(domain, toOrgInput(org), client, { now: startedAt });
      if (result.phase === 'invalid') throw new ApiError(400, 'invalid-domain', result.message);
      if (result.phase === 'official') {
        const { variant, similarity } = result;
        return json(
          200,
          toLookupExport({ org, variant, similarity, exportedAt: now() }),
          CACHE_SUCCESS,
        );
      }
      const timedOut = new Promise<never>((_resolve, reject) => {
        hardTimer = setTimeout(() => reject(new CheckTimeout()), hardTimeoutMs);
      });
      const facts = await Promise.race([result.facts, timedOut]);
      const body = toLookupExport({ org, variant: result.variant, facts, exportedAt: now() });
      // Lookups cut off by the budget are unknown only because we stopped waiting: don't let
      // CloudFront serve that for an hour.
      return json(200, body, deadline.signal.aborted ? CACHE_NONE : CACHE_SUCCESS);
    } finally {
      clearTimeout(budget);
      clearTimeout(hardTimer);
      deadline.abort(); // release anything still in flight
    }
  }

  async function route(request: ApiRequest): Promise<ApiResponse> {
    const { path } = request;
    if (path === '/api/health') return json(200, { ok: true, dataVersion }, CACHE_NONE);
    if (path === '/api/orgs')
      return json(
        200,
        allOrgs.map((o) => ({ id: o.slug, name: o.name, primaryDomain: o.primaryDomain })),
        CACHE_SUCCESS,
      );
    const orgPath = /^\/api\/orgs\/([^/]+)$/.exec(path);
    if (orgPath) return json(200, orgDetail(findOrg(orgPath[1]!)), CACHE_SUCCESS);
    if (path === '/api/check') return check(new URLSearchParams(request.query));
    throw new ApiError(
      404,
      'not-found',
      'No such endpoint. Try /api/check, /api/orgs, /api/orgs/<id> or /api/health.',
    );
  }

  return async (request) => {
    const method = request.method.toUpperCase();
    let response: ApiResponse;
    if (method !== 'GET' && method !== 'HEAD') {
      response = error(new ApiError(405, 'method-not-allowed', 'Only GET and HEAD are allowed.'), {
        allow: 'GET, HEAD',
      });
    } else {
      try {
        response = await route(request);
      } catch (e) {
        const failure =
          e instanceof ApiError
            ? e
            : e instanceof CheckTimeout
              ? new ApiError(504, 'upstream-timeout', 'The lookups did not finish in time.')
              : new ApiError(500, 'internal-error', 'Something went wrong.');
        response = error(failure);
        // Status and code only: never the query, the domain or a stack trace.
        if (failure.status >= 500) logError({ status: failure.status, code: failure.code });
      }
    }
    return method === 'HEAD' ? { ...response, body: '' } : response;
  };
}
