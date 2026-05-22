import type { RateLimitAdapter } from "@himayah/adapter";
import type { RateLimitStore } from "./types.js";

export class DatabaseRateLimitStore implements RateLimitStore {
  constructor(private adapter: RateLimitAdapter) {}

  async get(key: string): Promise<{ count: number; expiresAt: number } | null> {
    const record = await this.adapter.getRateLimit(key);
    if (!record) return null;

    const expiresAt = record.expiresAt instanceof Date 
      ? record.expiresAt.getTime() 
      : new Date(record.expiresAt).getTime();

    if (Date.now() > expiresAt) {
      return null;
    }

    return {
      count: record.count,
      expiresAt
    };
  }

  async set(key: string, value: { count: number; expiresAt: number }): Promise<void> {
    await this.adapter.setRateLimit(key, value.count, new Date(value.expiresAt));
  }
}
