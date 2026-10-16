import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, firstValueFrom, from, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { Book } from './models';

export type ReadingPosition = {
  label: string;
  completed: boolean;
} & (
  { format: 'epub'; cfi: string } |
  { format: 'pdf'; page: number; totalPages: number; scroll: number }
);
export interface CurrentReading {
  bookId: string;
  format: 'epub' | 'pdf';
  label: string;
  updatedAt: string;
  book: Pick<Book, 'id' | 'title' | 'authors' | 'coverUrl' | 'format'>;
}

@Injectable({ providedIn: 'root' })
export class ReadingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly writes = new Map<string, Promise<void>>();

  getProgress(bookId: string) {
    const key = this.pendingKey(bookId);
    return this.http.get<{ progress: (ReadingPosition & { updatedAt?: string }) | null }>(`${environment.apiUrl}/books/${encodeURIComponent(bookId)}/progress`).pipe(map(response => {
      // Recover a last position if the browser closed before its request completed.
      try {
        const pending = JSON.parse(localStorage.getItem(key) ?? 'null') as { position: ReadingPosition; savedAt: number } | null;
        if (pending && (!response.progress?.updatedAt || pending.savedAt > Date.parse(response.progress.updatedAt))) {
          return { progress: pending.position };
        }
      } catch {}
      return response;
    }));
  }

  listCurrent() {
    return defer(() => {
      const prefix = this.auth.currentUser()?.id + ':';
      const outstanding = [...this.writes.entries()].filter(([key]) => key.startsWith(prefix)).map(([, write]) => write.catch(() => {}));
      return from(Promise.all(outstanding)).pipe(switchMap(() =>
        this.http.get<{ readings: CurrentReading[] }>(`${environment.apiUrl}/auth/me/readings`)
      ));
    });
  }

  private pendingKey(bookId: string) { return `alexandrya.reading.pending:${this.auth.currentUser()?.id}:${bookId}`; }

  // Serialize writes to a given book, including writes finishing after the reader closes.
  save(bookId: string, position: ReadingPosition): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    const key = `${userId}:${bookId}`;
    const pendingKey = this.pendingKey(bookId);
    const pendingValue = JSON.stringify({ position, savedAt: Date.now() });
    try { localStorage.setItem(pendingKey, pendingValue); } catch {}
    const previous = this.writes.get(key) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      if (!userId || this.auth.currentUser()?.id !== userId) throw new Error('Session changed');
      await firstValueFrom(this.http.put<void>(`${environment.apiUrl}/books/${encodeURIComponent(bookId)}/progress`, position));
      try { if (localStorage.getItem(pendingKey) === pendingValue) localStorage.removeItem(pendingKey); } catch {}
    });
    this.writes.set(key, write);
    void write.finally(() => { if (this.writes.get(key) === write) this.writes.delete(key); }).catch(() => {});
    return write;
  }
}
