# Himayah Core Architecture & Security Design

> **هيمية** (himayah) — Arabic for *protection*

<p align="center">
  <img src="../assets/logo.png" alt="Himayah Logo" width="160" style="border-radius: 16px; margin-bottom: 1.5rem;" />
</p>

Himayah is a lightweight, type-safe, runtime-agnostic, and schema-first authentication library designed for TypeScript applications. It strictly adheres to modern security standards while offering a decoupled, developer-first composition API.

This document provides a deep, visual explanation of the architectural blocks and data flows inside Himayah.

---

## System Topology & Package Layout

Himayah is structured as a monorepo containing decoupled, single-purpose packages under the `@himayah/` namespace. This design allows developers to only install what they use, keeping runtime sizes minimal and preventing dependency creep.

```mermaid
graph TD
    subgraph Core ["Core Cryptographic Hub"]
        CoreLib["@himayah/core"]
        Session["@himayah/session"]
        Adapter["@himayah/adapter"]
        CoreLib --> Session
        CoreLib --> Adapter
    end

    subgraph Plugins ["Modular Feature Plugins"]
        Pw["@himayah/plugin-password"]
        Oauth["@himayah/plugin-oauth"]
        Magic["@himayah/plugin-magic-link"]
        Otp["@himayah/plugin-otp"]
        Passkey["@himayah/plugin-passkey"]
        Org["@himayah/plugin-organization"]
        
        Pw --> Adapter
        Oauth --> Adapter
        Magic --> Adapter
        Otp --> Adapter
        Passkey --> Adapter
        Org --> Adapter
    end

    subgraph Middlewares ["Runtime Framework Adapters"]
        Hono["@himayah/middleware-hono"]
        Express["@himayah/middleware-express"]
        Next["@himayah/next"]
        
        Hono --> CoreLib
        Express --> CoreLib
        Next --> CoreLib
    end

    subgraph DB ["Concrete Database Adapters"]
        Drizzle["@himayah/adapter-drizzle"]
        Prisma["@himayah/adapter-prisma"]
        Kysely["@himayah/adapter-kysely"]
        
        Drizzle --> Adapter
        Prisma --> Adapter
        Kysely --> Adapter
    end

    style CoreLib fill:#111,stroke:#d9a752,stroke-width:2px,color:#fff
    style Session fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style Adapter fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    
    style Pw fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    style Oauth fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    style Magic fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    style Otp fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    style Passkey fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    style Org fill:#15151b,stroke:#a1a1aa,stroke-width:1px,color:#d1d1d6
    
    style Hono fill:#0e1713,stroke:#10b981,stroke-width:1px,color:#a7f3d0
    style Express fill:#1c1917,stroke:#a8a29e,stroke-width:1px,color:#f5f5f4
    style Next fill:#0a0a0a,stroke:#e2e8f0,stroke-width:1px,color:#f8fafc
    
    style Drizzle fill:#181008,stroke:#f59e0b,stroke-width:1px,color:#fef3c7
    style Prisma fill:#0f172a,stroke:#3b82f6,stroke-width:1px,color:#dbeafe
    style Kysely fill:#061512,stroke:#0d9488,stroke-width:1px,color:#ccfbf1
```

---

## Request Execution Pipeline

Every incoming HTTP request flows through a deterministic pipeline:

```mermaid
graph TD
    A["Incoming HTTP Request"] --> B{"Is mutating method?<br>(POST/PUT/DELETE)"}
    B -- Yes --> C["CSRF Verification<br>(timingSafeEqual Cookie == Header)"]
    B -- No --> D["Cookie Parsing & Session Loading"]
    C --> D
    D --> E["Route Matching (Hono-style Router)"]
    E --> F["Plugin Handler Execution (Password/OAuth/OTP...)"]
    F --> G["Session State Update"]
    G --> H["Standard Web Response (Set-Cookie)"]
    
    style A fill:#0B0B0F,stroke:#d9a752,stroke-width:2px,color:#fff
    style C fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style F fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style H fill:#0B0B0F,stroke:#d9a752,stroke-width:2px,color:#fff
```

### The `handleRequest` Function

`auth.handleRequest(req: Request): Promise<Response>` is the single entry point for all auth routes. It:

1. Builds an internal context from the incoming `Request`
2. Verifies CSRF token for mutating methods (`POST`, `PUT`, `DELETE`, `PATCH`)
3. Routes to the matching plugin endpoint handler
4. Returns a standard `Response`

---

## Session Design

### Stateless JWE Sessions (default)

By default, Himayah uses **stateless sessions** via JSON Web Encryption (JWE). The session pipeline has two distinct steps:

```mermaid
graph LR
    subgraph "Key Derivation Pipeline"
        A["AUTH_SECRET String"] --> B{"Is exactly 32-bytes?"}
        B -- No --> C["PBKDF2-SHA256 Stretching<br>(100,000 Iterations)"]
        C --> D["Derived Cryptographic Key"]
        B -- Yes --> E["Direct Web Crypto Import<br>(Bypasses PBKDF2)"]
        E --> D
    end

    subgraph "Session Encryption"
        F["Session Payload<br>{ userId, activeOrgId, exp }"] --> G["AES-256-GCM Encryption"]
        D --> G
        G --> H["Stateless JWE Token<br>(HttpOnly Cookie)"]
    end

    style A fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style D fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style H fill:#0B0B0F,stroke:#d9a752,stroke-width:2px,color:#fff
```

- **PBKDF2** stretches your human-readable `AUTH_SECRET` into a cryptographically uniform 32-byte key safely, with 100,000 iterations making brute-force attacks computationally impractical.
- **AES-256-GCM** is the symmetric cipher that encrypts the session payload. It is authenticated (guarantees payload integrity) and provides optimal encryption performance.

### Stateful Database Sessions (for revocation)

When session revocation is required (e.g., immediate forced sign-out or token banning), you can opt into a database-backed session store.

Below is the interaction sequence comparing stateless checks with stateful database lookups:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant Core as Himayah Core Engine
    participant DB as Database Session Table

    User->>Core: Request with himayah.sid cookie
    Note over Core: JWE decrypted & validated (signature, expiry)
    alt Session is Stateless
        Core-->>User: Authorized (200 OK)
    else Session is Stateful
        Core->>DB: Query session ID in database
        alt Session exists and is active
            DB-->>Core: Active Session Record
            Core-->>User: Authorized (200 OK)
        else Session is revoked or deleted
            DB-->>Core: Not Found / Expired
            Note over Core: Clear cookie from headers
            Core-->>User: Unauthorized (401 Error)
        end
    end
```

---

## Double-Submit CSRF Protection

Mutating endpoints are guarded by **double-submit cookie CSRF validation** comparing the request header token and custom cookie token:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (Browser / SDK)
    participant Core as Himayah Core Engine
    participant Cookies as Browser Cookie Jar

    Note over Client, Core: Safe Request (e.g. GET /api/auth/session)
    Client->>Core: GET request
    Core->>Cookies: Set-Cookie: himayah.csrf=<token> (HttpOnly: false)
    Core-->>Client: Return Session JSON / Status

    Note over Client, Core: State-Mutating Request (e.g. POST /api/auth/password/sign-in)
    Client->>Cookies: Read himayah.csrf cookie value
    Client->>Core: POST request with X-CSRF-Token: <token> & Cookie: himayah.csrf=<token>
    Note over Core: timingSafeEqual(Header Token, Cookie Token)
    alt Tokens Match
        Core->>Core: Process Endpoint Handler
        Core-->>Client: HTTP 200 OK with session
    else Tokens Mismatch
        Core-->>Client: HTTP 403 Forbidden (CSRF validation failed)
    end
```

---

## Adapter Segment Architecture

Himayah adapters are segmented to respect the "You own your schema" tenet. You map only the tables you need directly to thin segment interfaces.

```mermaid
graph TD
    subgraph AppSchema ["Developer's Database Schema"]
        U["users table"]
        S["sessions table"]
        A["accounts table"]
        V["verification_tokens table"]
        R["rate_limits table"]
        O["orgs & members tables"]
    end

    subgraph AdaptSegs ["Decoupled Adapter Interfaces"]
        UA["UserAdapter"]
        SA["SessionAdapter"]
        AA["AccountAdapter"]
        VA["VerificationTokenAdapter"]
        RLA["RateLimitAdapter"]
        OA["OrgAdapter"]
    end

    subgraph CoreEng ["Himayah Core & Plugins"]
        Core["createAuth() Context"]
        PassPlugin["Password Plugin"]
        OauthPlugin["OAuth Plugin"]
        MagicPlugin["Magic Link Plugin"]
        OrgPlugin["Organization Plugin"]
    end

    U --> UA
    S --> SA
    A --> AA
    V --> VA
    R --> RLA
    O --> OA

    UA --> Core
    SA --> Core
    AA --> Core
    VA --> Core
    RLA --> Core
    OA --> Core

    Core --> PassPlugin
    Core --> OauthPlugin
    Core --> MagicPlugin
    Core --> OrgPlugin

    style Core fill:#111,stroke:#d9a752,stroke-width:2px,color:#fff
    style UA fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style SA fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style OA fill:#1e1b18,stroke:#d9a752,stroke-width:1px,color:#fff
    style U fill:#181008,stroke:#f59e0b,stroke-width:1px,color:#fef3c7
```
