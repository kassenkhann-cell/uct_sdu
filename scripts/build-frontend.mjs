import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(root, "frontend");
const outDir = path.join(frontendRoot, "dist");
const base = process.env.VITE_BASE_PATH || "/";

await build({
  configFile: false,
  root: frontendRoot,
  base,
  plugins: [react()],
  cacheDir: path.join(root, "node_modules", ".vite-digital-radar"),
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
  },
});

if (process.env.VITE_PUBLIC_ALIAS) {
  const aliasDir = path.join(outDir, process.env.VITE_PUBLIC_ALIAS);
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.copyFileSync(path.join(outDir, "index.html"), path.join(aliasDir, "index.html"));
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");
}
