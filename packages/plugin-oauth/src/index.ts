import type { AuthPlugin, AuthResult, PluginContext } from "@himayah/core";
import { parseCookies, serializeCookie } from "@himayah/session";

export interface OAuthProvider {
  id: string;
  name: string;
  type: "oauth2" | "oidc";
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  scopes: string[];
  mapProfile: (profile: any) => { email: string; name?: string | null; image?: string | null };
}

export interface OAuthPluginOptions {
  providers: OAuthProvider[];
  successRedirect?: string;
  failureRedirect?: string;
  callbacks?: {
    signIn?: (user: any, account: any, profile: any) => Promise<boolean>;
  };
}

// Helpers for PKCE and random generation
function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return str;
}

async function sha256Base64Url(str: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(str));
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Simple base64url decode helper for JWT payload decoding
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const bin = atob(base64);
    let str = "";
    for (let i = 0; i < bin.length; i++) {
      str += String.fromCharCode(bin.charCodeAt(i));
    }
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
}

export function oauthPlugin(options: OAuthPluginOptions): AuthPlugin {
  const { providers, successRedirect = "/", failureRedirect = "/login", callbacks } = options;

  return {
    name: "oauth",
    init(ctx: PluginContext) {
      const userAdapter = ctx.userAdapter;
      const oauthAdapter = ctx.oauthAdapter;
      const sessionStore = ctx.sessionStore;
      const cookieName = ctx.cookieName || "himayah.sid";
      const cookieOptions = ctx.cookieOptions || { maxAge: 30 * 24 * 60 * 60, path: "/" };

      if (!userAdapter || !oauthAdapter) {
        throw new Error("OAuth plugin requires userAdapter and oauthAdapter to be configured.");
      }

      // Route parameter handlers
      const authorize = async (providerId: string, req: Request): Promise<any> => {
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
          return { status: 404, body: { ok: false, error: { code: "provider_not_found", message: "Provider not found" } } };
        }

        const state = randomString(16);
        const verifier = randomString(64);
        const challenge = await sha256Base64Url(verifier);

        const reqUrl = new URL(req.url);
        // Build dynamic callback URL matching the server routes setup
        const callbackUrl = `${reqUrl.origin}${reqUrl.pathname}/callback`;

        const authUrl = new URL(provider.authorizationEndpoint);
        authUrl.searchParams.set("client_id", provider.clientId);
        authUrl.searchParams.set("redirect_uri", callbackUrl);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", provider.scopes.join(" "));
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        // Write state & verifier into temporary secure cookies (valid for 10 minutes)
        const stateCookie = serializeCookie(`himayah.oauth.${providerId}.state`, state, {
          maxAge: 600,
          secure: reqUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          httpOnly: true
        });

        const verifierCookie = serializeCookie(`himayah.oauth.${providerId}.verifier`, verifier, {
          maxAge: 600,
          secure: reqUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          httpOnly: true
        });

        return new Response(null, {
          status: 302,
          headers: {
            "Location": authUrl.toString(),
            "Set-Cookie": `${stateCookie}, ${verifierCookie}`
          }
        });
      };

      const callback = async (providerId: string, req: Request): Promise<any> => {
        try {
          const reqUrl = new URL(req.url);
          const provider = providers.find((p) => p.id === providerId);
          if (!provider) {
            return new Response("Provider not found", { status: 404 });
          }

          const searchParams = reqUrl.searchParams;
          const code = searchParams.get("code");
          const state = searchParams.get("state");
          const error = searchParams.get("error");

          if (error) {
            return new Response(`OAuth Error: ${error}`, { status: 400 });
          }

          if (!code || !state) {
            return new Response("Missing code or state", { status: 400 });
          }

          // Verify state & retrieve verifier
          const cookies = parseCookies(req.headers.get("cookie"));
          const storedState = cookies[`himayah.oauth.${providerId}.state`];
          const storedVerifier = cookies[`himayah.oauth.${providerId}.verifier`];

          if (!storedState || storedState !== state || !storedVerifier) {
            return new Response("State mismatch or missing verifier cookie", { status: 400 });
          }

          // Build token request
          const callbackUrl = `${reqUrl.origin}${reqUrl.pathname}`;
          const tokenBody = new URLSearchParams({
            client_id: provider.clientId,
            client_secret: provider.clientSecret,
            grant_type: "authorization_code",
            code,
            code_verifier: storedVerifier,
            redirect_uri: callbackUrl
          });

          // Fetch token
          const tokenResponse = await fetch(provider.tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "application/json"
            },
            body: tokenBody.toString()
          });

          if (!tokenResponse.ok) {
            const errBody = await tokenResponse.text();
            return new Response(`Token exchange failed: ${errBody}`, { status: 500 });
          }

          const tokenData = await tokenResponse.json() as any;
          const accessToken = tokenData.access_token;
          const refreshToken = tokenData.refresh_token || null;
          const expiresAt = tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null;

          if (!accessToken) {
            return new Response("Token endpoint did not return access_token", { status: 500 });
          }

          // Retrieve profile
          let profile: any = null;
          if (provider.type === "oidc" && tokenData.id_token) {
            profile = decodeJwtPayload(tokenData.id_token);
          }

          if (!profile && provider.userinfoEndpoint) {
            // Retrieve from UserInfo endpoint
            const profileResponse = await fetch(provider.userinfoEndpoint, {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
              }
            });
            if (profileResponse.ok) {
              profile = await profileResponse.json();
            }
          }

          // If GitHub user info endpoint, email is sometimes null. Let's do secondary fetch if needed
          if (provider.id === "github" && profile && !profile.email && accessToken) {
            const emailResponse = await fetch("https://api.github.com/user/emails", {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "User-Agent": "himayah-auth"
              }
            });
            if (emailResponse.ok) {
              const emails = await emailResponse.json() as any[];
              const primaryEmail = emails.find((e) => e.primary) || emails[0];
              if (primaryEmail) {
                profile.email = primaryEmail.email;
              }
            }
          }

          if (!profile || !profile.email) {
            return new Response("Could not retrieve user email from OAuth profile", { status: 400 });
          }

          const mapped = provider.mapProfile(profile);
          if (!mapped.email) {
            return new Response("Mapped profile email is invalid", { status: 400 });
          }

          // Find or create user
          let user = await userAdapter.findUserByEmail(mapped.email);
          if (!user) {
            user = await userAdapter.createUser({
              email: mapped.email,
              name: mapped.name || null,
              emailVerified: new Date()
            });
          }

          // Find or create account linkage
          const providerAccountId = String(profile.id || profile.sub || profile.uid);
          let account = await oauthAdapter.findAccount(providerId, providerAccountId);
          if (!account) {
            account = await oauthAdapter.createAccount({
              userId: user.id,
              providerId,
              providerAccountId,
              accessToken,
              refreshToken,
              expiresAt
            });
          }

          // Run signIn lifecycle hook callback if provided
          if (callbacks?.signIn) {
            const authorized = await callbacks.signIn(user, account, profile);
            if (!authorized) {
              return new Response("User sign-in hook rejected authorization", { status: 403 });
            }
          }

          // Create session
          const sessionToken = await sessionStore.create({
            userId: user.id,
            user
          });

          // Clean up oauth state cookies and set session cookie
          const cookiesToDelete = [
            serializeCookie(`himayah.oauth.${providerId}.state`, "", { maxAge: 0, path: "/" }),
            serializeCookie(`himayah.oauth.${providerId}.verifier`, "", { maxAge: 0, path: "/" })
          ];

          const response = new Response(null, {
            status: 302,
            headers: {
              "Location": successRedirect
            }
          });

          for (const c of cookiesToDelete) {
            response.headers.append("Set-Cookie", c);
          }

          response.headers.append(
            "Set-Cookie",
            serializeCookie(cookieName, sessionToken, cookieOptions)
          );

          return response;
        } catch (err: any) {
          return new Response(`Callback error: ${err.message}`, { status: 500 });
        }
      };

      return {
        routes: {
          ":providerId": (req: Request, params: Record<string, string>) => authorize(params.providerId, req),
          ":providerId/callback": (req: Request, params: Record<string, string>) => callback(params.providerId, req)
        }
      };
    }
  };
}
