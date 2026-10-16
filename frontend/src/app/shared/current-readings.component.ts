import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideBookOpen } from '@lucide/angular';
import { ReadingService, type CurrentReading } from '../core/reading.service';
import { resolveCoverUrl } from '../core/cover-url';

@Component({
  selector: 'app-current-readings',
  imports: [CommonModule, RouterLink, LucideBookOpen],
  template: `
    @if (error()) {
      <p class="reading-error" role="status">Les lectures en cours n’ont pas pu être chargées.
        <button type="button" (click)="load()">Réessayer</button>
      </p>
    }
    @if (readings().length) {
      <section class="current-readings" aria-labelledby="current-readings-title">
        <div class="shelf-heading"><svg lucideBookOpen aria-hidden="true" [size]="22"></svg>
          <div><span>Votre marque-page vous attend</span><h2 id="current-readings-title">Lectures en cours</h2></div>
        </div>
        <div class="reading-cards">
          @for (reading of readings(); track reading.bookId) {
            <a class="reading-card" [routerLink]="['/books', reading.bookId]" [queryParams]="{ read: '1' }" [attr.aria-label]="'Reprendre ' + reading.book.title">
              <span class="reading-cover">
                @if (coverSrc(reading.book.coverUrl); as cover) {
                  <img [src]="cover" alt="" loading="lazy" referrerpolicy="no-referrer" />
                } @else { <span aria-hidden="true">{{ reading.book.title.slice(0, 1) }}</span> }
              </span>
              <span class="reading-copy"><strong>{{ reading.book.title }}</strong>
                <small>{{ reading.book.authors.join(', ') || 'Auteur inconnu' }}</small>
                <span class="reading-location">{{ reading.label }}</span>
                <time [attr.datetime]="reading.updatedAt">{{ reading.updatedAt | date:'dd/MM/yyyy à HH:mm' }}</time>
                <span class="resume">Reprendre la lecture →</span>
              </span>
            </a>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './current-readings.component.scss'
})
export class CurrentReadingsComponent {
  private readonly reading = inject(ReadingService);
  readonly readings = signal<CurrentReading[]>([]);
  readonly error = signal(false);
  readonly coverSrc = resolveCoverUrl;
  constructor() { this.load(); }
  load() {
    this.error.set(false);
    this.reading.listCurrent().subscribe({
      next: ({ readings }) => this.readings.set(readings),
      error: () => this.error.set(true)
    });
  }
}
