import type { HttpResponse } from '@angular/common/http';

function decodeFileName(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readDownloadFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8FileName = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];

  if (utf8FileName) {
    return decodeFileName(utf8FileName.trim());
  }

  const quotedFileName = /filename="([^"]+)"/i.exec(contentDisposition)?.[1];

  if (quotedFileName) {
    return quotedFileName.trim();
  }

  return /filename=([^;]+)/i.exec(contentDisposition)?.[1]?.trim() ?? null;
}

export function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function saveBlobResponse(response: HttpResponse<Blob>, fallbackFileName: string) {
  if (!response.body) {
    return;
  }

  saveBlob(
    response.body,
    readDownloadFileName(response.headers.get('content-disposition')) ?? fallbackFileName
  );
}
