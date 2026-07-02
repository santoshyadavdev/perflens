/**
 * Gzip detection and decompression utilities using the browser's native DecompressionStream API.
 */

const GZIP_MAGIC = [0x1f, 0x8b];

export function isGzipped(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

export async function decompressGzip(file: File): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = file.stream().pipeThrough(ds);
  const response = new Response(stream);
  return response.text();
}

export async function readFileText(file: File): Promise<string> {
  const head = await file.slice(0, 2).arrayBuffer();
  if (isGzipped(head)) {
    return decompressGzip(file);
  }
  return file.text();
}
