import { pgTable as defaultPgTable, text as pgText, timestamp as pgTimestamp, integer as pgInteger } from "drizzle-orm/pg-core";
import { sqliteTable as defaultSqliteTable, text as sqliteText, integer as sqliteInteger } from "drizzle-orm/sqlite-core";
import { mysqlTable as defaultMysqlTable, varchar as mysqlVarchar, datetime as mysqlDatetime, int as mysqlInt } from "drizzle-orm/mysql-core";

/**
 * Creates PostgreSQL schemas for Himayah authentication.
 * @param pgTableFn The Drizzle pgTable function, allows custom table schemas or naming.
 */
export function createPGSchemas(pgTableFn: any = defaultPgTable) {
  const users = pgTableFn("users", {
    id: pgText("id").primaryKey(),
    email: pgText("email").notNull().unique(),
    name: pgText("name"),
    image: pgText("image"),
    emailVerified: pgTimestamp("email_verified"),
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),
    updatedAt: pgTimestamp("updated_at").notNull().defaultNow(),
  });

  const accounts = pgTableFn("accounts", {
    id: pgText("id").primaryKey(),
    userId: pgText("user_id").notNull(),
    providerId: pgText("provider_id").notNull(),
    providerAccountId: pgText("provider_account_id").notNull(),
    refreshToken: pgText("refresh_token"),
    accessToken: pgText("access_token"),
    expiresAt: pgTimestamp("expires_at"),
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),
  });

  const sessions = pgTableFn("sessions", {
    id: pgText("id").primaryKey(),
    userId: pgText("user_id").notNull(),
    token: pgText("token").notNull().unique(),
    expiresAt: pgTimestamp("expires_at").notNull(),
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),
  });

  const verificationTokens = pgTableFn("verification_tokens", {
    identifier: pgText("identifier").notNull(),
    token: pgText("token").notNull(),
    expires: pgTimestamp("expires").notNull(),
  });

  const passwords = pgTableFn("passwords", {
    userId: pgText("user_id").primaryKey(),
    hash: pgText("hash").notNull(),
  });

  const rateLimits = pgTableFn("rate_limits", {
    key: pgText("key").primaryKey(),
    count: pgInteger("count").notNull(),
    expiresAt: pgTimestamp("expires_at").notNull(),
  });

  const orgs = pgTableFn("orgs", {
    id: pgText("id").primaryKey(),
    name: pgText("name").notNull(),
    createdAt: pgTimestamp("created_at").notNull().defaultNow(),
  });

  const members = pgTableFn("members", {
    orgId: pgText("org_id").notNull(),
    userId: pgText("user_id").notNull(),
    role: pgText("role").notNull(),
    joinedAt: pgTimestamp("joined_at").notNull().defaultNow(),
  });

  const invitations = pgTableFn("invitations", {
    token: pgText("token").primaryKey(),
    email: pgText("email").notNull(),
    orgId: pgText("org_id").notNull(),
    role: pgText("role").notNull(),
    expiresAt: pgTimestamp("expires_at").notNull(),
  });

  return {
    users,
    accounts,
    sessions,
    verificationTokens,
    passwords,
    rateLimits,
    orgs,
    members,
    invitations,
  };
}

/**
 * Creates SQLite schemas for Himayah authentication.
 * @param sqliteTableFn The Drizzle sqliteTable function, allows custom table schemas or naming.
 */
export function createSQLiteSchemas(sqliteTableFn: any = defaultSqliteTable) {
  const users = sqliteTableFn("users", {
    id: sqliteText("id").primaryKey(),
    email: sqliteText("email").notNull().unique(),
    name: sqliteText("name"),
    image: sqliteText("image"),
    emailVerified: sqliteInteger("email_verified", { mode: "timestamp" }),
    createdAt: sqliteInteger("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: sqliteInteger("updated_at", { mode: "timestamp" }).notNull(),
  });

  const accounts = sqliteTableFn("accounts", {
    id: sqliteText("id").primaryKey(),
    userId: sqliteText("user_id").notNull(),
    providerId: sqliteText("provider_id").notNull(),
    providerAccountId: sqliteText("provider_account_id").notNull(),
    refreshToken: sqliteText("refresh_token"),
    accessToken: sqliteText("access_token"),
    expiresAt: sqliteInteger("expires_at", { mode: "timestamp" }),
    createdAt: sqliteInteger("created_at", { mode: "timestamp" }).notNull(),
  });

  const sessions = sqliteTableFn("sessions", {
    id: sqliteText("id").primaryKey(),
    userId: sqliteText("user_id").notNull(),
    token: sqliteText("token").notNull().unique(),
    expiresAt: sqliteInteger("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: sqliteInteger("created_at", { mode: "timestamp" }).notNull(),
  });

  const verificationTokens = sqliteTableFn("verification_tokens", {
    identifier: sqliteText("identifier").notNull(),
    token: sqliteText("token").notNull(),
    expires: sqliteInteger("expires", { mode: "timestamp" }).notNull(),
  });

  const passwords = sqliteTableFn("passwords", {
    userId: sqliteText("user_id").primaryKey(),
    hash: sqliteText("hash").notNull(),
  });

  const rateLimits = sqliteTableFn("rate_limits", {
    key: sqliteText("key").primaryKey(),
    count: sqliteInteger("count").notNull(),
    expiresAt: sqliteInteger("expires_at", { mode: "timestamp" }).notNull(),
  });

  const orgs = sqliteTableFn("orgs", {
    id: sqliteText("id").primaryKey(),
    name: sqliteText("name").notNull(),
    createdAt: sqliteInteger("created_at", { mode: "timestamp" }).notNull(),
  });

  const members = sqliteTableFn("members", {
    orgId: sqliteText("org_id").notNull(),
    userId: sqliteText("user_id").notNull(),
    role: sqliteText("role").notNull(),
    joinedAt: sqliteInteger("joined_at", { mode: "timestamp" }).notNull(),
  });

  const invitations = sqliteTableFn("invitations", {
    token: sqliteText("token").primaryKey(),
    email: sqliteText("email").notNull(),
    orgId: sqliteText("org_id").notNull(),
    role: sqliteText("role").notNull(),
    expiresAt: sqliteInteger("expires_at", { mode: "timestamp" }).notNull(),
  });

  return {
    users,
    accounts,
    sessions,
    verificationTokens,
    passwords,
    rateLimits,
    orgs,
    members,
    invitations,
  };
}

/**
 * Creates MySQL schemas for Himayah authentication.
 * @param mysqlTableFn The Drizzle mysqlTable function, allows custom table schemas or naming.
 */
export function createMySQLSchemas(mysqlTableFn: any = defaultMysqlTable) {
  const users = mysqlTableFn("users", {
    id: mysqlVarchar("id", { length: 255 }).primaryKey(),
    email: mysqlVarchar("email", { length: 255 }).notNull().unique(),
    name: mysqlVarchar("name", { length: 255 }),
    image: mysqlVarchar("image", { length: 255 }),
    emailVerified: mysqlDatetime("email_verified", { mode: "date" }),
    createdAt: mysqlDatetime("created_at", { mode: "date" }).notNull(),
    updatedAt: mysqlDatetime("updated_at", { mode: "date" }).notNull(),
  });

  const accounts = mysqlTableFn("accounts", {
    id: mysqlVarchar("id", { length: 255 }).primaryKey(),
    userId: mysqlVarchar("user_id", { length: 255 }).notNull(),
    providerId: mysqlVarchar("provider_id", { length: 255 }).notNull(),
    providerAccountId: mysqlVarchar("provider_account_id", { length: 255 }).notNull(),
    refreshToken: mysqlVarchar("refresh_token", { length: 1024 }),
    accessToken: mysqlVarchar("access_token", { length: 1024 }),
    expiresAt: mysqlDatetime("expires_at", { mode: "date" }),
    createdAt: mysqlDatetime("created_at", { mode: "date" }).notNull(),
  });

  const sessions = mysqlTableFn("sessions", {
    id: mysqlVarchar("id", { length: 255 }).primaryKey(),
    userId: mysqlVarchar("user_id", { length: 255 }).notNull(),
    token: mysqlVarchar("token", { length: 255 }).notNull().unique(),
    expiresAt: mysqlDatetime("expires_at", { mode: "date" }).notNull(),
    createdAt: mysqlDatetime("created_at", { mode: "date" }).notNull(),
  });

  const verificationTokens = mysqlTableFn("verification_tokens", {
    identifier: mysqlVarchar("identifier", { length: 255 }).notNull(),
    token: mysqlVarchar("token", { length: 255 }).notNull(),
    expires: mysqlDatetime("expires", { mode: "date" }).notNull(),
  });

  const passwords = mysqlTableFn("passwords", {
    userId: mysqlVarchar("user_id", { length: 255 }).primaryKey(),
    hash: mysqlVarchar("hash", { length: 255 }).notNull(),
  });

  const rateLimits = mysqlTableFn("rate_limits", {
    key: mysqlVarchar("key", { length: 255 }).primaryKey(),
    count: mysqlInt("count").notNull(),
    expiresAt: mysqlDatetime("expires_at", { mode: "date" }).notNull(),
  });

  const orgs = mysqlTableFn("orgs", {
    id: mysqlVarchar("id", { length: 255 }).primaryKey(),
    name: mysqlVarchar("name", { length: 255 }).notNull(),
    createdAt: mysqlDatetime("created_at", { mode: "date" }).notNull(),
  });

  const members = mysqlTableFn("members", {
    orgId: mysqlVarchar("org_id", { length: 255 }).notNull(),
    userId: mysqlVarchar("user_id", { length: 255 }).notNull(),
    role: mysqlVarchar("role", { length: 255 }).notNull(),
    joinedAt: mysqlDatetime("joined_at", { mode: "date" }).notNull(),
  });

  const invitations = mysqlTableFn("invitations", {
    token: mysqlVarchar("token", { length: 255 }).primaryKey(),
    email: mysqlVarchar("email", { length: 255 }).notNull(),
    orgId: mysqlVarchar("org_id", { length: 255 }).notNull(),
    role: mysqlVarchar("role", { length: 255 }).notNull(),
    expiresAt: mysqlDatetime("expires_at", { mode: "date" }).notNull(),
  });

  return {
    users,
    accounts,
    sessions,
    verificationTokens,
    passwords,
    rateLimits,
    orgs,
    members,
    invitations,
  };
}
