import type Contents from 'epubjs/types/contents';

/** Anchor inside the visible page, rather than on a column boundary that can reopen the previous page. */
export function visibleEpubCfi(contents: Contents[], viewport: DOMRect): string | undefined {
  for (const content of contents) {
    const frame = content.window.frameElement;
    if (!frame) continue;
    const rect = frame.getBoundingClientRect();
    const left = Math.max(viewport.left, rect.left);
    const right = Math.min(viewport.right, rect.right);
    const top = Math.max(viewport.top, rect.top);
    const bottom = Math.min(viewport.bottom, rect.bottom);
    if (right <= left || bottom <= top) continue;
    const document = content.document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    for (const fraction of [.35, .5, .65]) {
      const x = left + (right - left) * fraction - rect.left;
      const y = top + (bottom - top) * .2 - rect.top;
      const caret = document.caretPositionFromPoint?.(x, y);
      let range = document.caretRangeFromPoint?.(x, y);
      if (caret) {
        range = document.createRange();
        range.setStart(caret.offsetNode, caret.offset);
      }
      if (!range || range.startContainer.nodeType !== 3) continue;
      range.collapse(true);
      const anchor = range.getBoundingClientRect();
      // Some engines return a caret in a neighbouring CSS column when over whitespace.
      if (anchor.left + rect.left < left || anchor.left + rect.left >= right ||
          anchor.top + rect.top < top || anchor.bottom + rect.top > bottom) continue;
      return content.cfiFromRange(range);
    }
  }
  return undefined;
}

export interface ReaderPointer { x: number; y: number; time: number }
export function readerGesture(start: ReaderPointer, end: ReaderPointer, width: number, selectedText = false): 'previous' | 'next' | 'controls' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (start.y <= 64 && dy >= 40 && Math.abs(dx) < dy) return 'controls';
  if (selectedText || Math.hypot(dx, dy) > 12 || end.time - start.time > 500) return null;
  if (end.x < width * .3) return 'previous';
  if (end.x > width * .7) return 'next';
  return 'controls';
}
