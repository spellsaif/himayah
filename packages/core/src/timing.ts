/**
 * Compares two strings in constant-time to prevent timing attacks.
 * Safe for use on Edge engines (Vercel, Cloudflare Workers) as well as Node.js.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const aLen = a.length;
  const bLen = b.length;
  let mismatch = aLen !== bLen ? 1 : 0;
  const maxLen = Math.max(aLen, bLen);

  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0;
    const charB = i < bLen ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }

  return mismatch === 0;
}
