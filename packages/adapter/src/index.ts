export interface User {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Account {
  id: string;
  userId: string;
  providerId: string;
  providerAccountId: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface UserAdapter {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: { email: string; name?: string | null; emailVerified?: Date | null }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
}

export interface SessionAdapter {
  createSession(data: { userId: string; token: string; expiresAt: Date }): Promise<Session>;
  findSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

export interface OAuthAdapter {
  findAccount(providerId: string, providerAccountId: string): Promise<Account | null>;
  createAccount(data: {
    userId: string;
    providerId: string;
    providerAccountId: string;
    refreshToken?: string | null;
    accessToken?: string | null;
    expiresAt?: Date | null;
  }): Promise<Account>;
}

export interface VerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

export interface VerificationTokenAdapter {
  createVerificationToken(data: { identifier: string; token: string; expires: Date }): Promise<VerificationToken>;
  findVerificationToken(identifier: string, token: string): Promise<VerificationToken | null>;
  deleteVerificationToken(identifier: string, token: string): Promise<void>;
}

export interface Org {
  id: string;
  name: string;
  createdAt: Date;
}

export interface Member {
  orgId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

export interface Invitation {
  token: string;
  email: string;
  orgId: string;
  role: string;
  expiresAt: Date;
}

export interface OrgAdapter {
  createOrg(name: string, creatorUserId: string): Promise<Org>;
  findOrgById(id: string): Promise<Org | null>;
  listUserOrgs(userId: string): Promise<Org[]>;
  addMember(orgId: string, userId: string, role: string): Promise<Member>;
  findMember(orgId: string, userId: string): Promise<Member | null>;
  listMembers(orgId: string): Promise<Member[]>;
  removeMember(orgId: string, userId: string): Promise<void>;
  createInvitation(data: { email: string; orgId: string; role: string; token: string; expiresAt: Date }): Promise<Invitation>;
  findInvitation(token: string): Promise<Invitation | null>;
  deleteInvitation(token: string): Promise<void>;
}

export interface RateLimit {
  key: string;
  count: number;
  expiresAt: Date;
}

export interface RateLimitAdapter {
  getRateLimit(key: string): Promise<RateLimit | null>;
  setRateLimit(key: string, count: number, expiresAt: Date): Promise<void>;
}
