import type { UserAdapter, SessionAdapter, OAuthAdapter } from "@himayah/adapter";
import type { SessionStore } from "@himayah/session";
import { serializeCookie, parseCookies } from "@himayah/session";
import type { AuthPlugin, PluginContext, AuthResult, SessionData, RateLimitStore } from "./types.js";
import { timingSafeEqual } from "./timing.js";

export interface CreateAuthConfig {
  adapter?: UserAdapter & Partial<SessionAdapter> & Partial<OAuthAdapter>;
  sessionStore: SessionStore;
  plugins: AuthPlugin[];
  cookieName?: string;
  cookieOptions?: {
    maxAge?: number;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    domain?: string;
  };
  csrf?: boolean | {
    cookieName?: string;
    headerName?: string;
  };
  baseUrl?: string;
  rateLimitStore?: RateLimitStore;
}

// Simple path matcher supporting dynamic parameters like :providerId
function matchRoute(routePattern: string, requestPath: string): Record<string, string> | null {
  const patternParts = routePattern.split("/").filter(Boolean);
  const pathParts = requestPath.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function createAuth(config: CreateAuthConfig) {
  const {
    adapter,
    sessionStore,
    plugins,
    cookieName = "himayah.sid",
    cookieOptions = {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      secure: true,
      sameSite: "lax",
      path: "/"
    }
  } = config;

  const csrfConfig = typeof config.csrf === "boolean"
    ? { enabled: config.csrf }
    : { enabled: true, ...config.csrf };
  const csrfCookieName = csrfConfig.cookieName || "himayah.csrf";
  const csrfHeaderName = csrfConfig.headerName || "x-csrf-token";

  const context: PluginContext = {
    userAdapter: adapter,
    sessionAdapter: adapter,
    oauthAdapter: adapter,
    sessionStore,
    cookieName,
    cookieOptions,
    baseUrl: config.baseUrl,
    rateLimitStore: config.rateLimitStore
  };

  const handlers: Record<string, Record<string, Function>> = {};
  const routes: Record<string, (req: Request, params: Record<string, string>) => Promise<any>> = {};

  // Initialize plugins and wrap handlers
  for (const plugin of plugins) {
    const pluginResult = plugin.init(context);
    if (pluginResult.handlers) {
      handlers[plugin.name] = {};
      for (const [handlerName, handlerFn] of Object.entries(pluginResult.handlers)) {
        handlers[plugin.name][handlerName] = async (...args: any[]) => {
          const result = await handlerFn(...args);
          if (result.ok && result.data && (result.data.sessionToken || result.data.token)) {
            const token = result.data.sessionToken || result.data.token;
            result.data.cookies = [
              {
                name: cookieName,
                value: token,
                options: cookieOptions
              }
            ];
          }
          return result;
        };
      }
    }
    if (pluginResult.routes) {
      for (const [routeKey, routeHandler] of Object.entries(pluginResult.routes)) {
        routes[`${plugin.name}/${routeKey}`] = routeHandler;
      }
    }
  }

  // Native getSession logic
  const getSession = async (req: Request): Promise<AuthResult<SessionData>> => {
    try {
      const cookieHeader = req.headers.get("cookie");
      const cookies = parseCookies(cookieHeader);
      const token = cookies[cookieName];

      if (!token) {
        return {
          ok: false,
          error: { code: "session_not_found", message: "No active session cookie found" }
        };
      }

      // Verify token
      const sessionData = await sessionStore.verify(token);
      if (!sessionData) {
        return {
          ok: false,
          error: { code: "session_invalid", message: "Invalid or expired session token" }
        };
      }

      return {
        ok: true,
        data: sessionData as SessionData
      };
    } catch (err: any) {
      return {
        ok: false,
        error: { code: "server_error", message: err.message || "Failed to retrieve session" }
      };
    }
  };

  // Sign out logic
  const signOut = async (req: Request): Promise<AuthResult<{ cookies: any[] }>> => {
    const cookieHeader = req.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);
    const token = cookies[cookieName];

    if (token && adapter?.deleteSession) {
      await adapter.deleteSession(token).catch(() => {});
    }

    const deletionCookie = {
      name: cookieName,
      value: "",
      options: { ...cookieOptions, maxAge: 0 }
    };

    return {
      ok: true,
      data: {
        cookies: [deletionCookie]
      }
    };
  };

  // Catch-all request router mapping /api/auth prefix
  const handleRequest = async (req: Request, options?: { prefix?: string }): Promise<Response> => {
    const prefix = options?.prefix || "/api/auth";
    const url = new URL(req.url);
    let path = url.pathname;

    if (!path.startsWith(prefix)) {
      return new Response("Not found", { status: 404 });
    }

    // Strip prefix
    path = path.slice(prefix.length);
    if (path.startsWith("/")) {
      path = path.slice(1);
    }

    // CSRF check for state-changing methods
    const method = req.method.toUpperCase();
    if (csrfConfig.enabled && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const cookieHeader = req.headers.get("cookie");
      const cookies = parseCookies(cookieHeader);
      const csrfCookie = cookies[csrfCookieName];
      const csrfHeader = req.headers.get(csrfHeaderName) || req.headers.get(csrfHeaderName.toLowerCase());

      if (!csrfCookie || !csrfHeader || !timingSafeEqual(csrfCookie, csrfHeader)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "csrf_rejected", message: "CSRF token mismatch or missing" }
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // Check built-in paths
    if (path === "session" && req.method === "GET") {
      const result = await getSession(req);
      const headers = new Headers({ "Content-Type": "application/json" });
      
      let csrfToken = "";
      if (csrfConfig.enabled) {
        const cookieHeader = req.headers.get("cookie");
        const cookies = parseCookies(cookieHeader);
        const existingCsrf = cookies[csrfCookieName];
        if (!existingCsrf) {
          csrfToken = crypto.randomUUID();
          headers.append(
            "Set-Cookie",
            serializeCookie(csrfCookieName, csrfToken, {
              ...cookieOptions,
              httpOnly: false // accessible to JS
            })
          );
        } else {
          csrfToken = existingCsrf;
        }
      }

      const body = {
        ...result,
        ...(csrfConfig.enabled ? { csrfToken } : {})
      };

      return new Response(JSON.stringify(body), {
        status: result.ok ? 200 : 401,
        headers
      });
    }

    if (path === "signout" && (req.method === "POST" || req.method === "GET")) {
      const result = await signOut(req);
      const headers = new Headers({ "Content-Type": "application/json" });
      if (result.ok && result.data.cookies) {
        for (const cookie of result.data.cookies) {
          headers.append("Set-Cookie", serializeCookie(cookie.name, cookie.value, cookie.options));
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers
      });
    }

    // Map dynamic route endpoints matching registered plugin routes
    for (const [routePattern, handler] of Object.entries(routes)) {
      const params = matchRoute(routePattern, path);
      if (params) {
        try {
          const routeResult = await handler(req, params);
          if (routeResult instanceof Response) {
            return routeResult;
          }

          const status = routeResult.status || 200;
          const body = routeResult.body || {};
          const headers = new Headers({ "Content-Type": "application/json" });

          // Auto-inject session cookie if sessionToken or token is present
          if (body.ok && body.data && (body.data.sessionToken || body.data.token)) {
            const token = body.data.sessionToken || body.data.token;
            headers.append("Set-Cookie", serializeCookie(cookieName, token, cookieOptions));
          }

          // Inject any handler-specific cookies
          if (routeResult.cookies) {
            for (const cookie of routeResult.cookies) {
              headers.append("Set-Cookie", serializeCookie(cookie.name, cookie.value, cookie.options));
            }
          }

          return new Response(JSON.stringify(body), { status, headers });
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: { code: "route_error", message: err.message || "Failed to execute route" }
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    }

    return new Response("Not found", { status: 404 });
  };

  return {
    handlers,
    routes,
    getSession,
    signOut,
    handleRequest
  };
}
