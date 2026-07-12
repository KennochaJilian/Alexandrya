import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { readApiError } from './api-error';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

function unauthorizedMessage(error: HttpErrorResponse): string {
  const code = error.error?.code;

  if (code === 'TOKEN_EXPIRED') {
    return 'Votre session a expire. Merci de vous reconnecter.';
  }

  if (code === 'INVALID_CREDENTIALS') {
    return readApiError(error);
  }

  return 'Votre session est invalide ou a expire. Merci de vous reconnecter.';
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = auth.token();
  const isLoginRequest = req.url.includes('/auth/login');
  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        toast.error(unauthorizedMessage(error));

        if (!isLoginRequest) {
          auth.clearSession();
          void router.navigateByUrl('/login');
        }
      }

      return throwError(() => error);
    })
  );
};
