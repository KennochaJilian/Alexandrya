import { readerGesture, visibleEpubCfi } from './reader-interaction';
import type Contents from 'epubjs/types/contents';

describe('Reader gestures', () => {
  const point = (x: number, y: number, time = 0) => ({ x, y, time });
  it('changes page only for a short tap in a side zone', () => {
    expect(readerGesture(point(25, 200), point(26, 201, 100), 400)).toBe('previous');
    expect(readerGesture(point(375, 200), point(376, 201, 100), 400)).toBe('next');
    expect(readerGesture(point(200, 200), point(200, 200, 100), 400)).toBe('controls');
    expect(readerGesture(point(375, 200), point(376, 201, 100), 400, true)).toBeNull();
    expect(readerGesture(point(375, 200), point(375, 200, 800), 400)).toBeNull();
    expect(readerGesture(point(375, 200), point(375, 80, 300), 400)).toBeNull();
  });
  it('reveals settings with a downward swipe originating at the top', () => {
    expect(readerGesture(point(200, 12), point(205, 95, 250), 400)).toBe('controls');
    expect(readerGesture(point(200, 150), point(205, 240, 250), 400)).toBeNull();
    expect(readerGesture(point(200, 12), point(320, 65, 250), 400)).toBeNull();
  });
});

describe('Visible EPUB bookmark', () => {
  it('anchors within the current CSS column even when the iframe starts several pages to the left', () => {
    const text = document.createTextNode('A paragraph that spans several pages.');
    const range = document.createRange();
    range.setStart(text, 12);
    range.getBoundingClientRect = () => new DOMRect(2350, 140, 0, 20);
    const caret = vi.fn(() => range);
    const cfi = vi.fn(() => 'epubcfi(/6/2!/4/2/1:12)');
    const content = {
      window: { frameElement: { getBoundingClientRect: () => new DOMRect(-2000, 0, 6000, 700) } },
      document: { caretRangeFromPoint: caret }, cfiFromRange: cfi
    } as unknown as Contents;
    expect(visibleEpubCfi([content], new DOMRect(0, 0, 1000, 700))).toBe('epubcfi(/6/2!/4/2/1:12)');
    expect(caret).toHaveBeenCalledWith(2350, 140);
    expect(cfi).toHaveBeenCalledWith(range);
  });
  it('rejects a caret returned in a neighbouring column', () => {
    const text = document.createTextNode('previous column');
    const range = document.createRange(); range.setStart(text, 0);
    range.getBoundingClientRect = () => new DOMRect(100, 140, 0, 20);
    const content = {
      window: { frameElement: { getBoundingClientRect: () => new DOMRect(-2000, 0, 6000, 700) } },
      document: { caretRangeFromPoint: () => range }, cfiFromRange: vi.fn()
    } as unknown as Contents;
    expect(visibleEpubCfi([content], new DOMRect(0, 0, 1000, 700))).toBeUndefined();
  });
});
