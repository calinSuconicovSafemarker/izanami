const pad = (n: number) => String(n).padStart(2, '0');

/** `20261119-0805` (UTC, so the name doesn't depend on the viewer's time zone). */
function stamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

/** `izanami-<subject>-<yyyymmdd-hhmm>.<ext>`; characters other than `A-Z a-z 0-9 . _ -` become `-`. */
export function exportFilename(subject: string, at: Date, ext: 'json' | 'csv'): string {
  return `izanami-${subject.replace(/[^A-Za-z0-9._-]/g, '-')}-${stamp(at)}.${ext}`;
}
