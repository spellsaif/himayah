import type { SessionAdapter, UserAdapter } from "@himayah/adapter";
import type { SessionStore } from "./types.js";

export interface DatabaseSessionStoreOptions {
  sessionAdapter: SessionAdapter;
  userAdapter: UserAdapter;
  maxAge?: number; // In seconds, defaults to 30 days (2592000)
}

export function createDatabaseSessionStore(options: DatabaseSessionStoreOptions): SessionStore {
  const { sessionAdapter, userAdapter, maxAge = 30 * 24 * 60 * 60 } = options;

  return {
    async create(payload: Record<string, any>): Promise<string> {
      const userId = payload.userId;
      if (!userId) {
        throw new Error("createDatabaseSessionStore requires a userId inside payload");
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + maxAge * 1000);

      await sessionAdapter.createSession({
        userId,
        token,
        expiresAt,
      });

      return token;
    },

    async verify(token: string): Promise<Record<string, any> | null> {
      const session = await sessionAdapter.findSession(token);
      if (!session) {
        return null;
      }

      if (new Date() > new Date(session.expiresAt)) {
        await sessionAdapter.deleteSession(token).catch(() => {});
        return null;
      }

      const user = await userAdapter.findUserById(session.userId);
      if (!user) {
        await sessionAdapter.deleteSession(token).catch(() => {});
        return null;
      }

      return {
        userId: session.userId,
        user,
      };
    }
  };
}
