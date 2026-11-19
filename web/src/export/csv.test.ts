import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv (RFC 4180)', () => {
  it('writes a header and rows separated by CRLF, plain cells unquoted', () => {
    expect(toCsv(['a', 'b'], [['x', 1]])).toBe('a,b\r\nx,1\r\n');
  });

  it('quotes cells with commas, quotes or line breaks and doubles inner quotes', () => {
    expect(toCsv(['v'], [['a,b'], ['say "hi"'], ['two\nlines'], ['cr\rhere']])).toBe(
      'v\r\n"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\n"cr\rhere"\r\n',
    );
  });

  it('writes null/undefined as empty and booleans as true/false', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, false]])).toBe('a,b,c\r\n,,false\r\n');
  });

  it('guards text cells that a spreadsheet would run as a formula', () => {
    expect(toCsv(['v'], [['=1+1'], ['+31'], ['-x'], ['@SUM(A1)'], ['\tTAB']])).toBe(
      "v\r\n'=1+1\r\n'+31\r\n'-x\r\n'@SUM(A1)\r\n'\tTAB\r\n",
    );
  });

  it('quotes a guarded cell that also needs quoting', () => {
    expect(toCsv(['v'], [['=HYPERLINK("x","y")']])).toBe('v\r\n"\'=HYPERLINK(""x"",""y"")"\r\n');
  });

  it('leaves numbers alone, negative ones included, so they stay numeric', () => {
    expect(toCsv(['w'], [[-25], [0.5]])).toBe('w\r\n-25\r\n0.5\r\n');
  });
});
