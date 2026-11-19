/**
 * Save `text` as a file, entirely client-side: a Blob URL clicked through a temporary
 * `a[download]`. Needs no network origin, so it works under the site's CSP.
 */
export function download(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Excel only detects UTF-8 in a CSV that starts with a byte-order mark. */
const BOM = '﻿';

export const downloadJson = (filename: string, doc: unknown) =>
  download(filename, 'application/json', `${JSON.stringify(doc, null, 2)}\n`);

export const downloadCsv = (filename: string, csv: string) =>
  download(filename, 'text/csv;charset=utf-8', BOM + csv);
