import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { AdminLibraryActionResponse, CreateUserRequest, UserListResponse, UserResponse } from './models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listUsers() {
    return this.http.get<UserListResponse>(`${environment.apiUrl}/admin/users`);
  }

  createUser(payload: CreateUserRequest) {
    return this.http.post<UserResponse>(`${environment.apiUrl}/admin/users`, payload);
  }

  rescanLibrary() {
    return this.http.post<AdminLibraryActionResponse>(`${environment.apiUrl}/admin/library/rescan`, {});
  }

  reindexSearch() {
    return this.http.post<AdminLibraryActionResponse>(`${environment.apiUrl}/admin/search/reindex`, {});
  }
}
