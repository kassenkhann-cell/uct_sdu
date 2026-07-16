import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeName = "sdu_uct_analiz";
const appUrl = `http://localhost:5173/${routeName}`;
const healthUrl = "http://localhost:5173/health";
const distIndex = path.join(root, "frontend", "dist", "index.html");
const logsDir = path.join(root, "logs");

function getLanAddress() {
  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) =>
      (addresses || []).map((address) => ({ name, ...address })),
    )
    .filter(
      (address) =>
        address.family === "IPv4" &&
        !address.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address),
    )
    .sort((left, right) => {
      const virtual = /virtual|vethernet|docker|wsl|vmware|virtualbox|loopback/i;
      return Number(virtual.test(left.name)) - Number(virtual.test(right.name));
    });
  return candidates[0]?.address || "";
}

function writeShareLinks() {
  const lanAddress = getLanAddress();
  if (!lanAddress) return "";
  const shareUrl = `http://${lanAddress}:5173/${routeName}`;
  fs.writeFileSync(
    path.join(root, `${routeName}.url`),
    `[InternetShortcut]\r\nURL=${shareUrl}\r\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, `${routeName}.txt`),
    `${shareUrl}\r\n\r\nСсылка работает для коллег в той же локальной сети, пока этот компьютер включён и дашборд запущен.\r\n`,
    "utf8",
  );
  return shareUrl;
}

function newestMtime(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (stat.isFile()) return stat.mtimeMs;
  return fs.readdirSync(target, { withFileTypes: true }).reduce((latest, entry) => {
    if (["derived", "dist", "node_modules"].includes(entry.name)) return latest;
    return Math.max(latest, newestMtime(path.join(target, entry.name)));
  }, stat.mtimeMs);
}

function needsBuild() {
  if (!fs.existsSync(distIndex)) return true;
  const builtAt = fs.statSync(distIndex).mtimeMs;
  const inputs = [
    path.join(root, "data"),
    path.join(root, "frontend", "src"),
    path.join(root, "frontend", "index.html"),
    path.join(root, "scripts", "prepare-data.mjs"),
    path.join(root, "scripts", "build-frontend.mjs"),
    path.join(root, "package.json"),
    path.join(root, "package-lock.json"),
    path.join(root, "vite.config.ts"),
  ];
  return inputs.some((target) => newestMtime(target) > builtAt);
}

async function isReady() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.status === "ok";
  } catch {
    return false;
  }
}

function openBrowser() {
  if (process.env.NO_BROWSER === "1") return;
  const child = spawn("cmd.exe", ["/c", "start", "", appUrl], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

let didBuild = false;

if (needsBuild()) {
  console.log("Обновляем данные и интерфейс. Это нужно только после изменений...");
  const build = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (build.status !== 0) process.exit(build.status || 1);
  didBuild = true;
}

if (didBuild && process.env.SKIP_PUBLISH !== "1") {
  console.log("Публикуем проверенные данные на общей ссылке...");
  const publish = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish-dashboard.mjs"), "--skip-build"],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  if (publish.status !== 0) {
    console.warn("Общая ссылка пока не обновилась, но локальная версия будет открыта.");
  }
}

if (!(await isReady())) {
  fs.mkdirSync(logsDir, { recursive: true });
  const stdout = fs.openSync(path.join(logsDir, "dashboard_stdout.log"), "a");
  const stderr = fs.openSync(path.join(logsDir, "dashboard_stderr.log"), "a");
  const server = spawn(process.execPath, [path.join(root, "scripts", "serve-built.mjs")], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
    env: { ...process.env, NO_OPEN: "1" },
  });
  server.unref();

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await isReady()) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    console.error("Не удалось открыть дашборд. Подробности находятся в logs/dashboard_stderr.log");
    process.exit(1);
  }
}

const shareUrl = writeShareLinks();
openBrowser();
console.log(`Дашборд открыт: ${appUrl}`);
if (shareUrl) console.log(`Ссылка для коллег: ${shareUrl}`);
