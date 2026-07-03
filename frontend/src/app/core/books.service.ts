import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { BookFilters, BookListResponse, BookResponse, KindleSendResponse } from './models';

@Injectable({ providedIn: 'root' })
export class BooksService {
  private readonly http = inject(HttpClient);

  searchBooks(filters: BookFilters) {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });

    return this.http.get<BookListResponse>(`${environment.apiUrl}/books`, { params });
  }

  getBook(id: string) {
    return this.http.get<BookResponse>(`${environment.apiUrl}/books/${id}`);
  }

  rescan() {
    return this.http.post<BookListResponse>(`${environment.apiUrl}/books/rescan`, {});
  }

  sendToKindle(id: string) {
    return this.http.post<KindleSendResponse>(`${environment.apiUrl}/books/${id}/send-to-kindle`, {});
  }
}
