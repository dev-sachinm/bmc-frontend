import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
  let proxyTarget = "http://localhost:8000";
  try {
    proxyTarget = new URL(apiBase).origin;
  } catch {
    proxyTarget = "http://localhost:8000";
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": proxyTarget,
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});
