export interface CookieOptions {
  name?: string;
  maxAge?: number;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  httpOnly?: boolean;
  domain?: string;
}

export interface CookieInstruction {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface JWTSessionOptions {
  secret: string;
  salt?: string;
  maxAge?: number; // In seconds, e.g. 15 * 60 for 15 mins
  strategy?: "JWE" | "JWS"; // defaults to JWE
}

export interface SessionStore {
  create(payload: Record<string, any>): Promise<string>;
  verify(token: string): Promise<Record<string, any> | null>;
}
