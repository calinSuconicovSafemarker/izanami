import { describe, expect, it } from 'vitest';
import { parseConfusables } from './confusables';

const SAMPLE = `# confusables.txt
# Version: 16.0.0

0435 ;\t0065 ;\tMA\t# ( е → e ) CYRILLIC SMALL LETTER IE → LATIN SMALL LETTER E\t#
03BF ;\t006F ;\tMA\t# ( ο → o ) GREEK SMALL LETTER OMICRON → LATIN SMALL LETTER O\t#
0131 ;\t0069 ;\tMA\t# ( ı → i ) LATIN SMALL LETTER DOTLESS I → LATIN SMALL LETTER I\t#
006D ;\t0072 006E ;\tMA\t# ( m → rn ) LATIN SMALL LETTER M → LATIN SMALL LETTER R, LATIN SMALL LETTER N\t#
05D5 ;\t006C ;\tMA\t# ( ו → l ) HEBREW LETTER VAV → LATIN SMALL LETTER L\t#
0430 ;\t0061 ;\tMA\t# ( а → a ) CYRILLIC SMALL LETTER A → LATIN SMALL LETTER A\t#
0441 ;\t0063 ;\tMA\t# ( с → c ) CYRILLIC SMALL LETTER ES → LATIN SMALL LETTER C\t#
0436 ;\t04C1 ;\tMA\t# ( ж → Ӂ ) CYRILLIC SMALL LETTER ZHE → CYRILLIC CAPITAL LETTER ZHE WITH BREVE\t#
1D400 ;\t0041 ;\tMA\t# ( 𝐀 → A ) MATHEMATICAL BOLD CAPITAL A → LATIN CAPITAL LETTER A\t#
`;

describe('parseConfusables', () => {
  it('maps Cyrillic, Greek and Latin letters to Latin skeletons', () => {
    const map = parseConfusables(SAMPLE);
    expect(map['е']).toBe('e');
    expect(map['ο']).toBe('o');
    expect(map['ı']).toBe('i');
    expect(map['m']).toBe('rn');
    expect(map['а']).toBe('a');
  });

  it('drops other scripts and non-Latin targets', () => {
    const map = parseConfusables(SAMPLE);
    expect(map['ו']).toBeUndefined(); // Hebrew source
    expect(map['ж']).toBeUndefined(); // Cyrillic target
    expect(map['\u{1d400}']).toBeUndefined(); // Common-script math letter
    expect(Object.keys(map)).toHaveLength(6);
  });
});
