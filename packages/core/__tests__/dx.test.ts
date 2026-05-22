import { describe, it, expect } from "vitest";
import { createPGSchemas, createSQLiteSchemas, createMySQLSchemas } from "../../adapter-drizzle/src/schemas.js";
import { createNextHandler, getServerSession } from "../../next/src/index.js";


describe("Himayah DX Enhancements", () => {
  
  describe("Drizzle Programmatic Schema Builders", () => {
    it("should generate PostgreSQL schemas with the correct table columns", () => {
      // Mock pgTable function that returns table metadata
      const mockPgTable = (name: string, cols: any) => ({ name, cols });
      const schemas = createPGSchemas(mockPgTable);
      
      expect(schemas.users.name).toBe("users");
      expect(schemas.users.cols.id).toBeDefined();
      expect(schemas.users.cols.email).toBeDefined();
      
      expect(schemas.sessions.name).toBe("sessions");
      expect(schemas.sessions.cols.token).toBeDefined();
      expect(schemas.sessions.cols.userId).toBeDefined();
      
      expect(schemas.rateLimits.name).toBe("rate_limits");
      expect(schemas.rateLimits.cols.key).toBeDefined();
      expect(schemas.rateLimits.cols.count).toBeDefined();
    });

    it("should generate SQLite schemas with the correct table columns", () => {
      const mockSqliteTable = (name: string, cols: any) => ({ name, cols });
      const schemas = createSQLiteSchemas(mockSqliteTable);
      
      expect(schemas.users.name).toBe("users");
      expect(schemas.accounts.name).toBe("accounts");
      expect(schemas.passwords.name).toBe("passwords");
    });

    it("should generate MySQL schemas with the correct table columns", () => {
      const mockMysqlTable = (name: string, cols: any) => ({ name, cols });
      const schemas = createMySQLSchemas(mockMysqlTable);
      
      expect(schemas.users.name).toBe("users");
      expect(schemas.orgs.name).toBe("orgs");
      expect(schemas.members.name).toBe("members");
    });
  });

  describe("Next.js SDK Integration Wrapper", () => {
    it("should mount all standard HTTP method route handlers in createNextHandler", async () => {
      const mockAuth = {
        handleRequest: async (req: Request, options?: any) => {
          return new Response(`Handled ${req.method} with prefix ${options?.prefix}`);
        }
      };

      const handlers = createNextHandler(mockAuth, { prefix: "/api/my-auth" });

      expect(handlers.GET).toBeDefined();
      expect(handlers.POST).toBeDefined();
      expect(handlers.PUT).toBeDefined();
      expect(handlers.DELETE).toBeDefined();

      const getReq = new Request("http://localhost/api/my-auth/session", { method: "GET" });
      const getRes = await handlers.GET(getReq);
      expect(await getRes.text()).toBe("Handled GET with prefix /api/my-auth");

      const postReq = new Request("http://localhost/api/my-auth/signin", { method: "POST" });
      const postRes = await handlers.POST(postReq);
      expect(await postRes.text()).toBe("Handled POST with prefix /api/my-auth");
    });

    it("should synthesize the standard Web Request correctly in getServerSession helper", async () => {
      let capturedRequest: Request | null = null;
      
      const mockAuth = {
        getSession: async (req: Request) => {
          capturedRequest = req;
          return { ok: true as const, data: { userId: "user-123", expiresAt: new Date() } };
        }
      };

      const sessionResult = await getServerSession(mockAuth);

      expect(sessionResult.ok).toBe(true);
      expect(sessionResult.data?.userId).toBe("user-123");
      expect(capturedRequest).toBeDefined();
      
      const req = capturedRequest as unknown as Request;
      expect(req.url).toBe("https://himayah-test.local/");
      expect(req.headers.get("user-agent")).toBe("vitest-agent");
      expect(req.headers.get("cookie")).toContain("himayah.sid=mocked-session-token");
    });
  });
});
