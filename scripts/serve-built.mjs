import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const dashboardPath = path.join(dist, "generated", "dashboard.json");
const host = "0.0.0.0";
const port = Number(process.env.PORT || 5173);
const appUrl = `http://localhost:${port}/sdu_uct_analiz`;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const sendJson = (response, value, statusCode = 200) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
};

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url || "/", `http://${request.headers.host}`)
    .pathname;

  if (requestPath === "/health") {
    sendJson(response, { status: "ok", data_source: "built-local-server" });
    return;
  }

  if (
    requestPath === "/api/dashboard/summary" ||
    requestPath === "/api/meta"
  ) {
    try {
      const payload = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
      sendJson(response, requestPath === "/api/meta" ? payload.meta : payload);
    } catch (error) {
      sendJson(
        response,
        {
          detail:
            error instanceof Error ? error.message : "Dashboard data unavailable",
        },
        503,
      );
    }
    return;
  }

  const relativePath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const candidate = path.resolve(dist, relativePath || "index.html");
  const insideDist =
    candidate === dist || candidate.startsWith(`${dist}${path.sep}`);
  const target =
    insideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(dist, "index.html");
  const extension = path.extname(target).toLowerCase();

  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=3600",
  });
  fs.createReadStream(target).pipe(response);
});

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;

  const command =
    process.platform === "win32"
      ? { file: "cmd.exe", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };

  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Порт ${port} уже занят. Открываю существующее приложение: ${appUrl}`);
    openBrowser(appUrl);
    process.exit(0);
  }
  console.error("Не удалось запустить дашборд:", error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Digital Radar is running at ${appUrl}`);
  openBrowser(appUrl);
});
