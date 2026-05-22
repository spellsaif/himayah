import type { AuthResult } from "./types.js";

export function unwrap<T>(result: AuthResult<T>): T {
  if (!result.ok) {
    const err = new Error(result.error.message);
    (err as any).code = result.error.code;
    (err as any).details = result.error.details;
    throw err;
  }
  return result.data;
}
