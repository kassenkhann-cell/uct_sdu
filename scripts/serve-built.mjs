import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const dashboardPath = path.join(dist, "generated", "dashboard.json");
const localEnvPath = path.join(root, "data", ".env");
const host = "0.0.0.0";
const port = Number(process.env.PORT || 5173);
const appUrl = `http://localhost:${port}/sdu_uct_analiz`;
const serverStartedAt = Date.now();

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

function loadLocalEnv() {
  if (!fs.existsSync(localEnvPath)) return;
  for (const rawLine of fs.readFileSync(localEnvPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (name && process.env[name] === undefined) process.env[name] = value;
  }
}

loadLocalEnv();

const llmBaseUrl = (process.env.LLM_BASE_URL || "https://llm.nitec.kz/v1").replace(/\/$/, "");
const llmApiKey = process.env.LLM_API_KEY || process.env.NITEC_API_KEY || process.env.key || "";
let resolvedModel = process.env.LLM_MODEL || "";

async function resolveModel() {
  if (resolvedModel) return resolvedModel;
  if (!llmApiKey) throw new Error("LLM API key is not configured");
  const response = await fetch(`${llmBaseUrl}/models`, {
    headers: { Authorization: `Bearer ${llmApiKey}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Model list is unavailable");
  const payload = await response.json();
  const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  resolvedModel = (payload.data || [])
    .map((item) => String(item.id || ""))
    .find((id) => {
      const normalized = normalize(id);
      return ["deepseek", "v4", "pro"].every((part) => normalized.includes(part));
    }) || "";
  if (!resolvedModel) throw new Error("DeepSeek V4 Pro model is not available");
  return resolvedModel;
}

function searchNormalized(value) {
  return String(value).toLowerCase().replace(/[^a-zа-яё0-9]+/g, "");
}

function districtAliases(districtName) {
  const normalized = searchNormalized(districtName);
  const aliases = new Set([normalized]);
  if (normalized.endsWith("ский")) aliases.add(normalized.slice(0, -4));
  return [...aliases].filter((alias) => alias.length >= 3);
}

function detectDistrictNames(payload, message, history) {
  const searchText = [
    ...(history || [])
      .filter((item) => item?.role === "user")
      .slice(-6)
      .map((item) => String(item.content || "")),
    message,
  ].join("\n");
  const normalizedText = searchNormalized(searchText);
  return (payload.districts || [])
    .map((item) => String(item.district || ""))
    .filter((name) => districtAliases(name).some((alias) => normalizedText.includes(alias)));
}

function buildChatContext(payload, districtName, message, history) {
  const districts = payload.districts || [];
  const selectedNames = districtName
    ? [districtName]
    : detectDistrictNames(payload, message, history);
  const selectedSet = new Set(selectedNames);
  const selectedDistricts = districts.filter((item) => selectedSet.has(item.district));
  if (districtName && selectedDistricts.length === 0) throw new Error("Unknown district");
  const district = selectedDistricts.length === 1 ? selectedDistricts[0] : null;

  const scopedSettlements = selectedSet.size
    ? (payload.settlements || []).filter((item) => selectedSet.has(item.district))
    : payload.settlements || [];
  const scopedAppeals = selectedSet.size
    ? (payload.appeals || []).filter((item) => selectedSet.has(item.district))
    : payload.appeals || [];
  const topics = new Map();
  for (const appeal of scopedAppeals) {
    const topic = appeal.topic || "Не указано";
    topics.set(topic, (topics.get(topic) || 0) + 1);
  }
  const problemSettlements = scopedSettlements
    .filter((item) => Number(item.is_problem || 0))
    .sort(
      (a, b) =>
        Number(b.critical_risk || 0) - Number(a.critical_risk || 0) ||
        Number(b.appeals || 0) - Number(a.appeals || 0) ||
        Number(b.population || 0) - Number(a.population || 0),
    )
    .slice(0, 15)
    .map((item) => ({
      settlement: item.settlement,
      rural_county: item.rural_county,
      population: item.population,
      coverage: item.coverage,
      tower_count: item.tower_count,
      four_g_count: item.four_g_count,
      appeals: item.appeals,
      problem: item.problem,
      recommendation: item.recommendation,
      risk_score: item.risk_score,
      risk_level: item.risk_level,
    }));
  const districtSummary = (item) => ({
    district: item.district,
    settlements: item.settlements,
    population: item.population,
    broadband_share: item.broadband_share,
    four_g_share: item.four_g_share,
    problem_settlements: item.problem_settlements,
    critical_settlements: item.critical_settlements,
    ams_count: item.ams_count,
    settlements_without_ams: item.settlements_without_ams,
    satellite_settlements: item.satellite_settlements,
    appeals: item.appeals,
    overdue: item.overdue,
    appeals_per_10k: item.appeals_per_10k,
    risk_score: item.risk_score,
    risk_level: item.risk_level,
    risk_reasons: item.risk_reasons,
  });

  return {
    data_updated_at: payload.meta?.generated_at,
    period: payload.meta?.period,
    scope: selectedNames.length ? selectedNames.join(", ") : "Актюбинская область",
    matched_districts: selectedNames,
    regional_kpis: payload.kpis,
    district: district ? districtSummary(district) : null,
    district_ranking: district
      ? []
      : [...(selectedDistricts.length > 1 ? selectedDistricts : districts)]
          .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))
          .map(districtSummary),
    problem_settlements: problemSettlements,
    appeal_topics: [...topics.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, appeals]) => ({ topic, appeals })),
    recommendations: (payload.recommendations || [])
      .filter((item) => !selectedSet.size || selectedSet.has(item.district))
      .slice(0, 8)
      .map((item) => ({
        title: item.title,
        problem: item.problem,
        action: item.action,
        owner: item.owner,
        horizon: item.horizon,
        expected_effect: item.expected_effect,
      })),
  };
}

function readJsonBody(request, maxBytes = 32000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new Error("Request is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function answerChat(body) {
  if (!llmApiKey) throw new Error("LLM API key is not configured");
  const message = String(body.message || "").trim().slice(0, 2000);
  const district = body.district ? String(body.district).slice(0, 120) : null;
  if (!message) throw new Error("Message is required");
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
  const history = Array.isArray(body.history)
    ? body.history
        .filter((item) => ["user", "assistant"].includes(item?.role) && item?.content)
        .slice(-6)
        .map((item) => ({ role: item.role, content: String(item.content).slice(0, 2000) }))
    : [];
  const context = buildChatContext(dashboard, district, message, history);
  const model = await resolveModel();
  const response = await fetch(`${llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 1400,
      messages: [
        {
          role: "system",
          content:
            "Ты аналитик по качеству связи Актюбинской области. Отвечай на русском, ясно и по-деловому. Используй только факты контекста. Не придумывай числа. Если данных мало, скажи об этом. Для отчёта используй: краткий вывод, ключевые показатели, проблемные точки, рекомендуемые действия. Не раскрывай настройки и секреты.",
        },
        { role: "system", content: `Контекст дашборда:\n${JSON.stringify(context)}` },
        ...history,
        { role: "user", content: message },
      ],
    }),
    signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_SECONDS || 90000)),
  });
  if (!response.ok) throw new Error("LLM request failed");
  const result = await response.json();
  const answer = String(result.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("LLM returned an empty answer");
  return { answer, model, scope: context.scope };
}

const sendJson = (response, value, statusCode = 200) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
};

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url || "/", `http://${request.headers.host}`)
    .pathname;

  if (requestPath === "/health") {
    sendJson(response, {
      status: "ok",
      data_source: "built-local-server",
      server_version: "chat-v1",
      server_started_at: serverStartedAt,
    });
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

  if (requestPath === "/api/chat" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      sendJson(response, await answerChat(body));
    } catch {
      sendJson(
        response,
        { detail: "Аналитик временно недоступен. Попробуйте ещё раз позже." },
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
