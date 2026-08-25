import { describe, expect, it } from 'vitest';
import { TEXT_BLOCKS, TEXT_BLOCK_DURATION_INSTANCES, getTextBlockLines } from './sceneConfig';

describe('sceneConfig text blocks', () => {
  it('defines exactly 5 blocks, each with 4 lines (content resolved via getTextBlockLines)', () => {
    expect(TEXT_BLOCKS).toHaveLength(5);
    TEXT_BLOCKS.forEach((b) => {
      expect(getTextBlockLines(b.id, false)).toHaveLength(4);
      expect(getTextBlockLines(b.id, true)).toHaveLength(4);
    });
  });

  it('first block starts after 1 scroll instance', () => {
    expect(TEXT_BLOCKS[0].startInstance).toBe(1);
  });

  it('each block lasts exactly 3 scroll instances', () => {
    expect(TEXT_BLOCK_DURATION_INSTANCES).toBe(3);
  });

  it('blocks are ordered by start instance and do not overlap by default', () => {
    for (let i = 1; i < TEXT_BLOCKS.length; i++) {
      const prevEnd = TEXT_BLOCKS[i - 1].startInstance + TEXT_BLOCK_DURATION_INSTANCES;
      expect(TEXT_BLOCKS[i].startInstance).toBeGreaterThanOrEqual(prevEnd);
    }
  });
});
