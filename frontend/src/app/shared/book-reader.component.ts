import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideMinus, LucidePlus, LucideMoon, LucideSun, LucideMaximize, LucideMinimize, LucideCheck, LucideSettings2, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import type Contents from 'epubjs/types/contents';
import { readerGesture, visibleEpubCfi, type ReaderPointer } from './reader-interaction';
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
  imports: [CommonModule, LucideMinus, LucidePlus, LucideMoon, LucideSun, LucideMaximize, LucideMinimize, LucideCheck, LucideSettings2, LucideX, LeafSpinnerComponent],
  templateUrl: './book-reader.component.html',
  styleUrl: './book-reader.component.scss'
})
export class BookReaderComponent implements AfterViewInit {
  readonly book = input.required<Book>();
  readonly closed = output<void>();
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly controlsVisible = signal(true);
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
  private controlsTimer?: ReturnType<typeof setTimeout>;
  private pointerStart?: ReaderPointer & { id: number };
  private readonly contentListeners = new Map<Document, () => void>();
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
      this.captureCurrentEpub();
      this.flushProgress();
      this.destroyed = true;
      clearTimeout(this.controlsTimer);
      for (const remove of this.contentListeners.values()) remove();
      this.contentListeners.clear();
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
    this.showControls();
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
        this.rendition.hooks.content.register((content: Contents) => this.bindContentGestures(content));
        this.rendition.hooks.unloaded.register((view: { contents?: Contents }) => {
          const doc = view.contents?.document;
          if (doc) { this.contentListeners.get(doc)?.(); this.contentListeners.delete(doc); }
        });
        this.rendition.on('relocated', (value: Location) => this.captureEpubLocation(value));
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
      this.captureCurrentEpub();
      this.scheduleProgress();
      this.showControls();
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
    this.showControls();
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
      } else {
        await (direction > 0 ? this.rendition?.next() : this.rendition?.prev());
        // EPUB.js emits relocated on a later animation frame; do not save the old page on a quick close.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        this.captureCurrentEpub();
      }
      this.flushProgress();
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
  close() { this.captureCurrentEpub(); this.flushProgress(); this.closed.emit(); }

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

  private captureEpubLocation(value: Location) {
    if (this.destroyed || !value?.start?.cfi) return;
    this.atStart.set(Boolean(value.atStart));
    this.atEnd.set(Boolean(value.atEnd));
    const href = value.start.href.split('#')[0] ?? '';
    this.chapter.set(this.chapters().find(item => href.endsWith(item.href.split('#')[0] ?? ''))?.href ?? value.start.href);
    this.location.set(`Page ${value.start.displayed.page} / ${value.start.displayed.total} du chapitre`);
    let cfi = value.start.cfi;
    if (this.resumeReady && this.rendition) {
      try {
        const contents = this.rendition.getContents() as unknown as Contents[];
        cfi = visibleEpubCfi(contents, this.viewport().nativeElement.getBoundingClientRect()) ?? cfi;
      } catch { /* A fixed-layout or image-only page can use the engine's own CFI. */ }
    }
    this.lastPosition = { format: 'epub', cfi, label: this.location(), completed: this.completed() };
    this.scheduleProgress();
  }

  private captureCurrentEpub() {
    if (!this.resumeReady || this.isPdf() || this.destroyed || this.error()) return;
    // Read the live manager location, not the last asynchronous relocated event.
    const current = this.rendition?.currentLocation() as unknown as Location | undefined;
    if (current?.start) this.captureEpubLocation(current);
  }

  showControls() {
    if (this.destroyed) return;
    this.controlsVisible.set(true);
    clearTimeout(this.controlsTimer);
    this.controlsTimer = setTimeout(() => {
      const active = document.activeElement;
      if (this.loading() || this.error() || this.saveState() === 'error' || active?.tagName === 'SELECT') {
        this.showControls();
        return;
      }
      const controls = this.dialog().nativeElement.querySelector('.reader-controls');
      if (active && controls?.contains(active)) this.dialog().nativeElement.focus({ preventScroll: true });
      this.controlsVisible.set(false);
    }, 3000);
  }

  pointerDown(event: PointerEvent, content?: Contents) {
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target as Element | null;
    if (target?.closest?.('a, button, input, select, textarea, [contenteditable="true"], .reader-controls')) return;
    const frame = content?.window.frameElement?.getBoundingClientRect();
    const rect = this.dialog().nativeElement.getBoundingClientRect();
    this.pointerStart = { id: event.pointerId, x: event.clientX + (frame?.left ?? 0) - rect.left,
      y: event.clientY + (frame?.top ?? 0) - rect.top, time: Date.now() };
  }

  pointerUp(event: PointerEvent, content?: Contents) {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (!start || start.id !== event.pointerId) return;
    const frame = content?.window.frameElement?.getBoundingClientRect();
    const rect = this.dialog().nativeElement.getBoundingClientRect();
    const selected = (content?.document ?? document).getSelection()?.isCollapsed === false;
    const action = readerGesture(start, { x: event.clientX + (frame?.left ?? 0) - rect.left,
      y: event.clientY + (frame?.top ?? 0) - rect.top, time: Date.now() }, rect.width, selected);
    if (action === 'controls') this.showControls();
    if (action === 'previous') this.move(-1);
    if (action === 'next') this.move(1);
  }

  pointerCancel() { this.pointerStart = undefined; }

  private bindContentGestures(content: Contents) {
    const doc = content.document;
    if (this.contentListeners.has(doc)) return;
    const down = (event: PointerEvent) => this.pointerDown(event, content);
    const up = (event: PointerEvent) => this.pointerUp(event, content);
    const cancel = () => this.pointerCancel();
    doc.addEventListener('pointerdown', down);
    doc.addEventListener('pointerup', up);
    doc.addEventListener('pointercancel', cancel);
    this.contentListeners.set(doc, () => {
      doc.removeEventListener('pointerdown', down);
      doc.removeEventListener('pointerup', up);
      doc.removeEventListener('pointercancel', cancel);
    });
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
      if (!this.destroyed && sequence === this.writeSequence && JSON.stringify({ ...this.lastPosition, completed: this.completed() }) === signature) this.saveState.set('saved');
    }).catch(() => {
      if (sequence === this.writeSequence) { this.lastSaved = ''; if (!this.destroyed) { this.saveState.set('error'); this.showControls(); } }
    });
  }

  @HostListener('document:visibilitychange')
  visibilityChanged() { if (document.visibilityState === 'hidden') { this.captureCurrentEpub(); this.flushProgress(); } }
  @HostListener('window:pagehide')
  pageHidden() { this.captureCurrentEpub(); this.flushProgress(); }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Tab') this.showControls();
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea, button, a, [contenteditable]')) return;
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
  }
}
