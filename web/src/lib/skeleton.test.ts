import { confusables, skeleton } from './skeleton';

describe('confusables skeleton data', () => {
  it('maps Cyrillic е (U+0435) to Latin e', () => {
    expect(confusables['\u0435']).toBe('e');
  });

  it('gives a homoglyph spoof the same skeleton as the brand label', () => {
    expect(skeleton('tud\u0435lft')).toBe(skeleton('tudelft'));
    expect(skeleton('\u0440\u0430ypal')).toBe(skeleton('paypal')); // Cyrillic р, а
  });

  it('keeps different labels apart', () => {
    expect(skeleton('tudelft')).not.toBe(skeleton('tudalft'));
  });
});
