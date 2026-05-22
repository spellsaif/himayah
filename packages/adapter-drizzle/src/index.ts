import { eq, and } from "drizzle-orm";
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

export function drizzleAdapter(
  db: any,
  schemas: {
    users: any;
    sessions?: any;
    accounts?: any;
    verificationTokens?: any;
    orgs?: any;
    members?: any;
    invitations?: any;
  }
) {
  const { users, sessions, accounts, verificationTokens, orgs, members, invitations } = schemas;

  const adapter: UserAdapter &
    Partial<SessionAdapter> &
    Partial<OAuthAdapter> &
    Partial<VerificationTokenAdapter> &
    Partial<OrgAdapter> = {
    async findUserByEmail(email: string): Promise<User | null> {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0] || null;
    },

    async findUserById(id: string): Promise<User | null> {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0] || null;
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

      const result = await db.insert(users).values(insertData).returning();
      return result[0] || insertData;
    },

    async updateUser(id: string, data: Partial<User>): Promise<User> {
      const updateData = {
        ...data,
        updatedAt: new Date()
      };
      const result = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      return result[0];
    }
  };

  if (sessions) {
    adapter.createSession = async (data: { userId: string; token: string; expiresAt: Date }): Promise<Session> => {
      const newId = crypto.randomUUID();
      const insertData = {
        id: newId,
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
        createdAt: new Date()
      };
      const result = await db.insert(sessions).values(insertData).returning();
      return result[0] || insertData;
    };

    adapter.findSession = async (token: string): Promise<Session | null> => {
      const result = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
      return result[0] || null;
    };

    adapter.deleteSession = async (token: string): Promise<void> => {
      await db.delete(sessions).where(eq(sessions.token, token));
    };

    adapter.deleteUserSessions = async (userId: string): Promise<void> => {
      await db.delete(sessions).where(eq(sessions.userId, userId));
    };
  }

  if (accounts) {
    adapter.findAccount = async (providerId: string, providerAccountId: string): Promise<Account | null> => {
      const result = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.providerId, providerId),
            eq(accounts.providerAccountId, providerAccountId)
          )
        )
        .limit(1);
      return result[0] || null;
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
      const result = await db.insert(accounts).values(insertData).returning();
      return result[0] || insertData;
    };
  }

  if (verificationTokens) {
    adapter.createVerificationToken = async (data: { identifier: string; token: string; expires: Date }): Promise<VerificationToken> => {
      const insertData = {
        identifier: data.identifier,
        token: data.token,
        expires: data.expires
      };
      const result = await db.insert(verificationTokens).values(insertData).returning();
      return result[0] || insertData;
    };

    adapter.findVerificationToken = async (identifier: string, token: string): Promise<VerificationToken | null> => {
      const result = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token)
          )
        )
        .limit(1);
      return result[0] || null;
    };

    adapter.deleteVerificationToken = async (identifier: string, token: string): Promise<void> => {
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token)
          )
        );
    };
  }

  if (orgs && members) {
    adapter.createOrg = async (name: string, creatorUserId: string): Promise<Org> => {
      const orgId = crypto.randomUUID();
      const insertOrg = {
        id: orgId,
        name,
        createdAt: new Date()
      };
      await db.insert(orgs).values(insertOrg);
      
      const member = {
        orgId,
        userId: creatorUserId,
        role: "owner",
        joinedAt: new Date()
      };
      await db.insert(members).values(member);
      
      return insertOrg;
    };

    adapter.findOrgById = async (id: string): Promise<Org | null> => {
      const result = await db.select().from(orgs).where(eq(orgs.id, id)).limit(1);
      return result[0] || null;
    };

    adapter.listUserOrgs = async (userId: string): Promise<Org[]> => {
      const userMembers = await db.select().from(members).where(eq(members.userId, userId));
      if (userMembers.length === 0) return [];
      const orgIds = userMembers.map((m: any) => m.orgId);
      const result: Org[] = [];
      for (const orgId of orgIds) {
        const orgRes = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
        if (orgRes[0]) result.push(orgRes[0]);
      }
      return result;
    };

    adapter.addMember = async (orgId: string, userId: string, role: string): Promise<Member> => {
      const insertData = {
        orgId,
        userId,
        role,
        joinedAt: new Date()
      };
      const result = await db.insert(members).values(insertData).returning();
      return result[0] || insertData;
    };

    adapter.findMember = async (orgId: string, userId: string): Promise<Member | null> => {
      const result = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.orgId, orgId),
            eq(members.userId, userId)
          )
        )
        .limit(1);
      return result[0] || null;
    };

    adapter.listMembers = async (orgId: string): Promise<Member[]> => {
      return await db.select().from(members).where(eq(members.orgId, orgId));
    };

    adapter.removeMember = async (orgId: string, userId: string): Promise<void> => {
      await db
        .delete(members)
        .where(
          and(
            eq(members.orgId, orgId),
            eq(members.userId, userId)
          )
        );
    };
  }

  if (invitations) {
    adapter.createInvitation = async (data: { email: string; orgId: string; role: string; token: string; expiresAt: Date }): Promise<Invitation> => {
      const insertData = {
        token: data.token,
        email: data.email,
        orgId: data.orgId,
        role: data.role,
        expiresAt: data.expiresAt
      };
      const result = await db.insert(invitations).values(insertData).returning();
      return result[0] || insertData;
    };

    adapter.findInvitation = async (token: string): Promise<Invitation | null> => {
      const result = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
      return result[0] || null;
    };

    adapter.deleteInvitation = async (token: string): Promise<void> => {
      await db.delete(invitations).where(eq(invitations.token, token));
    };
  }

  return adapter;
}
