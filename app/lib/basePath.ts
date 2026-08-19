export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Prefixes a root-relative path (e.g. "/audio.mp3") with the app's
 * deployment base path. Leaves absolute URLs (http/https/blob/data) untouched.
 */
export function withBasePath(path: string): string {
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  return `${BASE_PATH}${path}`;
}
