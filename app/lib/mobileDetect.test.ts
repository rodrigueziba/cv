import { describe, expect, it, vi, afterEach } from 'vitest';
import { isMobileDevice } from './mobileDetect';

function mockEnv(ua: string, maxTouchPoints: number, coarsePointer: boolean) {
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query.includes('coarse') || query.includes('hover: none') ? coarsePointer : false,
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isMobileDevice', () => {
  it('returns true for an iPhone Safari user agent with a coarse touch pointer', () => {
    mockEnv(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      5,
      true
    );
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for an Android Chrome user agent with a coarse touch pointer', () => {
    mockEnv('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 5, true);
    expect(isMobileDevice()).toBe(true);
  });

  it('returns false for a desktop Chrome user agent', () => {
    mockEnv('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 0, false);
    expect(isMobileDevice()).toBe(false);
  });

  it('returns false for an Android user agent on a fine-pointer device (e.g. a Chromebook with a trackpad)', () => {
    mockEnv('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 5, false);
    expect(isMobileDevice()).toBe(false);
  });
});
