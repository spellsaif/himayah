# Himayah — Lightweight TypeScript Authentication Library

> **هيمية** (himayah) — Arabic for "protection"

Himayah is a modular, runtime-agnostic, zero-framework-dependency authentication engine for TypeScript. It relies on standard Web standard Request/Response schemas, executes cryptographically secure JWE-encrypted sessions by default, returns explicit `AuthResult` unions instead of throwing exceptions, and infers client SDK signatures from your server configuration.

---

## Key Principles

1. **Plain Web standard Request/Response**: Core runs on standard `Request` inputs and returns `Response` or JSON objects. Fits Next.js, Hono, Remix, SvelteKit, Deno, and Bun.
2. **Encrypted JWE by default**: Employs AES-GCM direct A256GCM key derivation using native Web Crypto APIs to shield user payloads from client exposure.
3. **Double-Submit CSRF**: Built-in protection for all state-changing endpoints.
4. **Segmented Adapters**: You write user operations, session lookups, and account links separately. If you don't use database sessions or OAuth, you omit those tables and methods.
5. **No-Throw Error Unions**: Methods return `{ ok: true, data } | { ok: false, error }` enabling type-narrowing error resolution.

---

## Monorepo Layout

### Core & Middleware
* **[@himayah/core](packages/core)**: Composition engine, router, and built-in CSRF validation.
* **[@himayah/session](packages/session)**: Encrypted sessions using JWE A256GCM.
* **[@himayah/adapter](packages/adapter)**: Base interfaces for database adapters.
* **[@himayah/client](packages/client)**: Type-safe proxy API client.
* **[@himayah/middleware-hono](packages/middleware-hono)**: Route handling and session injector for Hono.
* **[@himayah/middleware-express](packages/middleware-express)**: Route handling and session injector for Express.

### Authentication Plugins
* **[@himayah/plugin-password](packages/plugin-password)**: PBKDF2 secure password signup/signin.
* **[@himayah/plugin-oauth](packages/plugin-oauth)**: State/PKCE protection with built-in configurations (Google, GitHub, Apple).
* **[@himayah/plugin-passkey](packages/plugin-passkey)**: Ceremonies using `@simplewebauthn/server`.
* **[@himayah/plugin-magic-link](packages/plugin-magic-link)**: Token-auth with database token storage and rate-limiting.
* **[@himayah/plugin-otp](packages/plugin-otp)**: OTP generation, validation, and rate-limiting.
* **[@himayah/plugin-organization](packages/plugin-organization)**: Multi-tenant teams, role management, invitation links, and session-scoped organization switching.

### Database Adapters
* **[@himayah/adapter-drizzle](packages/adapter-drizzle)**: Segmented drizzle schema mapper.
* **[@himayah/adapter-prisma](packages/adapter-prisma)**: Prisma client query adapter.
* **[@himayah/adapter-kysely](packages/adapter-kysely)**: Kysely query adapter.

---

## Documentation

- **[Architecture & Security Design](docs/architecture.md)**: Deep dive into package layout, security principles (JWE, CSRF, zero dependencies), and design tradeoffs.

---

## Interactive Examples

- **[Hono & Drizzle Example](examples/hono-drizzle)**: Complete Hono application using Drizzle SQLite database and interactive dashboard HTML page.
- **[Express & Prisma Example](examples/express-prisma)**: Express application using Prisma SQLite client database and interactive dashboard HTML page.

---

## Server Quickstart

Initialize your auth engine in a file like `auth.ts`:

```ts
import { createAuth } from "@himayah/core";
import { createJWTSessionStore } from "@himayah/session";
import { passwordPlugin } from "@himayah/plugin-password";
import { drizzleAdapter } from "@himayah/adapter-drizzle";
import { db, users, credentials } from "./db";

export const auth = createAuth({
  adapter: drizzleAdapter(db, { users }),
  sessionStore: createJWTSessionStore({
    secret: process.env.AUTH_SECRET!,
    maxAge: 3600
  }),
  plugins: [
    passwordPlugin({
      getPasswordHash: async (userId) => {
        const cred = await db.query.credentials.findFirst({ where: eq(credentials.userId, userId) });
        return cred?.hash || null;
      },
      setPasswordHash: async (userId, hash) => {
        await db.insert(credentials).values({ userId, hash });
      }
    })
  ]
});
```

### Exposing HTTP Endpoints

Map it to your framework route handler (e.g. standard catch-all route under `/api/auth/*`):

#### Hono
```ts
app.use("*", honoMiddleware(auth));
```

#### Express
```ts
app.use(express.json());
app.use(expressMiddleware(auth));
```

---

## Type-Safe Client SDK

```ts
import { createClient } from "@himayah/client";
import type { auth } from "./auth"; // Type imported from server configuration

const client = createClient<typeof auth>({
  baseUrl: "/api/auth"
});

// Autocomplete and typechecking works 1:1 matching server plugins
const result = await client.password.signIn({
  email: "user@example.com",
  password: "password123"
});

if (!result.ok) {
  console.error("Sign in failed:", result.error.message);
} else {
  console.log("Welcome!", result.data.user);
}
```
