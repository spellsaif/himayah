import type { AuthPlugin, AuthResult, PluginContext, RateLimitStore } from "@himayah/core";

export type { RateLimitStore };

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

export interface OTPPluginOptions {
  sendOTP: (identifier: string, token: string) => Promise<void>;
  otpLength?: number; // default 6
  expiresIn?: number; // default 5 minutes (300s)
  rateLimitStore?: RateLimitStore;
  rateLimitLimit?: number; // default 5
  rateLimitWindow?: number; // default 60 (1 minute)
}

function generateSecureOTP(length = 6): string {
  const digits = "0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let otp = "";
  for (let i = 0; i < bytes.length; i++) {
    otp += digits[bytes[i] % 10];
  }
  return otp;
}

export function otpPlugin(options: OTPPluginOptions): AuthPlugin {
  const {
    sendOTP,
    otpLength = 6,
    expiresIn = 300,
    rateLimitLimit = 5,
    rateLimitWindow = 60,
  } = options;

  return {
    name: "otp",
    init(ctx: PluginContext) {
      const rateLimitStore = options.rateLimitStore || ctx.rateLimitStore || new InMemoryRateLimitStore();
      const userAdapter = ctx.userAdapter;
      const verificationTokenAdapter = (ctx as any).userAdapter;
      const sessionStore = ctx.sessionStore;

      if (!userAdapter) {
        throw new Error("OTP plugin requires userAdapter to be configured.");
      }

      if (!verificationTokenAdapter || typeof verificationTokenAdapter.createVerificationToken !== "function") {
        throw new Error("OTP plugin requires a verificationTokenAdapter inside userAdapter context.");
      }

      // Check rate limit
      const checkRateLimit = async (identifier: string): Promise<boolean> => {
        const key = `otp:rate:${identifier}`;
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

      const send = async (input: { email?: string; phone?: string }): Promise<AuthResult<any>> => {
        try {
          const identifier = input.email || input.phone;
          if (!identifier) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email or phone is required" }
            };
          }

          const allowed = await checkRateLimit(identifier);
          if (!allowed) {
            return {
              ok: false,
              error: { code: "rate_limit_exceeded", message: "Too many requests. Please try again later." }
            };
          }

          const token = generateSecureOTP(otpLength);
          const expires = new Date(Date.now() + expiresIn * 1000);

          // Save token
          await verificationTokenAdapter.createVerificationToken({
            identifier,
            token,
            expires,
          });

          // Send OTP code
          await sendOTP(identifier, token);

          return {
            ok: true,
            data: { message: "OTP code sent successfully" }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "send_failed", message: err.message || "Failed to send OTP code" }
          };
        }
      };

      const verify = async (
        input: { email?: string; phone?: string; token: string }
      ): Promise<AuthResult<any>> => {
        try {
          const identifier = input.email || input.phone;
          if (!identifier || !input.token) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Identifier and token are required" }
            };
          }

          // Verify token
          const record = await verificationTokenAdapter.findVerificationToken(identifier, input.token);
          if (!record) {
            return {
              ok: false,
              error: { code: "invalid_token", message: "Invalid or expired OTP code" }
            };
          }

          if (new Date() > record.expires) {
            await verificationTokenAdapter.deleteVerificationToken(identifier, input.token).catch(() => {});
            return {
              ok: false,
              error: { code: "invalid_token", message: "Invalid or expired OTP code" }
            };
          }

          // Delete token after successful verification
          await verificationTokenAdapter.deleteVerificationToken(identifier, input.token).catch(() => {});

          // Find or create user if identifier is an email.
          // Note: for phone, users can also be resolved or created, but let's default to standard email.
          // If identifier is not an email but has @, treat as email. Otherwise, treat as phone.
          let email = identifier.includes("@") ? identifier : null;
          let user = email ? await userAdapter.findUserByEmail(email) : null;

          if (email && !user) {
            user = await userAdapter.createUser({
              email,
              name: null,
              emailVerified: new Date(),
            });
          } else if (user && email && !user.emailVerified) {
            await userAdapter.updateUser(user.id, { emailVerified: new Date() }).catch(() => {});
          }

          // If no user found or created (e.g. phone-only and not supported/created yet), return error or mock a user.
          // For simplicity, let's create a user with email identifier, or throw error if phone is used and user doesn't exist.
          if (!user) {
            return {
              ok: false,
              error: { code: "user_not_found", message: "User not found for this identifier" }
            };
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
              const result = await send(body);
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
              const body = await req.json();
              const result = await verify(body);
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
          }
        }
      };
    }
  };
}
