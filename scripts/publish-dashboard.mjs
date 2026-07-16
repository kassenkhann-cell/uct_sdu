import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = "frontend/public/generated/dashboard.json";
const skipBuild = process.argv.includes("--skip-build");
const windowsGit = "C:\\Program Files\\Git\\cmd\\git.exe";
const git = process.env.GIT_EXE || (fs.existsSync(windowsGit) ? windowsGit : "git");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    windowsHide: true,
  });
}

if (!skipBuild) {
  const build = run("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"]);
  if (build.status !== 0) process.exit(build.status || 1);
}

const repo = run(git, ["rev-parse", "--is-inside-work-tree"], { capture: true });
if (repo.status !== 0) {
  console.warn("Публикация пропущена: папка не подключена к GitHub.");
  process.exit(0);
}

const add = run(git, ["add", "--", dataFile]);
if (add.status !== 0) process.exit(add.status || 1);

const changed = run(git, ["diff", "--cached", "--quiet", "--", dataFile], {
  capture: true,
});
if (changed.status === 0) {
  console.log("На общей ссылке уже опубликованы актуальные данные.");
  process.exit(0);
}
if (changed.status !== 1) process.exit(changed.status || 1);

const timestamp = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  hour12: false,
}).format(new Date());
const commit = run(git, [
  "commit",
  "-m",
  `Обновление данных дашборда ${timestamp}`,
  "--",
  dataFile,
]);
if (commit.status !== 0) process.exit(commit.status || 1);

const push = run(git, ["push", "origin", "main"]);
if (push.status !== 0) {
  console.warn("Локальный дашборд обновлён, но отправка на общую ссылку не удалась.");
  process.exit(push.status || 1);
}

console.log("Новые данные отправлены на общую ссылку. Обновление займёт около минуты.");
