import devServer from "@hono/vite-dev-server"
import path from "path"
import { loadEnv } from "vite"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
function assignEnv(key: string, value: string | undefined) {
  const next = value?.trim();
  // Node stringifies `undefined`, which made Mongo look up a host named "undefined".
  if (!next || next === "undefined") return;
  if (!process.env[key]) process.env[key] = next;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), "");
  assignEnv("MONGODB_USER", env.MONGODB_USER);
  assignEnv("MONGODB_PASSWORD", env.MONGODB_PASSWORD);
  assignEnv("MONGODB_DB_NAME", env.MONGODB_DB_NAME);
  assignEnv("MONGODB_CLUSTER_HOST", env.MONGODB_CLUSTER_HOST);
  assignEnv("MONGODB_STANDARD_HOSTS", env.MONGODB_STANDARD_HOSTS);
  assignEnv("MONGODB_URI", env.MONGODB_URI);
  assignEnv("MONGODB_URI_STANDARD", env.MONGODB_URI_STANDARD);
  assignEnv("AUTH_DISABLED", env.AUTH_DISABLED);
  assignEnv("APP_SECRET", env.APP_SECRET);

  return {
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
};
});
