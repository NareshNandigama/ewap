import { createHash } from 'node:crypto';
export const CHUNKING_VERSION = 'unicode-1000-150-v1';
export const digest = (content: string) =>
  createHash('sha256').update(content, 'utf8').digest('hex');

export function chunkRunbook(content: string) {
  const points = Array.from(content);
  const chunks: { chunkIndex: number; content: string; contentHash: string }[] =
    [];
  for (let start = 0; start < points.length; start += 850) {
    const text = points.slice(start, start + 1000).join('');
    chunks.push({
      chunkIndex: chunks.length,
      content: text,
      contentHash: digest(text),
    });
    if (start + 1000 >= points.length) break;
  }
  return chunks;
}
