import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import type { SessionData, AuthResult } from "@himayah/core";

export interface NextHandlerOptions {
  prefix?: string;
}

/**
 * Creates route handlers for Next.js App Router (app/api/auth/[[...route]]/route.ts).
 * @param auth The initialized Himayah auth instance.
 * @param options Handler options (such as custom routing prefix).
 */
export function createNextHandler(
  auth: {
    handleRequest: (req: Request, options?: { prefix?: string }) => Promise<Response>;
  },
  options?: NextHandlerOptions
) {
  const prefix = options?.prefix || "/api/auth";

  const handler = async (req: Request) => {
    return auth.handleRequest(req, { prefix });
  };

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    DELETE: handler,
    PATCH: handler,
    OPTIONS: handler,
  };
}

/**
 * Retrieves the current session in Next.js Server Components, Server Actions, or API Routes.
 * Bypasses the need to manually build standard Request objects from Next.js headers.
 * 
 * @param auth The initialized Himayah auth instance.
 */
export async function getServerSession(
  auth: {
    getSession: (req: Request) => Promise<AuthResult<SessionData>>;
  }
): Promise<AuthResult<SessionData>> {
  const reqHeaders = new Headers();

  // 1. Copy headers from Next.js request context
  try {
    const headersList = nextHeaders();
    const resolvedHeaders =
      headersList && typeof (headersList as any).then === "function"
        ? await (headersList as any)
        : headersList;

    resolvedHeaders.forEach((value: string, key: string) => {
      reqHeaders.set(key, value);
    });
  } catch (e) {
    // Gracefully handle static execution contexts
  }

  // 2. Synthesize cookie string from Next.js cookie store
  try {
    const cookieStore = nextCookies();
    const resolvedCookies =
      cookieStore && typeof (cookieStore as any).then === "function"
        ? await (cookieStore as any)
        : cookieStore;

    const cookieString = resolvedCookies
      .getAll()
      .map((c: any) => `${c.name}=${c.value}`)
      .join("; ");

    if (cookieString) {
      reqHeaders.set("cookie", cookieString);
    }
  } catch (e) {
    // Gracefully handle static execution contexts
  }

  // 3. Extract host and protocol to formulate request URL
  const host = reqHeaders.get("host") || "localhost";
  const proto = reqHeaders.get("x-forwarded-proto") || "http";
  const url = `${proto}://${host}/`;

  // 4. Construct a standard Web API Request
  const webRequest = new Request(url, {
    method: "GET",
    headers: reqHeaders,
  });

  // 5. Query the active session from Himayah core
  return auth.getSession(webRequest);
}
