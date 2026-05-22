import type { User } from "@himayah/adapter";
import type { SessionStore } from "@himayah/session";

export interface SessionData {
  userId: string;
  user: User;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AuthResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; error: AuthError; data?: never };

export interface PluginContext {
  userAdapter?: any;
  sessionAdapter?: any;
  oauthAdapter?: any;
  sessionStore: SessionStore;
  cookieName?: string;
  cookieOptions?: any;
}

export interface AuthPlugin {
  name: string;
  init(ctx: PluginContext): {
    handlers?: Record<string, Function>;
    routes?: Record<string, (req: Request, params: Record<string, string>) => Promise<any>>;
  };
}
