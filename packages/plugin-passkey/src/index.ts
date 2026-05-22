import type { AuthPlugin, AuthResult, PluginContext } from "@himayah/core";
import { parseCookies, serializeCookie } from "@himayah/session";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

export interface Passkey {
  id: string;
  publicKey: string; // Base64url encoded Uint8Array
  userId: string;
  counter: number;
  transports?: string[];
}

export interface PasskeyPluginOptions {
  rpName: string;
  rpID: string;
  origin: string | ((req: Request) => string);
  getCredential: (id: string) => Promise<Passkey | null>;
  saveCredential: (userId: string, credential: {
    id: string;
    publicKey: string;
    counter: number;
    transports?: string[];
  }) => Promise<void>;
  updateCredentialCounter?: (id: string, counter: number) => Promise<void>;
  getCredentialsForUser?: (userId: string) => Promise<Passkey[]>;
}

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

export function passkeyPlugin(options: PasskeyPluginOptions): AuthPlugin {
  const {
    rpName,
    rpID,
    origin,
    getCredential,
    saveCredential,
    updateCredentialCounter,
    getCredentialsForUser,
  } = options;

  return {
    name: "passkey",
    init(ctx: PluginContext) {
      const userAdapter = ctx.userAdapter;
      const sessionStore = ctx.sessionStore;
      const cookieName = ctx.cookieName || "himayah.sid";
      const cookieOptions = ctx.cookieOptions || { maxAge: 30 * 24 * 60 * 60, path: "/" };

      if (!userAdapter) {
        throw new Error("Passkey plugin requires a userAdapter to be configured.");
      }

      const getOrigin = (req: Request): string => {
        if (typeof origin === "function") {
          return origin(req);
        }
        return origin;
      };

      const signUpOptions = async (input: { email: string; name?: string }): Promise<AuthResult<any>> => {
        try {
          if (!input.email) {
            return {
              ok: false,
              error: { code: "invalid_input", message: "Email is required" }
            };
          }

          let user = await userAdapter.findUserByEmail(input.email);
          let userId = user ? user.id : crypto.randomUUID();
          let userName = input.email;
          let userDisplayName = input.name || user?.name || input.email;

          // Fetch existing credentials to exclude
          let excludeCredentials: any[] = [];
          if (user && getCredentialsForUser) {
            const credentials = await getCredentialsForUser(user.id);
            excludeCredentials = credentials.map((cred) => ({
              id: cred.id,
              type: "public-key" as const,
              transports: cred.transports as any[],
            }));
          }

          const registrationOptions = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: userId,
            userName,
            userDisplayName,
            attestationType: "none",
            excludeCredentials,
            authenticatorSelection: {
              residentKey: "preferred",
              userVerification: "preferred",
            },
          });

          return {
            ok: true,
            data: {
              options: registrationOptions,
              // Return metadata so the route handler can set the challenge cookie
              challenge: registrationOptions.challenge,
              tempUserId: user ? undefined : userId, // if user is new, pass back temp id
              email: input.email,
              name: userDisplayName
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "options_failed", message: err.message || "Failed to generate options" }
          };
        }
      };

      const signUpVerify = async (
        req: Request,
        input: { response: any; email: string; name?: string; tempUserId?: string }
      ): Promise<AuthResult<any>> => {
        try {
          const cookies = parseCookies(req.headers.get("cookie"));
          const expectedChallenge = cookies["himayah.passkey.challenge"];

          if (!expectedChallenge) {
            return {
              ok: false,
              error: { code: "challenge_expired", message: "Registration challenge expired or missing" }
            };
          }

          const verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge,
            expectedOrigin: getOrigin(req),
            expectedRPID: rpID,
          });

          if (!verification.verified || !verification.registrationInfo) {
            return {
              ok: false,
              error: { code: "verification_failed", message: "Passkey verification failed" }
            };
          }

          const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

          // Find or create user
          let user = await userAdapter.findUserByEmail(input.email);
          if (!user) {
            user = await userAdapter.createUser({
              id: input.tempUserId,
              email: input.email,
              name: input.name || null,
              emailVerified: new Date(),
            });
          }

          const base64PublicKey = uint8ArrayToBase64Url(credentialPublicKey);
          const base64CredentialId = uint8ArrayToBase64Url(credentialID);

          await saveCredential(user.id, {
            id: base64CredentialId,
            publicKey: base64PublicKey,
            counter,
            transports: input.response.transports,
          });

          // Authenticate user immediately upon sign up
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
            error: { code: "verification_error", message: err.message || "Failed to verify passkey" }
          };
        }
      };

      const signInOptions = async (input?: { email?: string }): Promise<AuthResult<any>> => {
        try {
          let allowCredentials: any[] = [];
          if (input?.email && getCredentialsForUser) {
            const user = await userAdapter.findUserByEmail(input.email);
            if (user) {
              const credentials = await getCredentialsForUser(user.id);
              allowCredentials = credentials.map((cred) => ({
                id: cred.id,
                type: "public-key" as const,
                transports: cred.transports as any[],
              }));
            }
          }

          const authenticationOptions = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: "preferred",
          });

          return {
            ok: true,
            data: {
              options: authenticationOptions,
              challenge: authenticationOptions.challenge,
            }
          };
        } catch (err: any) {
          return {
            ok: false,
            error: { code: "options_failed", message: err.message || "Failed to generate options" }
          };
        }
      };

      const signInVerify = async (
        req: Request,
        input: { response: any }
      ): Promise<AuthResult<any>> => {
        try {
          const cookies = parseCookies(req.headers.get("cookie"));
          const expectedChallenge = cookies["himayah.passkey.challenge"];

          if (!expectedChallenge) {
            return {
              ok: false,
              error: { code: "challenge_expired", message: "Authentication challenge expired or missing" }
            };
          }

          // Fetch the stored credential
          const credential = await getCredential(input.response.id);
          if (!credential) {
            return {
              ok: false,
              error: { code: "credential_not_found", message: "Passkey not recognized" }
            };
          }

          const user = await userAdapter.findUser(credential.userId);
          if (!user) {
            return {
              ok: false,
              error: { code: "user_not_found", message: "User associated with passkey not found" }
            };
          }

          const verification = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge,
            expectedOrigin: getOrigin(req),
            expectedRPID: rpID,
            authenticator: {
              credentialID: base64UrlToUint8Array(credential.id),
              credentialPublicKey: base64UrlToUint8Array(credential.publicKey),
              counter: credential.counter,
              transports: credential.transports as any[],
            },
          });

          if (!verification.verified || !verification.authenticationInfo) {
            return {
              ok: false,
              error: { code: "verification_failed", message: "Passkey verification failed" }
            };
          }

          const { newCounter } = verification.authenticationInfo;

          if (updateCredentialCounter) {
            await updateCredentialCounter(credential.id, newCounter);
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
            error: { code: "verification_error", message: err.message || "Failed to verify passkey" }
          };
        }
      };

      // Wrap in routes
      const serializeChallengeCookie = (req: Request, challenge: string) => {
        const reqUrl = new URL(req.url);
        return serializeCookie("himayah.passkey.challenge", challenge, {
          maxAge: 300, // 5 minutes
          secure: reqUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          httpOnly: true,
        });
      };

      const clearChallengeCookie = () => {
        return serializeCookie("himayah.passkey.challenge", "", {
          maxAge: 0,
          path: "/",
        });
      };

      return {
        handlers: {
          signUpOptions,
          signUpVerify,
          signInOptions,
          signInVerify,
        },
        routes: {
          "register/options": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await signUpOptions(body);
              if (!result.ok) {
                return { status: 400, body: result };
              }
              const challengeCookie = serializeChallengeCookie(req, result.data.challenge);
              return {
                status: 200,
                cookies: [{ name: "himayah.passkey.challenge", value: result.data.challenge, options: { maxAge: 300, httpOnly: true, path: "/" } }],
                body: {
                  ok: true,
                  data: {
                    options: result.data.options,
                    tempUserId: result.data.tempUserId,
                    email: result.data.email,
                    name: result.data.name,
                  }
                }
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "register/verify": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await signUpVerify(req, body);
              if (!result.ok) {
                return { status: 400, body: result };
              }
              return {
                status: 200,
                cookies: [{ name: "himayah.passkey.challenge", value: "", options: { maxAge: 0, path: "/" } }],
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "login/options": async (req: Request) => {
            try {
              let body = {};
              try {
                body = await req.clone().json();
              } catch (_) {}
              const result = await signInOptions(body);
              if (!result.ok) {
                return { status: 400, body: result };
              }
              return {
                status: 200,
                cookies: [{ name: "himayah.passkey.challenge", value: result.data.challenge, options: { maxAge: 300, httpOnly: true, path: "/" } }],
                body: {
                  ok: true,
                  data: {
                    options: result.data.options,
                  }
                }
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
          "login/verify": async (req: Request) => {
            try {
              const body = await req.json();
              const result = await signInVerify(req, body);
              if (!result.ok) {
                return { status: 400, body: result };
              }
              return {
                status: 200,
                cookies: [{ name: "himayah.passkey.challenge", value: "", options: { maxAge: 0, path: "/" } }],
                body: result
              };
            } catch (err: any) {
              return {
                status: 400,
                body: { ok: false, error: { code: "bad_request", message: err.message || "Invalid input" } }
              };
            }
          },
        }
      };
    }
  };
}
