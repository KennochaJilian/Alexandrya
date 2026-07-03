import { HttpErrorResponse } from '@angular/common/http';

export function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.message ?? 'Le serveur na pas repondu correctement.';
  }

  return 'Une erreur inattendue est survenue.';
}
