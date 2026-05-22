import type {
  User,
  Session,
  Account,
  VerificationToken,
  Org,
  Member,
  Invitation,
  RateLimit,
  RateLimitAdapter,
  UserAdapter,
  SessionAdapter,
  OAuthAdapter,
  VerificationTokenAdapter,
  OrgAdapter
} from "@himayah/adapter";

export interface PrismaAdapterOptions {
  user?: string;
  session?: string;
  account?: string;
  verificationToken?: string;
  org?: string;
  member?: string;
  invitation?: string;
  rateLimit?: string;
}

export function prismaAdapter(
  db: any,
  options?: PrismaAdapterOptions
) {
  const userModel = options?.user || "user";
  const sessionModel = options?.session || "session";
  const accountModel = options?.account || "account";
  const tokenModel = options?.verificationToken || "verificationToken";
  const orgModel = options?.org || "org";
  const memberModel = options?.member || "member";
  const invitationModel = options?.invitation || "invitation";
  const rateLimitModel = options?.rateLimit || "rateLimit";

  const userDelegate = db[userModel];
  const sessionDelegate = db[sessionModel];
  const accountDelegate = db[accountModel];
  const tokenDelegate = db[tokenModel];
  const orgDelegate = db[orgModel];
  const memberDelegate = db[memberModel];
  const invitationDelegate = db[invitationModel];
  const rateLimitDelegate = db[rateLimitModel];

  if (!userDelegate) {
    throw new Error(`Prisma model delegate for "${userModel}" not found on database client.`);
  }

  const adapter: UserAdapter &
    Partial<SessionAdapter> &
    Partial<OAuthAdapter> &
    Partial<VerificationTokenAdapter> &
    Partial<OrgAdapter> &
    Partial<RateLimitAdapter> = {
    async findUserByEmail(email: string): Promise<User | null> {
      return await userDelegate.findUnique({
        where: { email }
      });
    },

    async findUserById(id: string): Promise<User | null> {
      return await userDelegate.findUnique({
        where: { id }
      });
    },

    async createUser(data: { email: string; name?: string | null; emailVerified?: Date | null }): Promise<User> {
      return await userDelegate.create({
        data: {
          email: data.email,
          name: data.name || null,
          emailVerified: data.emailVerified || null
        }
      });
    },

    async updateUser(id: string, data: Partial<User>): Promise<User> {
      return await userDelegate.update({
        where: { id },
        data
      });
    }
  };

  // Sessions
  if (sessionDelegate) {
    adapter.createSession = async (data: { userId: string; token: string; expiresAt: Date }): Promise<Session> => {
      return await sessionDelegate.create({
        data: {
          userId: data.userId,
          token: data.token,
          expiresAt: data.expiresAt
        }
      });
    };

    adapter.findSession = async (token: string): Promise<Session | null> => {
      return await sessionDelegate.findUnique({
        where: { token }
      });
    };

    adapter.deleteSession = async (token: string): Promise<void> => {
      await sessionDelegate.delete({
        where: { token }
      });
    };

    adapter.deleteUserSessions = async (userId: string): Promise<void> => {
      await sessionDelegate.deleteMany({
        where: { userId }
      });
    };
  }

  // Accounts
  if (accountDelegate) {
    adapter.findAccount = async (providerId: string, providerAccountId: string): Promise<Account | null> => {
      return await accountDelegate.findFirst({
        where: {
          providerId,
          providerAccountId
        }
      });
    };

    adapter.createAccount = async (data: {
      userId: string;
      providerId: string;
      providerAccountId: string;
      refreshToken?: string | null;
      accessToken?: string | null;
      expiresAt?: Date | null;
    }): Promise<Account> => {
      return await accountDelegate.create({
        data: {
          userId: data.userId,
          providerId: data.providerId,
          providerAccountId: data.providerAccountId,
          refreshToken: data.refreshToken || null,
          accessToken: data.accessToken || null,
          expiresAt: data.expiresAt || null
        }
      });
    };
  }

  // Verification Tokens
  if (tokenDelegate) {
    adapter.createVerificationToken = async (data: { identifier: string; token: string; expires: Date }): Promise<VerificationToken> => {
      return await tokenDelegate.create({
        data: {
          identifier: data.identifier,
          token: data.token,
          expires: data.expires
        }
      });
    };

    adapter.findVerificationToken = async (identifier: string, token: string): Promise<VerificationToken | null> => {
      // Prisma compound unique identifier is typically composed of identifier + token
      // or we can use findFirst
      return await tokenDelegate.findFirst({
        where: {
          identifier,
          token
        }
      });
    };

    adapter.deleteVerificationToken = async (identifier: string, token: string): Promise<void> => {
      // Find token first to get unique ID if there is no compound unique index on verification tokens
      const record = await tokenDelegate.findFirst({
        where: {
          identifier,
          token
        }
      });
      if (record && record.id) {
        await tokenDelegate.delete({
          where: { id: record.id }
        });
      } else {
        // Fallback for custom schema mapping deleteMany
        await tokenDelegate.deleteMany({
          where: {
            identifier,
            token
          }
        });
      }
    };
  }

  // Organizations
  if (orgDelegate && memberDelegate) {
    adapter.createOrg = async (name: string, creatorUserId: string): Promise<Org> => {
      const org = await orgDelegate.create({
        data: { name }
      });
      await memberDelegate.create({
        data: {
          orgId: org.id,
          userId: creatorUserId,
          role: "owner"
        }
      });
      return org;
    };

    adapter.findOrgById = async (id: string): Promise<Org | null> => {
      return await orgDelegate.findUnique({
        where: { id }
      });
    };

    adapter.listUserOrgs = async (userId: string): Promise<Org[]> => {
      const userMembers = await memberDelegate.findMany({
        where: { userId }
      });
      if (userMembers.length === 0) return [];
      const orgIds = userMembers.map((m: any) => m.orgId);
      return await orgDelegate.findMany({
        where: {
          id: { in: orgIds }
        }
      });
    };

    adapter.addMember = async (orgId: string, userId: string, role: string): Promise<Member> => {
      return await memberDelegate.create({
        data: {
          orgId,
          userId,
          role
        }
      });
    };

    adapter.findMember = async (orgId: string, userId: string): Promise<Member | null> => {
      // Find compound unique member row
      return await memberDelegate.findFirst({
        where: {
          orgId,
          userId
        }
      });
    };

    adapter.listMembers = async (orgId: string): Promise<Member[]> => {
      return await memberDelegate.findMany({
        where: { orgId }
      });
    };

    adapter.removeMember = async (orgId: string, userId: string): Promise<void> => {
      const record = await memberDelegate.findFirst({
        where: { orgId, userId }
      });
      if (record && record.id) {
        await memberDelegate.delete({
          where: { id: record.id }
        });
      } else {
        await memberDelegate.deleteMany({
          where: { orgId, userId }
        });
      }
    };
  }

  // Invitations
  if (invitationDelegate) {
    adapter.createInvitation = async (data: { email: string; orgId: string; role: string; token: string; expiresAt: Date }): Promise<Invitation> => {
      return await invitationDelegate.create({
        data: {
          token: data.token,
          email: data.email,
          orgId: data.orgId,
          role: data.role,
          expiresAt: data.expiresAt
        }
      });
    };

    adapter.findInvitation = async (token: string): Promise<Invitation | null> => {
      return await invitationDelegate.findUnique({
        where: { token }
      });
    };

    adapter.deleteInvitation = async (token: string): Promise<void> => {
      await invitationDelegate.delete({
        where: { token }
      });
    };
  }

  if (rateLimitDelegate) {
    adapter.getRateLimit = async (key: string): Promise<RateLimit | null> => {
      return await rateLimitDelegate.findUnique({
        where: { key }
      });
    };

    adapter.setRateLimit = async (key: string, count: number, expiresAt: Date): Promise<void> => {
      await rateLimitDelegate.upsert({
        where: { key },
        update: { count, expiresAt },
        create: { key, count, expiresAt }
      });
    };
  }

  return adapter;
}
