import type { AuthPlugin, AuthResult, PluginContext } from "@himayah/core";
import { parseCookies, serializeCookie } from "@himayah/session";

export interface RateLimitStore {
  get(key: string): Promise<{ count: number; expiresAt: number } | null>;
  set(key: string, value: { count: number; expiresAt: number }): Promise<void>;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private cache = new Map<string, { count: number; expiresAt: number }>();

  async get(key: string) {
    const record = this.cache.get(key);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return record;
  }

  async set(key: string, value: { count: number; expiresAt: number }) {
    this.cache.set(key, value);
  }
}

export interface MagicLinkPluginOptions {
  sendVerificationToken: (email: string, token: string, url: string) => Promise<void>;
  expiresIn?: number; // expiry in seconds, default 15 minutes (900s)
  successRedirect?: string;
  rateLimitStore?: RateLimitStore;
  rateLimitLimit?: number; // max requests per window, default 5
  rateLimitWindow?: number; // window in seconds, default 60 (1 minute)
}

function generateSecureToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function magicLinkPlugin(options: MagicLinkPluginOptions): AuthPlugin {
  const {
    sendVerificationToken,
    expiresIn = 900,
    successRedirect = "/",
    rateLimitStore = new InMemoryRateLimitStore(),
    rateLimitLimit = 5,
    rateLimitWindow = 60,
  } = options;

  return {
    name: "magic-link",
    init(ctx: PluginContext) {
      const userAdapter = ctx.userAdapter;
      const verificationTokenAdapter = (ctx as any).userAdapter; // VerificationTokenAdapter typically merged with userAdapter
      const sessionStore = ctx.sessionStore;
      const cookieName = ctx.cookieName || "himayah.sid";
      const cookieOptions = ctx.cookieOptions || { maxAge: 30 * 24 * 60 * 60, path: "/" };

      if (!userAdapter) {
        throw new Error("Magic-link plugin requires userAdapter to be configured.");
      }

      if (!verificationTokenAdapter || typeof verificationTokenAdapter.createVerificationToken !== "function") {
        throw new Error("Magic-link plugin requires a verificationTokenAdapter inside userAdapter context.");
      }

      // Check rate limit
      const checkRateLimit = async (email: string): Promise<boolean> => {
        const key = `magic-link:rate:${email}`;
        const record = await rateLimitStore.get(key);
        const now = Date.now();

        if (!record) {
          await rateLimitStore.set(key, {
            count: 1,
            expiresAt: now + rateLimitWindow * 1000,
          });
          return true;
        }

        if (record.count >= rateLimitLimit) {
          return false;
        }

        await rateLimitStore.set(key, {
          count: record.count + 1,
          expiresAt: record.expiresAt,
        });
        return true;
      };

      const send = async (input: { email: string }, req: Request): Promise<AuthResult<any>> => {
        try {
          if (!input.email) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email is required" }
            };
          }

          const allowed = await checkRateLimit(input.email);
          if (!allowed) {
            return {
              ok: false,
              error: { code: "rate_limit_exceeded", message: "Too many requests. Please try again later." }
            };
          }

          const token = generateSecureToken(32);
          const expires = new Date(Date.now() + expiresIn * 1000);

          // Save token
          await verificationTokenAdapter.createVerificationToken({
            identifier: input.email,
            token,
            expires,
          });

          // Build absolute magic link url
          const reqUrl = new URL(req.url);
          // If req.url path is prefix/magic-link/send, we can construct the verify path
          // Let's make it robust
          const basePath = reqUrl.pathname.substring(0, reqUrl.pathname.lastIndexOf("/"));
          const magicLinkUrl = `${reqUrl.origin}${basePath}/verify?token=${token}&email=${encodeURIComponent(input.email)}`;

          // Send token
          await sendVerificationToken(input.email, token, magicLinkUrl);

          return {
            ok: true,
            data: { message: "Magic link sent successfully" }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "send_failed", message: err.message || "Failed to send magic link" }
          };
        }
      };

      const verify = async (
        req: Request,
        input: { email: string; token: string }
      ): Promise<AuthResult<any>> => {
        try {
          if (!input.email || !input.token) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email and token are required" }
            };
          }

          // Verify token
          const record = await verificationTokenAdapter.findVerificationToken(input.email, input.token);
          if (!record) {
            return {
              ok: false,
              error: { code: "invalid_token", message: "Invalid or expired verification token" }
            };
          }

          if (new Date() > record.expires) {
            await verificationTokenAdapter.deleteVerificationToken(input.email, input.token).catch(() => {});
            return {
              ok: false,
              error: { code: "invalid_token", message: "Invalid or expired verification token" }
            };
          }

          // Delete token after successful verification (one-time use)
          await verificationTokenAdapter.deleteVerificationToken(input.email, input.token).catch(() => {});

          // Find or create user
          let user = await userAdapter.findUserByEmail(input.email);
          if (!user) {
            user = await userAdapter.createUser({
              email: input.email,
              name: null,
              emailVerified: new Date(),
            });
          } else if (!user.emailVerified) {
            await userAdapter.updateUser(user.id, { emailVerified: new Date() }).catch(() => {});
          }

          // Create session
          const sessionToken = await sessionStore.create({
            userId: user.id,
            user,
          });

          return {
            ok: true,
            data: {
              user,
              sessionToken,
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "verification_failed", message: err.message || "Verification failed" }
          };
        }
      };

      return {
        handlers: {
          send,
          verify,
        },
        routes: {
          "send": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await send(body, req);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "verify": async (req: Request) => {
            try {
              const reqUrl = new URL(req.url);
              const token = reqUrl.searchParams.get("token");
              const email = reqUrl.searchParams.get("email");

              if (req.method === "GET") {
                if (!token || !email) {
                  return new Response("Missing token or email", { status: 400 });
                }
                const result = await verify(req, { email, token });
                if (!result.ok) {
                  return new Response(result.error.message, { status: 400 });
                }

                // Redirect on GET success
                const response = new Response(null, {
                  status: 302,
                  headers: { "Location": successRedirect }
                });
                response.headers.append(
                  "Set-Cookie",
                  serializeCookie(cookieName, result.data.sessionToken, cookieOptions)
                );
                return response;
              } else {
                // POST verify
                const body = await req.json();
                const result = await verify(req, body);
                return {
                  status: result.ok ? 200 : 400,
                  body: result
                };
              }
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          }
        }
      };
    }
  };
}
