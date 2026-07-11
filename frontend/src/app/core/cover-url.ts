import { environment } from '../../environments/environment';

export function resolveCoverUrl(coverUrl: string | undefined): string | undefined {
  if (!coverUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(coverUrl)) {
    return coverUrl;
  }

  const browserOrigin = globalThis.location?.origin ?? 'http://localhost';
  const apiUrl = new URL(environment.apiUrl, browserOrigin);

  return new URL(coverUrl, apiUrl.origin).toString();
}
