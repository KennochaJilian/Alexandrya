import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import type { Location } from 'epubjs/types/rendition';
import { BookReaderComponent } from './book-reader.component';
import { BooksService } from '../core/books.service';
import { ReadingService } from '../core/reading.service';

function location(page: number): Location {
  const start = { cfi: `epubcfi(/6/2!/4/2/1:${page * 100})`, href: 'one.xhtml', index: 0, location: page, percentage: 0, displayed: { page, total: 8 } };
  return { start, end: start, atStart: page === 1, atEnd: false };
}

describe('BookReaderComponent', () => {
  let fixture: ComponentFixture<BookReaderComponent>;
  let reader: BookReaderComponent;
  const save = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    vi.useFakeTimers(); save.mockClear();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: BooksService, useValue: { readBook: () => NEVER } },
      { provide: ReadingService, useValue: { getProgress: () => NEVER, save } }
    ] });
    fixture = TestBed.createComponent(BookReaderComponent);
    fixture.componentRef.setInput('book', { id: 'book', title: 'Book', authors: [], genres: [], format: 'epub', fileName: 'book.epub', relativePath: 'book.epub', sizeBytes: 1 });
    reader = fixture.componentInstance;
    fixture.detectChanges(); reader.loading.set(false);
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  it('hides settings at 3 seconds, then allows them to be shown again without resizing the content', () => {
    vi.advanceTimersByTime(2999); expect(reader.controlsVisible()).toBe(true);
    vi.advanceTimersByTime(1); expect(reader.controlsVisible()).toBe(false);
    reader.showControls(); expect(reader.controlsVisible()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.reader-footer button').length).toBe(0);
  });

  it('reads the live page before closing even if relocated still refers to the previous page', () => {
    const internal = reader as unknown as { resumeReady: boolean; rendition: unknown; lastPosition: unknown };
    internal.resumeReady = true;
    internal.lastPosition = { format: 'epub', cfi: location(1).start.cfi, label: 'Page 1', completed: false };
    internal.rendition = { currentLocation: () => location(4), getContents: () => [] };
    reader.close();
    expect(save).toHaveBeenCalledWith('book', expect.objectContaining({ cfi: location(4).start.cfi, label: 'Page 4 / 8 du chapitre' }));
    internal.rendition = undefined;
  });
});
