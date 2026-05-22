import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

// Color helpers
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log(`\n${bold(cyan("=================================================="))}`);
  console.log(`${bold(cyan("     🛡️  Welcome to the Himayah Auth Initializer   "))}`);
  console.log(`${bold(cyan("=================================================="))}\n`);

  console.log("Let's configure your authentication system in under a minute.\n");

  // 1. Prompt Framework
  console.log(`${bold("1. Which Web Framework are you using?")}`);
  console.log("  [1] Next.js (App Router)");
  console.log("  [2] Hono");
  console.log("  [3] Express");
  console.log("  [4] SvelteKit");
  console.log("  [5] Remix / React Router");
  console.log("  [6] Astro");
  console.log("  [7] Nuxt 3");
  console.log("  [8] Elysia");
  const frameworkAnswer = await ask(cyan("Select option [1-8]: "));

  let framework = "nextjs";
  if (frameworkAnswer === "2") framework = "hono";
  else if (frameworkAnswer === "3") framework = "express";
  else if (frameworkAnswer === "4") framework = "sveltekit";
  else if (frameworkAnswer === "5") framework = "remix";
  else if (frameworkAnswer === "6") framework = "astro";
  else if (frameworkAnswer === "7") framework = "nuxt";
  else if (frameworkAnswer === "8") framework = "elysia";

  // 2. Prompt ORM
  console.log(`\n${bold("2. Which Database ORM/Query Builder are you using?")}`);
  console.log("  [1] Drizzle ORM (Recommended: Programmatic schemas enabled)");
  console.log("  [2] Prisma");
  console.log("  [3] Kysely");
  const ormAnswer = await ask(cyan("Select option [1-3]: "));

  let orm = "drizzle";
  if (ormAnswer === "2") orm = "prisma";
  else if (ormAnswer === "3") orm = "kysely";

  // 3. Prompt Database Engine
  console.log(`\n${bold("3. Which Database Engine are you using?")}`);
  console.log("  [1] PostgreSQL");
  console.log("  [2] SQLite");
  console.log("  [3] MySQL / PlanetScale");
  const dbAnswer = await ask(cyan("Select option [1-3]: "));

  let dbEngine = "postgres";
  if (dbAnswer === "2") dbEngine = "sqlite";
  else if (dbAnswer === "3") dbEngine = "mysql";

  // 4. Prompt Plugins
  console.log(`\n${bold("4. Which Auth Plugins do you want to enable? (Comma separated, e.g. 1,2)")}`);
  console.log("  [1] Password Credentials (Email/Password) - Enabled by default");
  console.log("  [2] OAuth (GitHub, Google, OIDC)");
  console.log("  [3] Magic Link (Passwordless)");
  console.log("  [4] One-Time Password (OTP)");
  console.log("  [5] WebAuthn Passkeys");
  console.log("  [6] Organizations (Multi-Tenant)");
  const pluginsAnswer = await ask(cyan("Select options [e.g. 2,3,6]: "));

  const enabledPlugins = new Set(["password"]);
  if (pluginsAnswer) {
    const choices = pluginsAnswer.split(",").map((c) => c.trim());
    if (choices.includes("2")) enabledPlugins.add("oauth");
    if (choices.includes("3")) enabledPlugins.add("magic-link");
    if (choices.includes("4")) enabledPlugins.add("otp");
    if (choices.includes("5")) enabledPlugins.add("passkey");
    if (choices.includes("6")) enabledPlugins.add("organization");
  }

  console.log(`\n${yellow("⚙️  Scaffolding configuration files...")}`);

  // Create target directories
  const targetDir = process.cwd();
  const libDir = path.join(targetDir, "lib");
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  // Generate lib/auth.ts
  const authCode = generateAuthConfig(framework, orm, dbEngine, enabledPlugins);
  fs.writeFileSync(path.join(libDir, "auth.ts"), authCode);
  console.log(`${green("  ✓ Created")} lib/auth.ts`);

  // Generate database schema files
  if (orm === "drizzle") {
    const schemaCode = generateDrizzleSchema(dbEngine, enabledPlugins);
    fs.writeFileSync(path.join(libDir, "schema.ts"), schemaCode);
    console.log(`${green("  ✓ Created")} lib/schema.ts`);
  } else if (orm === "prisma") {
    const schemaCode = generatePrismaSchema(dbEngine, enabledPlugins);
    const prismaDir = path.join(targetDir, "prisma");
    if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });
    fs.writeFileSync(path.join(prismaDir, "schema.prisma"), schemaCode);
    console.log(`${green("  ✓ Created")} prisma/schema.prisma`);
  }

  // Generate routing configurations
  generateRouteHandler(framework, targetDir);

  // Generate or append environment variables
  const envKeys = [
    `# Himayah Configuration`,
    `AUTH_SECRET="${generateRandomSecret()}"`,
    `NEXT_PUBLIC_APP_URL="http://localhost:3000"`,
  ];
  if (enabledPlugins.has("oauth")) {
    envKeys.push(`GITHUB_CLIENT_ID=""`, `GITHUB_CLIENT_SECRET=""`);
  }
  const envFile = path.join(targetDir, ".env");
  if (fs.existsSync(envFile)) {
    fs.appendFileSync(envFile, `\n${envKeys.join("\n")}\n`);
    console.log(`${green("  ✓ Appended")} keys to existing .env`);
  } else {
    fs.writeFileSync(envFile, `${envKeys.join("\n")}\n`);
    console.log(`${green("  ✓ Created")} new .env file`);
  }

  console.log(`\n${bold(green("🎉 Setup Complete successfully!"))}`);
  console.log(`\nTo get started, follow these quick steps:`);
  console.log(`  1. Install dependencies:`);
  console.log(`     ${bold(cyan(`pnpm add @himayah/core @himayah/session @himayah/client ${getNpmPackages(orm, framework, enabledPlugins)}`))}`);
  console.log(`  2. Setup your database schemas.`);
  console.log(`  3. Start your dev server and visit /api/auth/session to verify.\n`);

  rl.close();
}

function getNpmPackages(orm: string, framework: string, plugins: Set<string>): string {
  const pkgs: string[] = [];
  if (orm === "drizzle") pkgs.push("@himayah/adapter-drizzle", "drizzle-orm");
  else if (orm === "prisma") pkgs.push("@himayah/adapter-prisma", "@prisma/client");
  else if (orm === "kysely") pkgs.push("@himayah/adapter-kysely", "kysely");

  if (framework === "hono") pkgs.push("@himayah/middleware-hono");
  else if (framework === "express") pkgs.push("@himayah/middleware-express");
  else if (framework === "nextjs") pkgs.push("@himayah/next");

  plugins.forEach((p) => {
    if (p !== "password") pkgs.push(`@himayah/plugin-${p}`);
    else pkgs.push("@himayah/plugin-password");
  });

  return pkgs.join(" ");
}

function generateRandomSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateAuthConfig(framework: string, orm: string, dbEngine: string, plugins: Set<string>): string {
  const imports: string[] = [`import { createAuth } from "@himayah/core";`];
  const pluginsCode: string[] = [];

  // Session Store imports
  imports.push(`import { createJWTSessionStore } from "@himayah/session";`);

  // DB Adapter Imports
  if (orm === "drizzle") {
    imports.push(`import { drizzleAdapter } from "@himayah/adapter-drizzle";`);
    imports.push(`import { db } from "./db";`);
    imports.push(`import * as schema from "./schema";`);
  } else if (orm === "prisma") {
    imports.push(`import { prismaAdapter } from "@himayah/adapter-prisma";`);
    imports.push(`import { db } from "./db"; // your prisma db instance`);
  }

  // Plugin Imports
  if (plugins.has("password")) {
    imports.push(`import { passwordPlugin } from "@himayah/plugin-password";`);
    pluginsCode.push(`    passwordPlugin({
      async getPasswordHash(userId) {
        // Query user's hash from database
        const result = await db.query.passwords.findFirst({ where: eq(schema.passwords.userId, userId) });
        return result?.hash ?? null;
      },
      async setPasswordHash(userId, hash) {
        // Save hash to database
        await db.insert(schema.passwords).values({ userId, hash }).onConflictDoUpdate({
          target: schema.passwords.userId,
          set: { hash }
        });
      }
    }),`);
  }

  if (plugins.has("oauth")) {
    imports.push(`import { oauthPlugin, github } from "@himayah/plugin-oauth";`);
    pluginsCode.push(`    oauthPlugin({
      providers: [
        github({
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        })
      ]
    }),`);
  }

  if (plugins.has("magic-link")) {
    imports.push(`import { magicLinkPlugin } from "@himayah/plugin-magic-link";`);
    pluginsCode.push(`    magicLinkPlugin({
      sendVerificationToken: async (email, token, url) => {
        console.log(\`Send magic link to \${email}: \${url}?token=\${token}\`);
      }
    }),`);
  }

  if (plugins.has("otp")) {
    imports.push(`import { otpPlugin } from "@himayah/plugin-otp";`);
    pluginsCode.push(`    otpPlugin({
      sendOTP: async (identifier, code) => {
        console.log(\`Send OTP \${code} to \${identifier}\`);
      }
    }),`);
  }

  if (plugins.has("passkey")) {
    imports.push(`import { passkeyPlugin } from "@himayah/plugin-passkey";`);
    pluginsCode.push(`    passkeyPlugin({
      rpName: "Himayah App",
      rpId: "localhost",
      origin: "http://localhost:3000"
    }),`);
  }

  if (plugins.has("organization")) {
    imports.push(`import { organizationPlugin } from "@himayah/plugin-organization";`);
    pluginsCode.push(`    organizationPlugin(),`);
  }

  return `${imports.join("\n")}

export const auth = createAuth({
  adapter: ${orm === "drizzle" ? "drizzleAdapter(db, schema)" : "prismaAdapter(db)"},

  sessionStore: createJWTSessionStore({
    secret: process.env.AUTH_SECRET!,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  }),

  plugins: [
${pluginsCode.join("\n")}
  ],

  baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  cookieName: "himayah.sid",
  csrf: true,
});
`;
}

function generateDrizzleSchema(dbEngine: string, plugins: Set<string>): string {
  const schemaFn = dbEngine === "postgres" ? "createPGSchemas" : dbEngine === "sqlite" ? "createSQLiteSchemas" : "createMySQLSchemas";
  return `import { pgTable } from "drizzle-orm/pg-core";
import { ${schemaFn} } from "@himayah/adapter-drizzle";

// Exposes all users, sessions, accounts, rate-limits programmatically!
export const {
  users,
  accounts,
  sessions,
  verificationTokens,
  passwords,
  rateLimits,
  orgs,
  members,
  invitations,
} = ${schemaFn}();
`;
}

function generatePrismaSchema(dbEngine: string, plugins: Set<string>): string {
  const dbProvider = dbEngine === "postgres" ? "postgresql" : dbEngine === "sqlite" ? "sqlite" : "mysql";
  return `datasource db {
  provider = "${dbProvider}"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  accounts  Account[]
  sessions  Session[]
  passwords Password?
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  providerId        String
  providerAccountId String
  refreshToken      String?
  accessToken       String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  id         String   @id @default(cuid())
  identifier String
  token      String
  expires    DateTime
}

model Password {
  userId String @id
  hash   String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}
`;
}

function generateRouteHandler(framework: string, targetDir: string) {
  if (framework === "nextjs") {
    const routeDir = path.join(targetDir, "app", "api", "auth", "[[...route]]");
    if (!fs.existsSync(routeDir)) fs.mkdirSync(routeDir, { recursive: true });
    const code = `import { auth } from "@/lib/auth";
import { createNextHandler } from "@himayah/next";

export const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextHandler(auth);
`;
    fs.writeFileSync(path.join(routeDir, "route.ts"), code);
    console.log(`${green("  ✓ Created Next.js route API handler at")} app/api/auth/[[...route]]/route.ts`);
  } else if (framework === "sveltekit") {
    const routeDir = path.join(targetDir, "src", "routes", "api", "auth", "[...path]");
    if (!fs.existsSync(routeDir)) fs.mkdirSync(routeDir, { recursive: true });
    const code = `import { auth } from "$lib/auth";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = async ({ request }) => {
  return auth.handleRequest(request);
};
`;
    fs.writeFileSync(path.join(routeDir, "+server.ts"), code);
    console.log(`${green("  ✓ Created SvelteKit route API handler at")} src/routes/api/auth/[...path]/+server.ts`);
  } else if (framework === "astro") {
    const routeDir = path.join(targetDir, "src", "pages", "api", "auth", "[...path]");
    if (!fs.existsSync(routeDir)) fs.mkdirSync(routeDir, { recursive: true });
    const code = `import { auth } from "../../../../lib/auth";
import type { APIRoute } from "astro";

export const ALL: APIRoute = async ({ request }) => {
  return auth.handleRequest(request);
};
`;
    fs.writeFileSync(path.join(routeDir, "[...path].ts"), code);
    console.log(`${green("  ✓ Created Astro route API handler at")} src/pages/api/auth/[...path].ts`);
  } else if (framework === "nuxt") {
    const routeDir = path.join(targetDir, "server", "api", "auth");
    if (!fs.existsSync(routeDir)) fs.mkdirSync(routeDir, { recursive: true });
    const code = `import { auth } from "~/lib/auth";

export default defineEventHandler(async (event) => {
  return auth.handleRequest(toWebRequest(event));
});
`;
    fs.writeFileSync(path.join(routeDir, "[...].ts"), code);
    console.log(`${green("  ✓ Created Nuxt route API handler at")} server/api/auth/[...].ts`);
  } else if (framework === "hono") {
    const code = `import { Hono } from "hono";
import { honoMiddleware } from "@himayah/middleware-hono";
import { auth } from "./lib/auth";

const app = new Hono();

// Mount all auth routes under /api/auth
app.use("/api/auth/*", honoMiddleware(auth));

export default app;
`;
    fs.writeFileSync(path.join(targetDir, "index.ts"), code);
    console.log(`${green("  ✓ Created Hono entry routing script at")} index.ts`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(red("Error initiating Himayah CLI setup:"), err);
    process.exit(1);
  });
}
