import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { WishlistService, type WishlistResponse } from '../core/wishlist.service';
import { WishlistDialogComponent } from './wishlist-dialog.component';

const response: WishlistResponse = {
  requests: [{ id: 'request', title: 'Dune', author: 'Frank Herbert', notes: '', status: 'pending', createdAt: '2026-10-16T12:00:00Z' }],
  total: 1, page: 1, totalPages: 1
};
describe('WishlistDialogComponent', () => {
  let fixture: ComponentFixture<WishlistDialogComponent>;
  let component: WishlistDialogComponent;
  let load: Subject<WishlistResponse>;
  const admin = signal(false);
  const create = vi.fn(() => of({ request: { id: 'new' } }));
  const updateStatus = vi.fn(() => of(undefined));
  const list = vi.fn();
  beforeEach(() => {
    admin.set(false); create.mockClear(); updateStatus.mockClear(); list.mockReset();
    load = new Subject<WishlistResponse>(); list.mockReturnValue(load);
    HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { isAdmin: admin } },
      { provide: WishlistService, useValue: { list, create, updateStatus } }
    ] });
    fixture = TestBed.createComponent(WishlistDialogComponent); component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('opens the personal list and validates before submitting a trimmed request', () => {
    expect(list).toHaveBeenCalledWith(1, false);
    component.submit(); expect(create).not.toHaveBeenCalled();
    component.form.setValue({ title: ' Dune ', author: ' Frank Herbert ', notes: ' Tome 1 ' });
    component.submit();
    expect(create).toHaveBeenCalledWith({ title: 'Dune', author: 'Frank Herbert', notes: 'Tome 1' });
    expect(component.success()).toContain('ajoutée');
  });

  it('shows personal status cards without admin controls', () => {
    load.next(response); load.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mes demandes');
    expect(fixture.nativeElement.textContent).toContain('Dune');
    expect(fixture.nativeElement.querySelector('.status-field')).toBeNull();
  });

  it('loads the global list for admins and updates a request status', () => {
    admin.set(true); component.load(1);
    expect(list).toHaveBeenLastCalledWith(1, true);
    load.next({ ...response, notificationsConfigured: false }); load.complete(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-field select')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('SMTP_HOST');
    const select = fixture.nativeElement.querySelector('.status-field select') as HTMLSelectElement;
    select.value = 'fulfilled'; select.dispatchEvent(new Event('change'));
    expect(updateStatus).toHaveBeenCalledWith('request', 'fulfilled');
    expect(component.requests()[0]?.status).toBe('fulfilled');
  });
});
