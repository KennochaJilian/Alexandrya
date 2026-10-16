import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { LucideDownload, LucideHistory, LucideSend } from '@lucide/angular';
import { finalize } from 'rxjs';
import { environment } from '../../environments/environment';
import { readApiError } from '../core/api-error';
import { resolveCoverUrl } from '../core/cover-url';
import { LeafSpinnerComponent } from './leaf-spinner.component';

interface Activity {
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  format: string;
  action: 'download' | 'kindle';
  occurredAt: string;
  userEmail?: string;
  userName?: string;
}
interface ActivityResponse {
  activities: Activity[];
  total: number;
  page: number;
  totalPages: number;
}

@Component({
  selector: 'app-activity-history',
  imports: [CommonModule, LucideDownload, LucideHistory, LucideSend, LeafSpinnerComponent],
  templateUrl: './activity-history.component.html',
  styleUrl: './activity-history.component.scss'
})
export class ActivityHistoryComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly global = input(false);
  readonly activities = signal<Activity[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly coverSrc = resolveCoverUrl;

  ngOnInit() { this.load(1); }

  load(page: number) {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    const endpoint = this.global() ? '/admin/activity' : '/auth/me/activity';
    this.http.get<ActivityResponse>(`${environment.apiUrl}${endpoint}`, {
      params: { page, pageSize: 12 }
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => {
        this.activities.set(result.activities);
        this.total.set(result.total);
        this.page.set(result.page);
        this.totalPages.set(result.totalPages);
      },
      error: (error: unknown) => this.error.set(readApiError(error))
    });
  }
}
