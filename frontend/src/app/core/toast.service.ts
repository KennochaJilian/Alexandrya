import { Injectable, signal } from '@angular/core';

type ToastKind = 'error' | 'info' | 'success';

interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;

  readonly toast = signal<ToastMessage | null>(null);

  show(message: string, kind: ToastKind = 'info', durationMs = 4800) {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    this.toast.set({
      id: this.nextId,
      kind,
      message
    });
    this.nextId += 1;

    this.hideTimer = setTimeout(() => this.clear(), durationMs);
  }

  error(message: string) {
    this.show(message, 'error');
  }

  clear() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.toast.set(null);
  }
}
