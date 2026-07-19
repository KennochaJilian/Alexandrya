import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type {
  AdminBookDeleteResponse,
  AdminBookUploadResponse,
  AdminMaintenanceJobResponse,
  CreateUserRequest,
  UserListResponse,
  UserResponse
} from './models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listUsers() {
    return this.http.get<UserListResponse>(`${environment.apiUrl}/admin/users`);
  }

  createUser(payload: CreateUserRequest) {
    return this.http.post<UserResponse>(`${environment.apiUrl}/admin/users`, payload);
  }

  uploadBooks(files: File[]) {
    const formData = new FormData();

    files.forEach((file) => formData.append('files', file));

    return this.http.post<AdminBookUploadResponse>(`${environment.apiUrl}/admin/library/upload`, formData);
  }

  deleteBook(id: string) {
    return this.http.delete<AdminBookDeleteResponse>(`${environment.apiUrl}/admin/books/${id}`);
  }

  rescanLibrary() {
    return this.http.post<AdminMaintenanceJobResponse>(`${environment.apiUrl}/admin/library/rescan`, {});
  }

  reindexSearch() {
    return this.http.post<AdminMaintenanceJobResponse>(`${environment.apiUrl}/admin/search/reindex`, {});
  }

  getMaintenanceJob(id: string) {
    return this.http.get<AdminMaintenanceJobResponse>(`${environment.apiUrl}/admin/jobs/${id}`);
  }
}
