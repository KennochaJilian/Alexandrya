import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideArrowLeft, LucideArrowRight, LucideMinus, LucidePlus, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import type EpubBook from 'epubjs/types/book';
import type Rendition from 'epubjs/types/rendition';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { BooksService } from '../core/books.service';
import type { Book } from '../core/models';
import { LeafSpinnerComponent } from './leaf-spinner.component';

@Component({
  selector: 'app-book-reader',
  imports: [CommonModule, LucideArrowLeft, LucideArrowRight, LucideMinus, LucidePlus, LucideX, LeafSpinnerComponent],
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
  private readonly books = inject(BooksService);
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
  private destroyed = false;
  private previousOverflow = '';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.resizeTimer);
      this.resizeObserver?.disconnect();
      this.renderTask?.cancel();
      void this.pdfTask?.destroy();
      this.epub?.destroy();
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
      const data = await firstValueFrom(this.books.readBook(this.book().id).pipe(takeUntilDestroyed(this.destroyRef)));
      if (this.destroyed) return;
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
        await this.renderPdf();
      } else {
        const { default: ePub } = await import('epubjs');
        if (this.destroyed) return;
        this.epub = ePub();
        await this.epub.open(data);
        if (this.destroyed) return;
        this.rendition = this.epub.renderTo(this.viewport().nativeElement, {
          width: '100%', height: '100%', flow: 'paginated', spread: 'none',
          allowScriptedContent: false
        });
        this.rendition.themes.default({
          body: { color: '#201628', 'line-height': '1.7', 'font-family': 'Georgia, serif' },
          img: { 'max-width': '100%' }
        });
        this.rendition.on('relocated', (value: { atStart: boolean; atEnd: boolean; start: { href: string; displayed: { page: number; total: number } } }) => {
          this.atStart.set(value.atStart);
          this.atEnd.set(value.atEnd);
          this.chapter.set(value.start.href);
          this.location.set(`Page ${value.start.displayed.page} / ${value.start.displayed.total} du chapitre`);
        });
        this.rendition.on('keyup', (event: KeyboardEvent) => this.onKey(event));
        this.rendition.on('displayError', () => this.fail());
        await this.rendition.display();
        const navigation = await this.epub.loaded.navigation;
        if (this.destroyed) return;
        const flatten = (items: typeof navigation.toc, depth = 0): { label: string; href: string }[] => items.flatMap(item => [
          { label: `${'— '.repeat(depth)}${item.label.trim()}`, href: item.href },
          ...flatten(item.subitems ?? [], depth + 1)
        ]);
        this.chapters.set(flatten(navigation.toc));
      }
      if (this.destroyed) return;
      this.loading.set(false);
      this.resizeObserver = new ResizeObserver(() => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          if (this.isPdf() && !this.destroyed && !this.busy()) {
            void this.perform(() => this.renderPdf());
          }
        }, 150);
      });
      this.resizeObserver.observe(this.viewport().nativeElement);
    } catch {
      if (!this.destroyed) this.fail();
    }
  }

  private fail() {
    this.error.set('Impossible d’ouvrir ce livre. Le fichier est peut-être endommagé ou protégé. Vous pouvez réessayer en fermant la visionneuse, ou télécharger le livre.');
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
    this.viewport().nativeElement.scrollTo(0, 0);
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
        this.page.update(value => Math.max(1, Math.min(this.totalPages(), value + direction)));
        await this.renderPdf();
      } else {
        await (direction > 0 ? this.rendition?.next() : this.rendition?.prev());
      }
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

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea, button, a, [contenteditable]')) return;
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
  }
}
