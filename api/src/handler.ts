// AWS Lambda entry point: function URL (payload format 2.0) → createApi (ADR-0006).
// CloudFront reaches the function URL through Origin Access Control; the URL itself requires
// AWS_IAM auth, so direct calls are refused before this code runs.
import rdapHosts from '../../web/src/data/rdap-hosts.json';
import { LiveLookupClient, withSessionCache } from '../../web/src/lookup';
import { createApi, type ApiDeps } from './api';

/** The subset of a Lambda function URL request event (payload 2.0) the API reads. */
export interface FunctionUrlEvent {
  rawPath: string;
  rawQueryString?: string;
  requestContext: { http: { method: string } };
}

export interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Timeouts keep one check inside the 15 s Lambda timeout: each DoH/RDAP request gives up after
 * 3 s (so a DNS question with its fallback resolver takes at most 6 s), crt.sh after 5 s, and
 * whatever is still running at 9 s is cut off (unknown facts, response not cached). 11 s is
 * the hard 504 limit.
 */
export const LIVE_DEPS: ApiDeps = {
  createClient: (signal) =>
    withSessionCache(
      new LiveLookupClient({
        rdapBaseUrls: rdapHosts.servers,
        requestTimeoutMs: 3000,
        certsTimeoutMs: 5000,
        signal,
      }),
    ),
  lookupBudgetMs: 9000,
  hardTimeoutMs: 11000,
};

/** Adapt function URL events to an API built from `deps` (tests inject fixture clients). */
export function createHandler(deps: ApiDeps) {
  const api = createApi(deps);
  return async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
    const res = await api({
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: event.rawQueryString ?? '',
    });
    return { statusCode: res.status, headers: res.headers, body: res.body };
  };
}

export const handler = createHandler(LIVE_DEPS);
