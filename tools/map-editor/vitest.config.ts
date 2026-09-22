import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/map-editor/server/**/*.test.ts"]
  }
});
