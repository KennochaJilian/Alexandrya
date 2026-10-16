import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideArrowLeft, LucideArrowRight, LucideMinus, LucidePlus, LucideMoon, LucideSun, LucideMaximize, LucideMinimize, LucideCheck, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import type EpubBook from 'epubjs/types/book';
import type Rendition from 'epubjs/types/rendition';
import type { Location } from 'epubjs/types/rendition';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { BooksService } from '../core/books.service';
import { ReadingService, type ReadingPosition } from '../core/reading.service';
import type { Book } from '../core/models';
import { LeafSpinnerComponent } from './leaf-spinner.component';

@Component({
  selector: 'app-book-reader',
  imports: [CommonModule, LucideArrowLeft, LucideArrowRight, LucideMinus, LucidePlus, LucideMoon, LucideSun, LucideMaximize, LucideMinimize, LucideCheck, LucideX, LeafSpinnerComponent],
  templateUrl: './book-reader.component.html',
  styleUrl: './book-reader.component.scss'
})
export class BookReaderComponent implements AfterViewInit {
  readonly book = input.required<Book>();
  readonly closed = output<void>();
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly atStart = signal(true);
  readonly atEnd = signal(false);
  readonly fontSize = signal(100);
  readonly zoom = signal(100);
  readonly location = signal('');
  readonly chapters = signal<{ label: string; href: string }[]>([]);
  readonly chapter = signal('');
  readonly dark = signal(this.readDarkPreference());
  readonly expanded = signal(false);
  readonly completed = signal(false);
  readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly readerNotice = signal<string | null>(null);
  private readonly books = inject(BooksService);
  private readonly reading = inject(ReadingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private epub?: EpubBook;
  private rendition?: Rendition;
  private pdf?: PDFDocumentProxy;
  private pdfTask?: PDFDocumentLoadingTask;
  private renderTask?: RenderTask;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private lastPosition?: ReadingPosition;
  private lastSaved = '';
  private resumeReady = false;
  private writeSequence = 0;
  private savedScroll = 0;
  private nativeFullscreen = false;
  private destroyed = false;
  private previousOverflow = '';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.flushProgress();
      this.destroyed = true;
      clearTimeout(this.saveTimer);
      clearTimeout(this.resizeTimer);
      this.resizeObserver?.disconnect();
      this.renderTask?.cancel();
      void this.pdfTask?.destroy();
      this.epub?.destroy();
      if (this.nativeFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      document.body.style.overflow = this.previousOverflow;
      this.dialog().nativeElement.close();
    });
  }

  isPdf() { return this.book().format.toLowerCase() === 'pdf'; }

  async ngAfterViewInit() {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialog().nativeElement.showModal();
    try {
      const [data, { progress }] = await Promise.all([
        firstValueFrom(this.books.readBook(this.book().id).pipe(takeUntilDestroyed(this.destroyRef))),
        firstValueFrom(this.reading.getProgress(this.book().id).pipe(takeUntilDestroyed(this.destroyRef)))
      ]);
      if (this.destroyed) return;
      if (progress?.format === this.book().format.toLowerCase()) this.completed.set(progress.completed);
      if (this.isPdf()) {
        const pdfjs = await import('pdfjs-dist');
        if (this.destroyed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
        this.pdfTask = pdfjs.getDocument({
          data: new Uint8Array(data),
          cMapUrl: new URL('assets/pdfjs/cmaps/', document.baseURI).href,
          cMapPacked: true,
          standardFontDataUrl: new URL('assets/pdfjs/standard_fonts/', document.baseURI).href,
          wasmUrl: new URL('assets/pdfjs/wasm/', document.baseURI).href
        });
        this.pdf = await this.pdfTask.promise;
        if (this.destroyed) return;
        this.totalPages.set(this.pdf.numPages);
        if (progress?.format === 'pdf') {
          this.page.set(Math.max(1, Math.min(this.pdf.numPages, progress.page)));
          this.savedScroll = progress.scroll;
        }
        await this.renderPdf();
      } else {
        const { default: ePub } = await import('epubjs');
        if (this.destroyed) return;
        this.epub = ePub();
        await this.epub.open(data);
        if (this.destroyed) return;
        this.rendition = this.epub.renderTo(this.viewport().nativeElement, {
          width: '100%', height: '100%', flow: 'paginated', spread: 'none', allowScriptedContent: false
        });
        this.rendition.themes.default({
          body: { 'line-height': '1.7', 'font-family': 'Georgia, serif' }, img: { 'max-width': '100%' }
        });
        this.applyEpubTheme();
        this.rendition.on('relocated', (value: Location) => {
          if (this.destroyed) return;
          this.atStart.set(value.atStart);
          this.atEnd.set(value.atEnd);
          this.chapter.set(value.start.href);
          this.location.set(`Page ${value.start.displayed.page} / ${value.start.displayed.total} du chapitre`);
          this.lastPosition = { format: 'epub', cfi: value.start.cfi, label: this.location(), completed: this.completed() };
          this.scheduleProgress();
        });
        this.rendition.on('keyup', (event: KeyboardEvent) => this.onKey(event));
        this.rendition.on('displayError', () => { if (this.resumeReady) this.fail(); });
        try {
          await this.rendition.display(progress?.format === 'epub' ? progress.cfi : undefined);
        } catch (error) {
          if (progress?.format !== 'epub') throw error;
          await this.rendition.display();
          this.readerNotice.set('L’ancienne position ne correspond plus au fichier. La lecture reprend au début.');
        }
        const navigation = await this.epub.loaded.navigation;
        if (this.destroyed) return;
        const flatten = (items: typeof navigation.toc, depth = 0): { label: string; href: string }[] => items.flatMap(item => [
          { label: `${'— '.repeat(depth)}${item.label.trim()}`, href: item.href }, ...flatten(item.subitems ?? [], depth + 1)
        ]);
        this.chapters.set(flatten(navigation.toc));
      }
      if (this.destroyed) return;
      this.loading.set(false);
      this.resumeReady = true;
      this.scheduleProgress();
      this.resizeObserver = new ResizeObserver(() => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          if (this.isPdf() && !this.destroyed && !this.busy()) void this.perform(() => this.renderPdf());
        }, 150);
      });
      this.resizeObserver.observe(this.viewport().nativeElement);
    } catch { if (!this.destroyed) this.fail(); }
  }

  private fail() {
    this.error.set('Impossible d’ouvrir le livre ou de récupérer sa position. Fermez la visionneuse pour réessayer, ou téléchargez le livre.');
    this.loading.set(false);
  }

  private async renderPdf() {
    if (!this.pdf || this.destroyed) return;
    const pdfPage = await this.pdf.getPage(this.page());
    if (this.destroyed) return;
    const canvas = this.canvas().nativeElement;
    const width = Math.max(240, this.viewport().nativeElement.clientWidth - 32);
    const scale = Math.min(width / pdfPage.getViewport({ scale: 1 }).width, 2) * this.zoom() / 100;
    const viewport = pdfPage.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    await this.renderTask.promise;
    pdfPage.cleanup();
    this.atStart.set(this.page() === 1);
    this.atEnd.set(this.page() === this.totalPages());
    this.location.set(`Page ${this.page()} / ${this.totalPages()}`);
    const element = this.viewport().nativeElement;
    element.scrollTop = this.savedScroll * Math.max(0, element.scrollHeight - element.clientHeight);
    this.capturePdfPosition();
  }

  private async perform(action: () => Promise<unknown>) {
    if (this.loading() || this.busy() || this.error() || this.destroyed) return;
    this.busy.set(true);
    try { await action(); }
    catch { if (!this.destroyed) this.fail(); }
    finally { if (!this.destroyed) this.busy.set(false); }
  }

  move(direction: number) {
    if ((direction < 0 && this.atStart()) || (direction > 0 && this.atEnd())) return;
    void this.perform(async () => {
      if (this.isPdf()) {
        this.savedScroll = 0;
        this.page.update(value => Math.max(1, Math.min(this.totalPages(), value + direction)));
        await this.renderPdf();
      } else { await (direction > 0 ? this.rendition?.next() : this.rendition?.prev()); }
    });
  }

  resizeText(direction: number) {
    void this.perform(async () => {
      if (this.isPdf()) {
        this.zoom.update(value => Math.max(50, Math.min(200, value + direction * 10)));
        await this.renderPdf();
      } else {
        this.fontSize.update(value => Math.max(70, Math.min(180, value + direction * 10)));
        this.rendition?.themes.fontSize(`${this.fontSize()}%`);
      }
    });
  }

  selectChapter(event: Event) {
    const href = (event.target as HTMLSelectElement).value;
    if (href) void this.perform(async () => this.rendition?.display(href));
  }

  private readDarkPreference(): boolean {
    try { return localStorage.getItem('alexandrya.reader.dark') === 'true'; }
    catch { return false; }
  }

  toggleDark() {
    this.dark.update(value => !value);
    try { localStorage.setItem('alexandrya.reader.dark', String(this.dark())); } catch {}
    this.applyEpubTheme();
  }

  private applyEpubTheme() {
    const color = this.dark() ? '#e5dfeb' : '#201628';
    const background = this.dark() ? '#201b26' : '#fffcf7';
    this.rendition?.themes.register('reader', {
      'html, body': { background: background + ' !important', color: color + ' !important' },
      'p, span, div, h1, h2, h3, h4, h5, h6, li, blockquote, td': { color: color + ' !important', background: 'transparent !important' },
      a: { color: (this.dark() ? '#d9a8f0' : '#7d3b93') + ' !important' }
    });
    this.rendition?.themes.select('reader');
  }

  async toggleFullscreen() {
    if (this.expanded()) {
      this.expanded.set(false);
      if (this.nativeFullscreen && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      this.nativeFullscreen = false;
    } else {
      this.expanded.set(true);
      // Dialog elements cannot request fullscreen; the document keeps the modal on top.
      if (document.fullscreenEnabled) {
        try { await document.documentElement.requestFullscreen(); this.nativeFullscreen = true; }
        catch { this.readerNotice.set('Le navigateur ne permet pas le plein écran. Le lecteur occupe toute la fenêtre.'); }
      }
    }
  }

  @HostListener('document:fullscreenchange')
  fullscreenChanged() {
    if (this.nativeFullscreen && !document.fullscreenElement) { this.nativeFullscreen = false; this.expanded.set(false); }
  }

  cancel() { if (this.expanded()) { void this.toggleFullscreen(); return; } this.close(); }
  close() { this.flushProgress(); this.closed.emit(); }

  onPdfScroll() {
    if (this.isPdf() && this.resumeReady && !this.busy()) this.capturePdfPosition();
  }

  private capturePdfPosition() {
    const element = this.viewport().nativeElement;
    const range = element.scrollHeight - element.clientHeight;
    this.savedScroll = range > 0 ? Math.max(0, Math.min(1, element.scrollTop / range)) : 0;
    this.lastPosition = { format: 'pdf', page: this.page(), totalPages: this.totalPages(), scroll: this.savedScroll, label: this.location(), completed: this.completed() };
    this.scheduleProgress();
  }

  toggleCompleted() {
    this.completed.update(value => !value);
    if (this.lastPosition) { this.lastPosition = { ...this.lastPosition, completed: this.completed() }; this.flushProgress(); }
  }

  private scheduleProgress() {
    if (!this.resumeReady || this.destroyed || !this.lastPosition) return;
    clearTimeout(this.saveTimer);
    if (JSON.stringify({ ...this.lastPosition, completed: this.completed() }) === this.lastSaved) return;
    this.saveState.set('saving');
    this.saveTimer = setTimeout(() => this.flushProgress(), 600);
  }

  retrySave() { this.lastSaved = ''; this.flushProgress(); }

  private flushProgress() {
    clearTimeout(this.saveTimer);
    if (!this.resumeReady || !this.lastPosition) return;
    const position = { ...this.lastPosition, completed: this.completed() };
    const signature = JSON.stringify(position);
    if (signature === this.lastSaved) return;
    this.lastSaved = signature;
    const sequence = ++this.writeSequence;
    this.saveState.set('saving');
    void this.reading.save(this.book().id, position).then(() => {
      if (!this.destroyed && sequence === this.writeSequence) this.saveState.set('saved');
    }).catch(() => {
      if (sequence === this.writeSequence) { this.lastSaved = ''; if (!this.destroyed) this.saveState.set('error'); }
    });
  }

  @HostListener('document:visibilitychange')
  visibilityChanged() { if (document.visibilityState === 'hidden') this.flushProgress(); }
  @HostListener('window:pagehide')
  pageHidden() { this.flushProgress(); }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea, button, a, [contenteditable]')) return;
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
  }
}
