import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ReadingService, type ReadingPosition } from './reading.service';
import type { User } from './models';
import { environment } from '../../environments/environment';

const position: ReadingPosition = { format: 'pdf', page: 2, totalPages: 10, scroll: .4, label: 'Page 2 / 10', completed: false };
const url = `${environment.apiUrl}/books/book/progress`;

describe('ReadingService', () => {
  let service: ReadingService;
  let http: HttpTestingController;
  const user = signal<User | null>(null);
  beforeEach(() => {
    localStorage.clear();
    user.set({ id: 'alice', email: 'alice@example.test', role: 'user' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { currentUser: user } }] });
    service = TestBed.inject(ReadingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('serializes saves and loads the home shelf after the last write', async () => {
    const first = service.save('book', position);
    const second = service.save('book', { ...position, page: 3 });
    const shelf = firstValueFrom(service.listCurrent());
    await Promise.resolve(); await Promise.resolve();
    http.expectOne(url).flush(null);
    await first;
    await Promise.resolve(); await Promise.resolve();
    const request = http.expectOne(url);
    expect(request.request.body.page).toBe(3);
    http.expectNone(`${environment.apiUrl}/auth/me/readings`);
    request.flush(null);
    await second;
    await Promise.resolve(); await Promise.resolve();
    http.expectOne(`${environment.apiUrl}/auth/me/readings`).flush({ readings: [] });
    expect(await shelf).toEqual({ readings: [] });
    expect(localStorage.getItem('alexandrya.reading.pending:alice:book')).toBeNull();
  });

  it('recovers a position not yet delivered to the server without exposing it to another user', async () => {
    localStorage.setItem('alexandrya.reading.pending:alice:book', JSON.stringify({ position, savedAt: Date.now() }));
    const recovered = firstValueFrom(service.getProgress('book'));
    http.expectOne(url).flush({ progress: null });
    expect((await recovered).progress).toEqual(position);
    user.set({ id: 'bob', email: 'bob@example.test', role: 'user' });
    const other = firstValueFrom(service.getProgress('book'));
    http.expectOne(url).flush({ progress: null });
    expect((await other).progress).toBeNull();
  });

  it('rejects queued writes when the signed-in user changes', async () => {
    const save = service.save('book', position);
    const rejected = expect(save).rejects.toThrow('Session changed');
    user.set({ id: 'bob', email: 'bob@example.test', role: 'user' });
    await rejected;
    http.expectNone(url);
  });
});
