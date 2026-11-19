// RFC 4180 CSV with a spreadsheet formula-injection guard (OWASP "CSV injection").

export type CsvCell = string | number | boolean | null | undefined;

/** Text starting with one of these is run as a formula by Excel / LibreOffice / Sheets. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value);
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/**
 * A CSV document: header line then one line per row, CRLF-terminated. Cells with commas, quotes
 * or line breaks are quoted (inner quotes doubled); text cells starting with = + - @ (or a tab /
 * CR) get a leading `'` so a spreadsheet shows them as text. Numbers are written as-is.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',') + '\r\n').join('');
}
