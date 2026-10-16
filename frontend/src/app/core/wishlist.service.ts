import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export type WishlistStatus = 'pending' | 'fulfilled' | 'rejected';
export interface WishlistRequest {
  id: string;
  title: string;
  author: string;
  notes: string;
  status: WishlistStatus;
  createdAt: string;
  userEmail?: string;
  userName?: string;
  notifiedAt?: string | null;
}
export interface WishlistResponse {
  requests: WishlistRequest[];
  total: number;
  page: number;
  totalPages: number;
  notificationsConfigured?: boolean;
}
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  list(page: number, admin: boolean) {
    return this.http.get<WishlistResponse>(`${environment.apiUrl}/${admin ? 'admin/wishlist' : 'wishlist'}`, { params: { page } });
  }
  create(input: { title: string; author: string; notes: string }) {
    return this.http.post<{ request: { id: string } }>(`${environment.apiUrl}/wishlist`, input);
  }
  updateStatus(id: string, status: WishlistStatus) {
    return this.http.patch<void>(`${environment.apiUrl}/admin/wishlist/${encodeURIComponent(id)}`, { status });
  }
}
