import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Prisma-klienten byggs när lib/db.ts importeras. Den ansluter inte
    // förrän en fråga körs, men konstruktorn kräver att variablerna finns.
    // Enhetstesterna rör aldrig databasen; integrationstesterna hoppar
    // över sig själva om TEST_DATABASE_URL saknas.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/none",
      DIRECT_URL:   process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/none",
    },
  },
});
