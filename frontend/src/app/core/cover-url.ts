import { environment } from '../../environments/environment';

export function resolveCoverUrl(coverUrl: string | undefined): string | undefined {
  if (!coverUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(coverUrl)) {
    return coverUrl;
  }

  return `${new URL(environment.apiUrl).origin}${coverUrl}`;
}
