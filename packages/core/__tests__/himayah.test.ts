import { describe, it, expect, vi } from "vitest";
import { createAuth, timingSafeEqual, DatabaseRateLimitStore } from "../src/index.js";
import { createJWTSessionStore, createDatabaseSessionStore } from "../../session/src/index.js";
import { passwordPlugin } from "../../plugin-password/src/index.js";
import { magicLinkPlugin } from "../../plugin-magic-link/src/index.js";
import { otpPlugin } from "../../plugin-otp/src/index.js";
import { organizationPlugin } from "../../plugin-organization/src/index.js";
import { createClient } from "../../client/src/index.js";
import { RedisRateLimitStore } from "../../rate-limit-redis/src/index.js";

describe("Himayah Authentication Monorepo integration", () => {
  const secret = "super-secret-key-must-be-long-32-chars!!";
  const mockUsersTable: any[] = [];
  const mockPasswords: Record<string, string> = {};
  const mockTokensTable: any[] = [];
  const mockOrgTable: any[] = [];
  const mockMemberTable: any[] = [];
  const mockInvitationTable: any[] = [];

  const mockAdapter = {
    // User Adapter
    async findUserByEmail(email: string) {
      return mockUsersTable.find((u) => u.email === email) || null;
    },
    async findUserById(id: string) {
      return mockUsersTable.find((u) => u.id === id) || null;
    },
    async findUser(id: string) {
      return mockUsersTable.find((u) => u.id === id) || null;
    },
    async createUser(data: { id?: string; email: string; name?: string | null; emailVerified?: Date | null }) {
      const user = {
        id: data.id || Math.random().toString(),
        email: data.email,
        name: data.name || null,
        emailVerified: data.emailVerified || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockUsersTable.push(user);
      return user;
    },
    async updateUser(id: string, data: any) {
      const user = mockUsersTable.find((u) => u.id === id);
      if (!user) throw new Error("User not found");
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    },
    // Verification Token Adapter
    async createVerificationToken(data: { identifier: string; token: string; expires: Date }) {
      const record = { ...data };
      mockTokensTable.push(record);
      return record;
    },
    async findVerificationToken(identifier: string, token: string) {
      return mockTokensTable.find((t) => t.identifier === identifier && t.token === token) || null;
    },
    async deleteVerificationToken(identifier: string, token: string) {
      const idx = mockTokensTable.findIndex((t) => t.identifier === identifier && t.token === token);
      if (idx !== -1) mockTokensTable.splice(idx, 1);
    },
    // Org Adapter
    async createOrg(name: string, creatorUserId: string) {
      const org = { id: Math.random().toString(), name, createdAt: new Date() };
      mockOrgTable.push(org);
      return org;
    },
    async findOrgById(id: string) {
      return mockOrgTable.find((o) => o.id === id) || null;
    },
    async listUserOrgs(userId: string) {
      const orgIds = mockMemberTable.filter((m) => m.userId === userId).map((m) => m.orgId);
      return mockOrgTable.filter((o) => orgIds.includes(o.id));
    },
    async addMember(orgId: string, userId: string, role: string) {
      const member = { orgId, userId, role, joinedAt: new Date() };
      mockMemberTable.push(member);
      return member;
    },
    async findMember(orgId: string, userId: string) {
      return mockMemberTable.find((m) => m.orgId === orgId && m.userId === userId) || null;
    },
    async listMembers(orgId: string) {
      return mockMemberTable.filter((m) => m.orgId === orgId);
    },
    async removeMember(orgId: string, userId: string) {
      const idx = mockMemberTable.findIndex((m) => m.orgId === orgId && m.userId === userId);
      if (idx !== -1) mockMemberTable.splice(idx, 1);
    },
    async createInvitation(data: { email: string; orgId: string; role: string; token: string; expiresAt: Date }) {
      const invitation = { ...data };
      mockInvitationTable.push(invitation);
      return invitation;
    },
    async findInvitation(token: string) {
      return mockInvitationTable.find((i) => i.token === token) || null;
    },
    async deleteInvitation(token: string) {
      const idx = mockInvitationTable.findIndex((i) => i.token === token);
      if (idx !== -1) mockInvitationTable.splice(idx, 1);
    }
  };

  const store = createJWTSessionStore({ secret, maxAge: 60 * 60 });
  const pPlugin = passwordPlugin({
    getPasswordHash: async (userId) => mockPasswords[userId] || null,
    setPasswordHash: async (userId, hash) => {
      mockPasswords[userId] = hash;
    }
  });

  const sentMagicLinks: any[] = [];
  const mlPlugin = magicLinkPlugin({
    sendVerificationToken: async (email, token, url) => {
      sentMagicLinks.push({ email, token, url });
    },
    rateLimitLimit: 3, // low limit for testing
    rateLimitWindow: 10,
    successRedirect: "/dashboard"
  });

  const sentOTPs: any[] = [];
  const oPlugin = otpPlugin({
    sendOTP: async (identifier, token) => {
      sentOTPs.push({ identifier, token });
    },
    rateLimitLimit: 3
  });

  const orgPlugin = organizationPlugin();

  const auth = createAuth({
    adapter: mockAdapter,
    sessionStore: store,
    plugins: [pPlugin, mlPlugin, oPlugin, orgPlugin],
    cookieName: "himayah-test.sid",
    csrf: false // Disabled on core instance for standard tests
  });

  it("should encrypt and decrypt payloads correctly via JWE", async () => {
    const payload = { userId: "user-123", test: "hello" };
    const token = await store.create(payload);

    expect(token).toContain(".");
    const decoded = await store.verify(token);
    expect(decoded).toBeDefined();
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.test).toBe(payload.test);
  });

  it("should sign up a user via password plugin", async () => {
    const result = await auth.handlers.password.signUp({
      email: "test@example.com",
      password: "securepassword123",
      name: "John Doe"
    });

    expect(result.ok).toBe(true);
    expect(result.data.user.email).toBe("test@example.com");
    expect(result.data.user.name).toBe("John Doe");

    // Duplicate email verification
    const duplicateResult = await auth.handlers.password.signUp({
      email: "test@example.com",
      password: "anotherpassword"
    });
    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.error?.code).toBe("user_already_exists");
  });

  it("should sign in a user and automatically return cookie instructions", async () => {
    const result = await auth.handlers.password.signIn({
      email: "test@example.com",
      password: "securepassword123"
    });

    expect(result.ok).toBe(true);
    expect(result.data.user.email).toBe("test@example.com");
    expect(result.data.sessionToken).toBeDefined();
    expect(result.data.cookies).toBeDefined();
    expect(result.data.cookies[0].name).toBe("himayah-test.sid");
    expect(result.data.cookies[0].value).toBe(result.data.sessionToken);

    // Fail with wrong credentials
    const badResult = await auth.handlers.password.signIn({
      email: "test@example.com",
      password: "wrongpassword"
    });
    expect(badResult.ok).toBe(false);
    expect(badResult.error?.code).toBe("invalid_credentials");
  });

  it("should verify active session via getSession request parser", async () => {
    const signInResult = await auth.handlers.password.signIn({
      email: "test@example.com",
      password: "securepassword123"
    });

    const token = signInResult.data.sessionToken;
    const req = new Request("http://localhost/api/auth/session", {
      headers: {
        cookie: `himayah-test.sid=${token}`
      }
    });

    const sessionResult = await auth.getSession(req);
    expect(sessionResult.ok).toBe(true);
    expect(sessionResult.data?.userId).toBe(signInResult.data.user.id);
    expect(sessionResult.data?.user.email).toBe("test@example.com");
  });

  it("should dispatch route requests properly through handleRequest", async () => {
    const req = new Request("http://localhost/api/auth/password/signIn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepassword123"
      })
    });

    const res = await auth.handleRequest(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.email).toBe("test@example.com");

    const setCookieHeader = res.headers.get("Set-Cookie");
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain("himayah-test.sid=");
  });

  it("should enforce CSRF validation when enabled in core configuration", async () => {
    const csrfAuth = createAuth({
      adapter: mockAdapter,
      sessionStore: store,
      plugins: [pPlugin],
      cookieName: "himayah-test.sid",
      csrf: true
    });

    // Get active session / CSRF token
    const getSessionReq = new Request("http://localhost/api/auth/session", { method: "GET" });
    const getSessionRes = await csrfAuth.handleRequest(getSessionReq);
    expect(getSessionRes.status).toBe(401);
    const setCookieHeader = getSessionRes.headers.get("Set-Cookie");
    expect(setCookieHeader).toContain("himayah.csrf=");

    const match = setCookieHeader?.match(/himayah\.csrf=([^;]+)/);
    const csrfToken = match ? match[1] : "";
    expect(csrfToken).toBeTruthy();

    // 1. Post request without CSRF should fail
    const badReq = new Request("http://localhost/api/auth/password/signIn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "securepassword123" })
    });
    const badRes = await csrfAuth.handleRequest(badReq);
    expect(badRes.status).toBe(403);
    const badBody = await badRes.json();
    expect(badBody.ok).toBe(false);
    expect(badBody.error.code).toBe("csrf_rejected");

    // 2. Post request with matching cookie and header should pass
    const goodReq = new Request("http://localhost/api/auth/password/signIn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `himayah.csrf=${csrfToken}`,
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ email: "test@example.com", password: "securepassword123" })
    });
    const goodRes = await csrfAuth.handleRequest(goodReq);
    expect(goodRes.status).toBe(200);
  });

  it("should send and verify magic links and enforce rate-limiting", async () => {
    const email = "magic@example.com";

    // 1. Send first magic link
    const sendReq1 = new Request("http://localhost/api/auth/magic-link/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const sendRes1 = await auth.handleRequest(sendReq1);
    expect(sendRes1.status).toBe(200);
    const body1 = await sendRes1.json();
    expect(body1.ok).toBe(true);
    expect(sentMagicLinks.length).toBe(1);
    expect(sentMagicLinks[0].email).toBe(email);

    // 2. Send second and third within limit
    const sendRes2 = await auth.handleRequest(
      new Request("http://localhost/api/auth/magic-link/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })
    );
    expect(sendRes2.status).toBe(200);

    const sendRes3 = await auth.handleRequest(
      new Request("http://localhost/api/auth/magic-link/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })
    );
    expect(sendRes3.status).toBe(200);

    // 4. Fourth request should hit rate limit (limit is 3)
    const limitRes = await auth.handleRequest(
      new Request("http://localhost/api/auth/magic-link/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })
    );
    expect(limitRes.status).toBe(400);
    const limitBody = await limitRes.json();
    expect(limitBody.ok).toBe(false);
    expect(limitBody.error.code).toBe("rate_limit_exceeded");

    // 5. Verify the token using GET redirect verify path
    const targetToken = sentMagicLinks[0].token;
    const verifyReq = new Request(`http://localhost/api/auth/magic-link/verify?token=${targetToken}&email=${encodeURIComponent(email)}`, {
      method: "GET"
    });
    const verifyRes = await auth.handleRequest(verifyReq);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("Location")).toBe("/dashboard");
    expect(verifyRes.headers.get("Set-Cookie")).toContain("himayah-test.sid=");
  });

  it("should create organizations, invite members, accept invites, and support context switching", async () => {
    // Setup logged in user session
    const signInResult = await auth.handlers.password.signIn({
      email: "test@example.com",
      password: "securepassword123"
    });
    const token = signInResult.data.sessionToken;

    // 1. Create Organization
    const createReq = new Request("http://localhost/api/auth/org/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `himayah-test.sid=${token}`
      },
      body: JSON.stringify({ name: "Acme Corp" })
    });
    const createRes = await auth.handleRequest(createReq);
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json();
    expect(createBody.ok).toBe(true);
    expect(createBody.data.org.name).toBe("Acme Corp");
    const newSessionToken = createBody.data.sessionToken;
    expect(newSessionToken).toBeDefined();

    // Verify user active organization context in session
    const sessionDecoded = await store.verify(newSessionToken);
    expect(sessionDecoded?.activeOrgId).toBe(createBody.data.org.id);

    // 2. Invite Member
    const inviteReq = new Request("http://localhost/api/auth/org/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `himayah-test.sid=${newSessionToken}`
      },
      body: JSON.stringify({ orgId: createBody.data.org.id, email: "invitee@example.com", role: "member" })
    });
    const inviteRes = await auth.handleRequest(inviteReq);
    expect(inviteRes.status).toBe(200);
    const inviteBody = await inviteRes.json();
    expect(inviteBody.ok).toBe(true);
    const invitationToken = inviteBody.data.invitation.token;
    expect(invitationToken).toBeDefined();

    // 3. Invitee sign up and accept invite
    const inviteeSignup = await auth.handlers.password.signUp({
      email: "invitee@example.com",
      password: "inviteepassword123",
      name: "Invitee"
    });
    const inviteeSignIn = await auth.handlers.password.signIn({
      email: "invitee@example.com",
      password: "inviteepassword123"
    });
    const inviteeToken = inviteeSignIn.data.sessionToken;

    const acceptReq = new Request("http://localhost/api/auth/org/accept-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `himayah-test.sid=${inviteeToken}`
      },
      body: JSON.stringify({ token: invitationToken })
    });
    const acceptRes = await auth.handleRequest(acceptReq);
    expect(acceptRes.status).toBe(200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.ok).toBe(true);
    expect(acceptBody.data.member.role).toBe("member");

    // Verify invitee switched session to active org
    const inviteeSession = await store.verify(acceptBody.data.sessionToken);
    expect(inviteeSession?.activeOrgId).toBe(createBody.data.org.id);
  });

  it("should make client proxy fetch calls to server routes successfully", async () => {
    const client = createClient<typeof auth>({ baseUrl: "/api/auth" });

    // Mock global fetch
    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const fullUrl = url.startsWith("http") ? url : `http://localhost${url}`;
      const mockReq = new Request(fullUrl, {
        method: init.method,
        headers: init.headers,
        body: init.body
      });
      const response = await auth.handleRequest(mockReq);
      const resJson = await response.json();
      return {
        json: async () => resJson
      };
    });

    vi.stubGlobal("fetch", mockFetch);

    const clientRes = await client.password.signIn({
      email: "test@example.com",
      password: "securepassword123"
    });

    expect(clientRes.ok).toBe(true);
    expect(clientRes.data.user.email).toBe("test@example.com");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/password/signIn"),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  describe("Security Enhancements (Phase 2)", () => {
    it("should compare strings in constant time using timingSafeEqual", () => {
      expect(timingSafeEqual("hello", "hello")).toBe(true);
      expect(timingSafeEqual("hello", "world")).toBe(false);
      expect(timingSafeEqual("hello", "helloo")).toBe(false);
      expect(timingSafeEqual("hello", "")).toBe(false);
      expect(timingSafeEqual("", "")).toBe(true);
      expect(timingSafeEqual(null as any, "hello")).toBe(false);
      expect(timingSafeEqual("hello", undefined as any)).toBe(false);
    });

    it("should handle stateful session store using createDatabaseSessionStore", async () => {
      const mockSessions: any[] = [];
      const sessionAdapterMock = {
        async createSession(data: { userId: string; token: string; expiresAt: Date }) {
          const s = { id: Math.random().toString(), ...data, createdAt: new Date() };
          mockSessions.push(s);
          return s;
        },
        async findSession(token: string) {
          return mockSessions.find((s) => s.token === token) || null;
        },
        async deleteSession(token: string) {
          const idx = mockSessions.findIndex((s) => s.token === token);
          if (idx !== -1) mockSessions.splice(idx, 1);
        },
        async deleteUserSessions(userId: string) {
          let idx = mockSessions.findIndex((s) => s.userId === userId);
          while (idx !== -1) {
            mockSessions.splice(idx, 1);
            idx = mockSessions.findIndex((s) => s.userId === userId);
          }
        }
      };

      const userAdapterMock = {
        async findUserById(id: string) {
          return mockUsersTable.find((u) => u.id === id) || null;
        },
        async findUserByEmail(email: string) {
          return mockUsersTable.find((u) => u.email === email) || null;
        },
        async createUser(data: any) {
          return mockAdapter.createUser(data);
        },
        async updateUser(id: string, data: any) {
          return mockAdapter.updateUser(id, data);
        }
      };

      const dbSessionStore = createDatabaseSessionStore({
        sessionAdapter: sessionAdapterMock,
        userAdapter: userAdapterMock,
        maxAge: 60 // 60 seconds
      });

      // 1. Create user
      const user = await userAdapterMock.createUser({ email: "stateful@example.com" });

      // 2. Create session
      const token = await dbSessionStore.create({ userId: user.id });
      expect(token).toBeDefined();
      expect(mockSessions.length).toBe(1);
      expect(mockSessions[0].userId).toBe(user.id);

      // 3. Verify session
      const verified = await dbSessionStore.verify(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(user.id);
      expect(verified?.user.email).toBe("stateful@example.com");

      // 4. Delete session (revocation)
      await sessionAdapterMock.deleteSession(token);
      const verifiedAfterDelete = await dbSessionStore.verify(token);
      expect(verifiedAfterDelete).toBeNull();
    });

    it("should handle DatabaseRateLimitStore using RateLimitAdapter", async () => {
      const mockRateLimits = new Map<string, { key: string; count: number; expiresAt: Date }>();
      const rateLimitAdapterMock = {
        async getRateLimit(key: string) {
          return mockRateLimits.get(key) || null;
        },
        async setRateLimit(key: string, count: number, expiresAt: Date) {
          mockRateLimits.set(key, { key, count, expiresAt });
        }
      };

      const dbRateLimitStore = new DatabaseRateLimitStore(rateLimitAdapterMock);

      // 1. Get non-existent
      const record = await dbRateLimitStore.get("test-key");
      expect(record).toBeNull();

      // 2. Set record
      const expiresAt = Date.now() + 5000;
      await dbRateLimitStore.set("test-key", { count: 3, expiresAt });

      const retrieved = await dbRateLimitStore.get("test-key");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.count).toBe(3);
      expect(retrieved?.expiresAt).toBe(expiresAt);

      // 3. Expiry handling
      const expiredTime = Date.now() - 1000;
      await dbRateLimitStore.set("expired-key", { count: 1, expiresAt: expiredTime });
      const expiredRetrieved = await dbRateLimitStore.get("expired-key");
      expect(expiredRetrieved).toBeNull();
    });

    it("should handle RedisRateLimitStore with a mocked Redis client", async () => {
      const mockRedisStore = new Map<string, string>();
      const mockRedisClient = {
        async get(key: string) {
          return mockRedisStore.get(key) || null;
        },
        async set(key: string, value: string, ...args: any[]) {
          mockRedisStore.set(key, value);
        }
      };

      const redisStore = new RedisRateLimitStore(mockRedisClient, "test-prefix:");

      // 1. Get non-existent
      const record = await redisStore.get("my-key");
      expect(record).toBeNull();

      // 2. Set key
      const expiresAt = Date.now() + 10000;
      await redisStore.set("my-key", { count: 5, expiresAt });

      const retrieved = await redisStore.get("my-key");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.count).toBe(5);
      expect(retrieved?.expiresAt).toBe(expiresAt);

      // Verify prefix prefixing
      expect(mockRedisStore.has("test-prefix:my-key")).toBe(true);

      // 3. Expired record
      const expiredTime = Date.now() - 5000;
      await redisStore.set("expired-key", { count: 2, expiresAt: expiredTime });
      const expiredRetrieved = await redisStore.get("expired-key");
      expect(expiredRetrieved).toBeNull();
    });
  });
});
