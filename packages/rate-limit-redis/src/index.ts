import type { RateLimitStore } from "@himayah/core";

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: RedisClient, private keyPrefix = "himayah:") {}

  async get(key: string): Promise<{ count: number; expiresAt: number } | null> {
    const fullKey = `${this.keyPrefix}${key}`;
    const value = await this.redis.get(fullKey);
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null) return null;
      if (typeof parsed.count !== "number" || typeof parsed.expiresAt !== "number") return null;

      if (Date.now() > parsed.expiresAt) {
        return null;
      }

      return {
        count: parsed.count,
        expiresAt: parsed.expiresAt
      };
    } catch {
      return null;
    }
  }

  async set(key: string, value: { count: number; expiresAt: number }): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    const serialized = JSON.stringify(value);
    const msToLive = value.expiresAt - Date.now();

    if (msToLive <= 0) {
      return;
    }

    try {
      // Try Node Redis / IoRedis style (set key value PX ms)
      await this.redis.set(fullKey, serialized, "PX", msToLive);
    } catch {
      try {
        // Try Upstash Redis style (set key value { px: ms })
        await this.redis.set(fullKey, serialized, { px: msToLive });
      } catch {
        // Fallback to setting without TTL (rely on manual cleanups/checking on get)
        await this.redis.set(fullKey, serialized);
      }
    }
  }
}
