import type { MiddlewareHandler } from "hono";
import type { SessionData, AuthResult } from "@himayah/core";

export type HimayahVariables = {
  auth: AuthResult<SessionData>;
};

export type HimayahContext = {
  Variables: HimayahVariables;
};

export interface HonoMiddlewareOptions {
  prefix?: string;
}

export function honoMiddleware(
  auth: {
    handleRequest: (req: Request, options?: { prefix?: string }) => Promise<Response>;
    getSession: (req: Request) => Promise<AuthResult<SessionData>>;
  },
  options?: HonoMiddlewareOptions
): MiddlewareHandler {
  const prefix = options?.prefix || "/api/auth";

  return async (c, next) => {
    const url = new URL(c.req.url);

    // If matching auth prefix, route request directly through Himayah handleRequest
    if (url.pathname.startsWith(prefix)) {
      const response = await auth.handleRequest(c.req.raw, { prefix });
      return response;
    }

    // Otherwise retrieve active session and populate context variables
    const sessionResult = await auth.getSession(c.req.raw);
    c.set("auth", sessionResult as any);

    await next();
  };
}
