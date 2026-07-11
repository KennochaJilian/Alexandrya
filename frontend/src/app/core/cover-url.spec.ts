import { environment } from '../../environments/environment';
import { resolveCoverUrl } from './cover-url';

describe('resolveCoverUrl', () => {
  const originalApiUrl = environment.apiUrl;

  afterEach(() => {
    environment.apiUrl = originalApiUrl;
  });

  it('keeps absolute cover urls unchanged', () => {
    expect(resolveCoverUrl('https://books.example/cover.jpg')).toBe('https://books.example/cover.jpg');
  });

  it('resolves relative cover urls against an absolute api origin', () => {
    environment.apiUrl = 'http://localhost:4000/api';

    expect(resolveCoverUrl('/covers/book.jpg')).toBe('http://localhost:4000/covers/book.jpg');
  });

  it('resolves relative cover urls when the production api url is relative', () => {
    environment.apiUrl = '/api';

    expect(resolveCoverUrl('/covers/book.jpg')).toBe(`${globalThis.location.origin}/covers/book.jpg`);
  });
});
