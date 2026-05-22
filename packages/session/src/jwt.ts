import type { JWTSessionOptions, SessionStore } from "./types.js";

// Helper: base64url encode a Uint8Array
function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper: base64url decode to Uint8Array
function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

// Helper: derive or import AES-GCM 256-bit key
async function getAESKey(secret: string, customSalt?: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(secret);

  // If the secret is exactly 256 bits (32 bytes), import it directly as a raw AES-GCM key
  if (secretBytes.length === 32) {
    return await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  const baseKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBytes = enc.encode(customSalt || "himayah-jwe-salt-fixed");
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes as any,
      iterations: 1000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Helper: import HMAC SHA-256 key
async function getHMACKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function createJWTSessionStore(options: JWTSessionOptions): SessionStore {
  const { secret, salt, maxAge = 15 * 60, strategy = "JWE" } = options;

  return {
    async create(payload: Record<string, any>): Promise<string> {
      const exp = Math.floor(Date.now() / 1000) + maxAge;
      const fullPayload = { ...payload, exp };
      const dataStr = JSON.stringify(fullPayload);
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(dataStr);

      if (strategy === "JWE") {
        const key = await getAESKey(secret, salt);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv as any },
          key,
          dataBytes as any
        );

        const ivStr = uint8ArrayToBase64Url(iv);
        const ciphertextStr = uint8ArrayToBase64Url(new Uint8Array(encrypted));
        return `${ivStr}.${ciphertextStr}`;
      } else {
        // JWS (HS256 signature only)
        const payloadBase64 = uint8ArrayToBase64Url(dataBytes);
        const header = uint8ArrayToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

        const message = `${header}.${payloadBase64}`;
        const key = await getHMACKey(secret);
        const signatureBytes = await crypto.subtle.sign(
          "HMAC",
          key,
          encoder.encode(message) as any
        );
        const signatureBase64 = uint8ArrayToBase64Url(new Uint8Array(signatureBytes));
        return `${message}.${signatureBase64}`;
      }
    },

    async verify(token: string): Promise<Record<string, any> | null> {
      try {
        const encoder = new TextEncoder();

        if (strategy === "JWE") {
          const parts = token.split(".");
          if (parts.length !== 2) return null;

          const iv = base64UrlToUint8Array(parts[0]);
          const ciphertext = base64UrlToUint8Array(parts[1]);

          const key = await getAESKey(secret, salt);
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv as any },
            key,
            ciphertext as any
          );

          const decoder = new TextDecoder();
          const payload = JSON.parse(decoder.decode(decrypted));

          if (payload.exp && typeof payload.exp === "number") {
            if (Date.now() / 1000 > payload.exp) {
              return null; // expired
            }
          }
          return payload;
        } else {
          // JWS verification
          const parts = token.split(".");
          if (parts.length !== 3) return null;

          const [header, payloadBase64, signatureBase64] = parts;
          const message = `${header}.${payloadBase64}`;

          const key = await getHMACKey(secret);
          const signature = base64UrlToUint8Array(signatureBase64);

          const isValid = await crypto.subtle.verify(
            "HMAC",
            key,
            signature as any,
            encoder.encode(message) as any
          );

          if (!isValid) return null;

          const decoder = new TextDecoder();
          const payload = JSON.parse(decoder.decode(base64UrlToUint8Array(payloadBase64)));

          if (payload.exp && typeof payload.exp === "number") {
            if (Date.now() / 1000 > payload.exp) {
              return null; // expired
            }
          }
          return payload;
        }
      } catch (err) {
        return null;
      }
    }
  };
}
