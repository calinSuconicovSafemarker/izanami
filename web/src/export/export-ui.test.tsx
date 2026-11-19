import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DnsResult, DnsType } from '../lookup';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { renderRoute } from '../test/render-route';

/** Captures what `download()` hands the browser: the anchor's file name and the Blob. */
function captureDownloads() {
  const saved: {
    name: string;
    type: string;
    text: () => Promise<string>;
    bytes: () => Promise<Uint8Array>;
  }[] = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    const url = `blob:test/${++n}`;
    blobs.set(url, b as Blob);
    return url;
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href)!;
    saved.push({
      name: this.download,
      type: blob.type,
      // text() decodes UTF-8 and drops a leading BOM (like TextDecoder), so check bytes for it.
      text: () => blob.text(),
      bytes: async () => new Uint8Array(await blob.arrayBuffer()),
    });
  });
  return { saved, revoke };
}

let downloads: ReturnType<typeof captureDownloads>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-19T08:05:00Z') });
  downloads = captureDownloads();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const verdictCard = () => screen.getByRole('region', { name: /^verdict$/i });
const exportButton = (format: 'JSON' | 'CSV', scope: HTMLElement = document.body) =>
  within(scope).findByRole('button', { name: new RegExp(`export ${format}`, 'i') });

describe('single lookup export', () => {
  it('offers no export while the lookup is still running', () => {
    renderRoute('/org/tu-delft?d=google.com');
    expect(screen.queryByRole('button', { name: /export json/i })).toBeNull();
  });

  it('downloads the finished lookup as versioned JSON from the verdict card', async () => {
    renderRoute('/org/tu-delft?d=google.com');
    await within(verdictCard()).findByText(/score/i);
    fireEvent.click(await exportButton('JSON', verdictCard()));

    const [file] = downloads.saved;
    expect(file?.name).toBe('izanami-google.com-20261119-0805.json');
    expect(file?.type).toBe('application/json');
    const doc = JSON.parse(await file!.text());
    expect(doc).toMatchObject({
      schemaVersion: 1,
      tool: 'izanami',
      kind: 'lookup',
      org: { slug: 'tu-delft' },
      variant: { registrableDomain: 'google.com' },
      existence: 'resolving',
    });
    expect(doc.rules).toHaveLength(14);
    await waitFor(() => expect(downloads.revoke).toHaveBeenCalledWith('blob:test/1'));
  });

  it('downloads the finished lookup as CSV with a BOM so Excel reads UTF-8', async () => {
    renderRoute('/org/tu-delft?d=google.com');
    await within(verdictCard()).findByText(/score/i);
    fireEvent.click(await exportButton('CSV', verdictCard()));

    const [file] = downloads.saved;
    expect(file?.name).toBe('izanami-google.com-20261119-0805.csv');
    expect(file?.type).toBe('text/csv;charset=utf-8');
    expect([...(await file!.bytes()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect((await file!.text()).split('\r\n')[0]).toMatch(/^domain,unicode,org,/);
  });

  it('exports an official domain from its verdict card', async () => {
    renderRoute('/org/tu-delft?d=tudelft.nl');
    fireEvent.click(await exportButton('JSON', verdictCard()));
    const doc = JSON.parse(await downloads.saved[0]!.text());
    expect(doc.verdict).toEqual({ label: 'Official', score: 0, unknownShare: 0 });
  });

  it('exports a not-registered result, which has no verdict card', async () => {
    renderRoute('/org/tu-delft?d=tudelft-lookalike-xq7z.nl');
    fireEvent.click(await exportButton('JSON'));
    const doc = JSON.parse(await downloads.saved[0]!.text());
    expect(doc).toMatchObject({ existence: 'not-registered', verdict: null });
  });
});

/** tudelft.net is delegated; every other NS query is NXDOMAIN. */
class ScanClient extends FixtureLookupClient {
  override async dns(name: string, type: DnsType): Promise<DnsResult> {
    if (type === 'NS' && name === 'tudelft.net')
      return { status: 'ok', name, type, records: ['ns1.example.net'] };
    if (type === 'NS') return { status: 'not-found', name, type, records: [] };
    return super.dns(name, type);
  }
}

describe('lookalike scan export', () => {
  const scan = () => screen.getByRole('region', { name: /lookalike scan/i });

  it('downloads the results table as CSV and JSON once rows exist', async () => {
    renderRoute('/org/tu-delft', new ScanClient());
    expect(within(scan()).queryByRole('button', { name: /export/i })).toBeNull();
    fireEvent.click(within(scan()).getByRole('button', { name: /scan lookalikes/i }));
    await within(scan()).findByText(/scan complete/i, undefined, { timeout: 30_000 });

    fireEvent.click(await exportButton('CSV', scan()));
    fireEvent.click(await exportButton('JSON', scan()));
    const [csv, json] = downloads.saved;
    expect(csv?.name).toBe('izanami-scan-tu-delft-20261119-0805.csv');
    const lines = (await csv!.text()).trimEnd().split('\r\n');
    expect(lines[0]).toBe('candidate,domain,technique,tld,tld_rating,exists,checked_at');
    expect(lines.find((l) => l.startsWith('tudelft.net,'))).toMatch(
      /^tudelft\.net,tudelft\.net,tld-swap,net,[^,]+,yes,2026-11-19T08:\d\d:\d\d\.\d{3}Z$/,
    );
    expect(json?.name).toBe('izanami-scan-tu-delft-20261119-0805.json');
    const doc = JSON.parse(await json!.text());
    expect(doc).toMatchObject({ kind: 'lookalike-scan', scan: { status: 'done' } });
    expect(doc.candidates.length).toBe(doc.scan.total);
  }, 40_000);
});
