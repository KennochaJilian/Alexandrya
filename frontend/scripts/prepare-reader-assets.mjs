import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
const destination = fileURLToPath(new URL('../public/assets/pdfjs/', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(path.join(source, 'build/pdf.worker.min.mjs'), path.join(destination, 'pdf.worker.min.mjs'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(source, folder), path.join(destination, folder), { recursive: true });
}
