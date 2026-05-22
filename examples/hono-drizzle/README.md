# Hono & Drizzle ORM Example

A production-grade, interactive application demonstrating how to build and integrate the **Himayah** authentication library using **Hono** framework and **Drizzle ORM** (SQLite).

## Features

- **Email & Password**: Secure sign-up/sign-in flows.
- **Magic Links & One-Time Passwords (OTPs)**: Token-based passwordless authentication.
- **Double-Submit CSRF Protection**: Enabled out-of-the-box using core middlewares.
- **Dynamic Organization Management**: Multi-tenancy, invitation dispatching, role mapping, and real-time active workspace context switching.
- **Mock Developer Mailbox**: Live visual inbox widget capturing Magic Links, OTP codes, and Org Invitations without third-party email transports.
- **Decrypted Session Explorer**: Live JWE session state explorer with syntax highlighting.

## Getting Started

1. **Install Dependencies**:
   Ensure you run `pnpm install` in the monorepo root.

2. **Run Example Server**:
   ```bash
   pnpm --filter example-hono-drizzle dev
   ```

3. **Visit in Browser**:
   Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.
