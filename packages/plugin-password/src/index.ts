import type { AuthPlugin, AuthResult } from "@himayah/core";

// Helper: base64url encode a Uint8Array
function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper: base64url decode to Uint8Array
function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

// Secure PBKDF2-SHA256 password hashing
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256"
    },
    passwordKey,
    256
  );

  const saltStr = uint8ArrayToBase64Url(salt);
  const hashStr = uint8ArrayToBase64Url(new Uint8Array(derivedBits));
  return `${saltStr}.${hashStr}`;
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const parts = hash.split(".");
  if (parts.length !== 2) return false;

  const salt = base64UrlToUint8Array(parts[0]);
  const originalHash = parts[1];

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256"
    },
    passwordKey,
    256
  );

  const currentHash = uint8ArrayToBase64Url(new Uint8Array(derivedBits));
  return currentHash === originalHash;
}

export interface PasswordPluginOptions {
  // Store where passwords are saved. Default: "password" property on User object, or a separate custom table callback.
  // To keep schema flexible, we let developers provide callbacks to store and fetch user credentials.
  // E.g. getPasswordHash(userId) -> string, setPasswordHash(userId, hash) -> void
  getPasswordHash: (userId: string) => Promise<string | null>;
  setPasswordHash: (userId: string, hash: string) => Promise<void>;
}

export function passwordPlugin(options: PasswordPluginOptions): AuthPlugin {
  const { getPasswordHash, setPasswordHash } = options;

  return {
    name: "password",
    init(ctx) {
      const userAdapter = ctx.userAdapter;
      const sessionStore = ctx.sessionStore;

      if (!userAdapter) {
        throw new Error("Password plugin requires a userAdapter to be configured.");
      }

      const signUp = async (input: { email: string; password?: string; name?: string }): Promise<AuthResult<any>> => {
        try {
          if (!input.email || !input.password) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email and password are required" }
            };
          }

          // Check if user already exists
          const existing = await userAdapter.findUserByEmail(input.email);
          if (existing) {
            return {
              ok: false,
              error: { code: "user_already_exists", message: "A user with this email already exists" }
            };
          }

          // Hash password
          const hashedPassword = await hashPassword(input.password);

          // Create user
          const user = await userAdapter.createUser({
            email: input.email,
            name: input.name || null,
            emailVerified: null
          });

          // Save credential hash
          await setPasswordHash(user.id, hashedPassword);

          return {
            ok: true,
            data: { user }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "signup_failed", message: err.message || "Failed to sign up" }
          };
        }
      };

      const signIn = async (input: { email: string; password?: string }): Promise<AuthResult<any>> => {
        try {
          if (!input.email || !input.password) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email and password are required" }
            };
          }

          const user = await userAdapter.findUserByEmail(input.email);
          if (!user) {
            return {
              ok: false,
              error: { code: "invalid_credentials", message: "Invalid email or password" }
            };
          }

          const storedHash = await getPasswordHash(user.id);
          if (!storedHash) {
            return {
              ok: false,
              error: { code: "invalid_credentials", message: "Invalid email or password" }
            };
          }

          const isPasswordValid = await verifyPassword(storedHash, input.password);
          if (!isPasswordValid) {
            return {
              ok: false,
              error: { code: "invalid_credentials", message: "Invalid email or password" }
            };
          }

          // Create session
          const sessionToken = await sessionStore.create({
            userId: user.id,
            user
          });

          return {
            ok: true,
            data: {
              user,
              sessionToken
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "signin_failed", message: err.message || "Failed to sign in" }
          };
        }
      };

      return {
        handlers: {
          signUp,
          signIn
        },
        routes: {
          "signUp": async (req) => {
            try {
              const body = await req.json();
              const result = await signUp(body);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid JSON body" } }
              };
            }
          },
          "signIn": async (req) => {
            try {
              const body = await req.json();
              const result = await signIn(body);
              return {
                status: result.ok ? 200 : 400,
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid JSON body" } }
              };
            }
          }
        }
      };
    }
  };
}
