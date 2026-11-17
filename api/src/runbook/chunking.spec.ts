import { chunkRunbook, digest } from './chunking.js';

describe('runbook chunking', () => {
  it('preserves Unicode, overlap, stable indexes and content hashes', () => {
    const content = '😀'.repeat(1851);
    const chunks = chunkRunbook(content);
    expect(chunks.map((c) => Array.from(c.content).length)).toEqual([
      1000, 1000, 151,
    ]);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
    expect(chunks.every((c) => c.contentHash === digest(c.content))).toBe(true);
    expect(chunks).toEqual(chunkRunbook(content));
    const original = 'x'.repeat(1000) + 'y'.repeat(500);
    const pieces = chunkRunbook(original);
    expect(Array.from(pieces[0].content).slice(-150).join('')).toBe(
      Array.from(pieces[1].content).slice(0, 150).join(''),
    );
    expect(
      pieces[0].content + Array.from(pieces[1].content).slice(150).join(''),
    ).toBe(original);
  });
  it('does not emit a redundant trailing chunk at exact boundaries', () => {
    expect(chunkRunbook('x'.repeat(1000))).toHaveLength(1);
    expect(chunkRunbook('x'.repeat(1850))).toHaveLength(2);
    expect(chunkRunbook('')).toEqual([]);
  });
});
