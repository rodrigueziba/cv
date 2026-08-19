import { describe, expect, it } from 'vitest';
import { withBasePath } from './basePath';

describe('withBasePath', () => {
  it('prefixes a leading-slash path with the configured base path', () => {
    expect(withBasePath('/audio.mp3')).toMatch(/\/audio\.mp3$/);
  });

  it('does not double-prefix an already-absolute URL', () => {
    expect(withBasePath('https://example.com/x.mp3')).toBe('https://example.com/x.mp3');
  });
});
