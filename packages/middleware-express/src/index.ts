import type { Request as ExpRequest, Response as ExpResponse, NextFunction, RequestHandler } from "express";
import type { SessionData, AuthResult } from "@himayah/core";

export interface ExpressMiddlewareOptions {
  prefix?: string;
}

// Convert Express request to standard Web API Request
export function expressToWebRequest(req: ExpRequest): Request {
  const protocol = req.protocol;
  const host = req.get("host") || "localhost";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else if (value) {
      headers.set(key, value);
    }
  }

  const method = req.method;
  const hasBody = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  let body: any = undefined;

  if (hasBody && req.body) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  return new Request(url, {
    method,
    headers,
    body,
  });
}

// Write Web API Response back to Express Response
export async function sendWebResponse(webRes: Response, res: ExpResponse): Promise<void> {
  res.status(webRes.status);

  // Read header keys securely
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      res.append("Set-Cookie", value);
    } else {
      res.set(key, value);
    }
  });

  const text = await webRes.text();
  res.send(text);
}

export function expressMiddleware(
  auth: {
    handleRequest: (req: Request, options?: { prefix?: string }) => Promise<Response>;
    getSession: (req: Request) => Promise<AuthResult<SessionData>>;
  },
  options?: ExpressMiddlewareOptions
): RequestHandler {
  const prefix = options?.prefix || "/api/auth";

  return async (req: ExpRequest, res: ExpResponse, next: NextFunction): Promise<void> => {
    try {
      const url = req.originalUrl.split("?")[0];

      // Route requests matching the auth prefix
      if (url.startsWith(prefix)) {
        const webReq = expressToWebRequest(req);
        const webRes = await auth.handleRequest(webReq, { prefix });
        await sendWebResponse(webRes, res);
        return;
      }

      // Populate req.auth with session context
      const webReq = expressToWebRequest(req);
      const sessionResult = await auth.getSession(webReq);
      (req as any).auth = sessionResult;

      next();
    } catch (err) {
      next(err);
    }
  };
}
