import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "next/headers": path.resolve(__dirname, "./__tests__/mocks/next-headers.ts"),
    },
  },
  test: {
    // Keep test configurations here if any are needed
  },
});
