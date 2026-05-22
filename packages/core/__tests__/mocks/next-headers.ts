export function headers() {
  const h = new Map();
  h.set("host", "himayah-test.local");
  h.set("x-forwarded-proto", "https");
  h.set("user-agent", "vitest-agent");
  return h;
}

export function cookies() {
  return {
    getAll: () => [
      { name: "himayah.sid", value: "mocked-session-token" },
      { name: "other-cookie", value: "value" }
    ]
  };
}
