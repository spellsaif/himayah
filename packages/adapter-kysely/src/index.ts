import type { Kysely } from "kysely";
import type {
  User,
  Session,
  Account,
  VerificationToken,
  Org,
  Member,
  Invitation,
  UserAdapter,
  SessionAdapter,
  OAuthAdapter,
  VerificationTokenAdapter,
  OrgAdapter
} from "@himayah/adapter";

export interface KyselyAdapterOptions {
  users?: string;
  sessions?: string;
  accounts?: string;
  verificationTokens?: string;
  orgs?: string;
  members?: string;
  invitations?: string;
}

export function kyselyAdapter(
  db: Kysely<any>,
  options?: KyselyAdapterOptions
) {
  const usersTable = options?.users || "users";
  const sessionsTable = options?.sessions || "sessions";
  const accountsTable = options?.accounts || "accounts";
  const tokensTable = options?.verificationTokens || "verification_tokens";
  const orgsTable = options?.orgs || "orgs";
  const membersTable = options?.members || "members";
  const invitationsTable = options?.invitations || "invitations";

  const adapter: UserAdapter &
    Partial<SessionAdapter> &
    Partial<OAuthAdapter> &
    Partial<VerificationTokenAdapter> &
    Partial<OrgAdapter> = {
    async findUserByEmail(email: string): Promise<User | null> {
      const result = await db
        .selectFrom(usersTable)
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();
      return (result as any) || null;
    },

    async findUserById(id: string): Promise<User | null> {
      const result = await db
        .selectFrom(usersTable)
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return (result as any) || null;
    },

    async createUser(data: { email: string; name?: string | null; emailVerified?: Date | null }): Promise<User> {
      const newId = crypto.randomUUID();
      const insertData = {
        id: newId,
        email: data.email,
        name: data.name || null,
        emailVerified: data.emailVerified || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.insertInto(usersTable).values(insertData).execute();
      return insertData as any;
    },

    async updateUser(id: string, data: Partial<User>): Promise<User> {
      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      await db
        .updateTable(usersTable)
        .set(updateData)
        .where("id", "=", id)
        .execute();

      const updated = await this.findUserById(id);
      if (!updated) {
        throw new Error("Failed to update user: user not found");
      }
      return updated;
    }
  };

  // Session table implementation
  if (options?.sessions !== null) {
    adapter.createSession = async (data: { userId: string; token: string; expiresAt: Date }): Promise<Session> => {
      const newId = crypto.randomUUID();
      const insertData = {
        id: newId,
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
        createdAt: new Date()
      };
      await db.insertInto(sessionsTable).values(insertData).execute();
      return insertData as any;
    };

    adapter.findSession = async (token: string): Promise<Session | null> => {
      const result = await db
        .selectFrom(sessionsTable)
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.deleteSession = async (token: string): Promise<void> => {
      await db
        .deleteFrom(sessionsTable)
        .where("token", "=", token)
        .execute();
    };

    adapter.deleteUserSessions = async (userId: string): Promise<void> => {
      await db
        .deleteFrom(sessionsTable)
        .where("userId", "=", userId)
        .execute();
    };
  }

  // Account table implementation
  if (options?.accounts !== null) {
    adapter.findAccount = async (providerId: string, providerAccountId: string): Promise<Account | null> => {
      const result = await db
        .selectFrom(accountsTable)
        .selectAll()
        .where("providerId", "=", providerId)
        .where("providerAccountId", "=", providerAccountId)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.createAccount = async (data: {
      userId: string;
      providerId: string;
      providerAccountId: string;
      refreshToken?: string | null;
      accessToken?: string | null;
      expiresAt?: Date | null;
    }): Promise<Account> => {
      const newId = crypto.randomUUID();
      const insertData = {
        id: newId,
        userId: data.userId,
        providerId: data.providerId,
        providerAccountId: data.providerAccountId,
        refreshToken: data.refreshToken || null,
        accessToken: data.accessToken || null,
        expiresAt: data.expiresAt || null,
        createdAt: new Date()
      };
      await db.insertInto(accountsTable).values(insertData).execute();
      return insertData as any;
    };
  }

  // Verification Tokens implementation
  if (options?.verificationTokens !== null) {
    adapter.createVerificationToken = async (data: { identifier: string; token: string; expires: Date }): Promise<VerificationToken> => {
      const insertData = {
        identifier: data.identifier,
        token: data.token,
        expires: data.expires
      };
      await db.insertInto(tokensTable).values(insertData).execute();
      return insertData as any;
    };

    adapter.findVerificationToken = async (identifier: string, token: string): Promise<VerificationToken | null> => {
      const result = await db
        .selectFrom(tokensTable)
        .selectAll()
        .where("identifier", "=", identifier)
        .where("token", "=", token)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.deleteVerificationToken = async (identifier: string, token: string): Promise<void> => {
      await db
        .deleteFrom(tokensTable)
        .where("identifier", "=", identifier)
        .where("token", "=", token)
        .execute();
    };
  }

  // Organizations implementation
  if (options?.orgs !== null && options?.members !== null) {
    adapter.createOrg = async (name: string, creatorUserId: string): Promise<Org> => {
      const orgId = crypto.randomUUID();
      const insertOrg = {
        id: orgId,
        name,
        createdAt: new Date()
      };
      await db.insertInto(orgsTable).values(insertOrg).execute();

      const member = {
        orgId,
        userId: creatorUserId,
        role: "owner",
        joinedAt: new Date()
      };
      await db.insertInto(membersTable).values(member).execute();

      return insertOrg as any;
    };

    adapter.findOrgById = async (id: string): Promise<Org | null> => {
      const result = await db
        .selectFrom(orgsTable)
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.listUserOrgs = async (userId: string): Promise<Org[]> => {
      const userMembers = await db
        .selectFrom(membersTable)
        .selectAll()
        .where("userId", "=", userId)
        .execute();

      if (userMembers.length === 0) return [];
      const orgIds = userMembers.map((m: any) => m.orgId);

      const result = await db
        .selectFrom(orgsTable)
        .selectAll()
        .where("id", "in", orgIds)
        .execute();

      return result as any[];
    };

    adapter.addMember = async (orgId: string, userId: string, role: string): Promise<Member> => {
      const insertData = {
        orgId,
        userId,
        role,
        joinedAt: new Date()
      };
      await db.insertInto(membersTable).values(insertData).execute();
      return insertData as any;
    };

    adapter.findMember = async (orgId: string, userId: string): Promise<Member | null> => {
      const result = await db
        .selectFrom(membersTable)
        .selectAll()
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.listMembers = async (orgId: string): Promise<Member[]> => {
      const result = await db
        .selectFrom(membersTable)
        .selectAll()
        .where("orgId", "=", orgId)
        .execute();
      return result as any[];
    };

    adapter.removeMember = async (orgId: string, userId: string): Promise<void> => {
      await db
        .deleteFrom(membersTable)
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .execute();
    };
  }

  // Invitations implementation
  if (options?.invitations !== null) {
    adapter.createInvitation = async (data: { email: string; orgId: string; role: string; token: string; expiresAt: Date }): Promise<Invitation> => {
      const insertData = {
        token: data.token,
        email: data.email,
        orgId: data.orgId,
        role: data.role,
        expiresAt: data.expiresAt
      };
      await db.insertInto(invitationsTable).values(insertData).execute();
      return insertData as any;
    };

    adapter.findInvitation = async (token: string): Promise<Invitation | null> => {
      const result = await db
        .selectFrom(invitationsTable)
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();
      return (result as any) || null;
    };

    adapter.deleteInvitation = async (token: string): Promise<void> => {
      await db
        .deleteFrom(invitationsTable)
        .where("token", "=", token)
        .execute();
    };
  }

  return adapter;
}
