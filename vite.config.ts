import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function normalizeBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH ?? "/films/"),
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
