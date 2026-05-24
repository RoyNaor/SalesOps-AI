import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function readFrontendEnvBaseUrl() {
  try {
    const envPath = resolve("frontend/.env.local");
    const content = await readFile(envPath, "utf8");
    const line = content
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith("VITE_API_BASE_URL="));

    return line ? line.split("=").slice(1).join("=").trim() : "";
  } catch {
    return "";
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkHealth(baseUrl) {
  const { response, body } = await request(baseUrl, "/health");
  assert(response.status === 200, `GET /health expected 200, got ${response.status}`);
  assert(body?.status === "ok", "GET /health expected status ok");
  return "GET /health ok";
}

async function checkProtectedRoute(baseUrl, path) {
  const { response } = await request(baseUrl, path);
  assert(response.status === 401, `GET ${path} expected 401, got ${response.status}`);
  return `GET ${path} rejects anonymous`;
}

async function checkSigninValidation(baseUrl) {
  const { response } = await request(baseUrl, "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert(response.status === 400, `POST /auth/signin expected 400, got ${response.status}`);
  return "POST /auth/signin validates empty body";
}

const baseUrl = normalizeBaseUrl(
  process.env.SMOKE_API_BASE_URL || process.env.VITE_API_BASE_URL || (await readFrontendEnvBaseUrl())
);

if (!baseUrl) {
  console.error("Smoke failed: set SMOKE_API_BASE_URL, VITE_API_BASE_URL, or frontend/.env.local.");
  process.exit(1);
}

const checks = [
  () => checkHealth(baseUrl),
  () => checkProtectedRoute(baseUrl, "/personas"),
  () => checkProtectedRoute(baseUrl, "/exam/scenarios"),
  () => checkProtectedRoute(baseUrl, "/dashboard"),
  () => checkSigninValidation(baseUrl)
];

try {
  console.log(`Smoke target: ${baseUrl}`);
  for (const check of checks) {
    console.log(`OK ${await check()}`);
  }
} catch (error) {
  console.error(`Smoke failed: ${error.message}`);
  process.exit(1);
}
