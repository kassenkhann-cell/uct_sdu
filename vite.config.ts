import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(projectRoot, "frontend");
const dashboardPath = path.join(
  frontendRoot,
  "public",
  "generated",
  "dashboard.json",
);

function localDashboardApi(): Plugin {
  return {
    name: "local-dashboard-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        if (req.url === "/health") {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ status: "ok", data_source: "vite-local-api" }));
          return;
        }

        if (
          req.url.startsWith("/api/dashboard/summary") ||
          req.url.startsWith("/api/meta")
        ) {
          try {
            const payload = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify(
                req.url.startsWith("/api/meta") ? payload.meta : payload,
              ),
            );
          } catch (error) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                detail:
                  error instanceof Error ? error.message : "Dashboard data unavailable",
              }),
            );
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: frontendRoot,
  plugins: [react(), localDashboardApi()],
  cacheDir: path.join(projectRoot, "node_modules", ".vite-digital-radar"),
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      allow: [frontendRoot],
    },
  },
  build: {
    outDir: path.join(frontendRoot, "dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
