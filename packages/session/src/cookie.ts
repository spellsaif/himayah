import type { CookieOptions, CookieInstruction } from "./types.js";

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const indexOfEquals = pair.indexOf("=");
    if (indexOfEquals < 0) continue;
    const key = pair.substring(0, indexOfEquals).trim();
    const val = pair.substring(indexOfEquals + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (options.maxAge !== undefined) {
    cookieStr += `; Max-Age=${options.maxAge}`;
  }
  if (options.domain) {
    cookieStr += `; Domain=${options.domain}`;
  }
  if (options.path) {
    cookieStr += `; Path=${options.path}`;
  } else {
    cookieStr += `; Path=/`;
  }

  if (options.secure) {
    cookieStr += "; Secure";
  }
  if (options.httpOnly !== false) {
    cookieStr += "; HttpOnly";
  }
  if (options.sameSite) {
    const sameSiteLower = options.sameSite.toLowerCase();
    const sameSiteVal = sameSiteLower === "lax" ? "Lax" : sameSiteLower === "strict" ? "Strict" : "None";
    cookieStr += `; SameSite=${sameSiteVal}`;
  } else {
    cookieStr += "; SameSite=Lax";
  }

  return cookieStr;
}

export function createCookieInstruction(
  name: string,
  value: string,
  options: CookieOptions = {}
): CookieInstruction {
  return {
    name,
    value,
    options
  };
}
