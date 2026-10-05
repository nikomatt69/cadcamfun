// Stub sidecar used until the real sidecar (apps/sidecar, WP4) exists. It follows the
// process contract of specs/05-api-sidecar.md section 1: Bearer-protected HTTP on
// 127.0.0.1 with an OS-assigned port, one JSON ready line on stdout, exit on stdin EOF.
//
// Test hooks (stub only): STUB_NO_READY=1 never prints the ready line (timeout path),
// STUB_CRASH_AFTER_MS=<n> exits with code 1 that long after becoming ready.
import { timingSafeEqual } from "node:crypto";

const token = process.env.CADCAMFUN_TOKEN;
if (!token) {
  console.log(JSON.stringify({ event: "error", message: "CADCAMFUN_TOKEN is required" }));
  process.exit(1);
}

// Same origins the real sidecar allows (specs/05 section 1) plus the Vite dev origin.
const allowedOrigins = new Set(["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type, if-match",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "origin",
  };
}

function authorized(request: Request): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (!authorized(request)) return json(request, { _tag: "Unauthorized", message: "Missing or invalid token" }, 401);
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/health") return json(request, { status: "ok", stub: true });
    if (request.method === "GET" && pathname === "/version") return json(request, { version: "stub" });
    return json(request, { _tag: "NotFound", message: `No route for ${pathname}` }, 404);
  },
});

function shutdown(code: number): never {
  server.stop(true);
  process.exit(code);
}

// The shell closes our stdin when it exits (or dies): that is the signal to stop.
process.stdin.on("end", () => shutdown(0));
process.stdin.on("close", () => shutdown(0));
process.stdin.resume();
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

if (!process.env.STUB_NO_READY) {
  console.log(JSON.stringify({ event: "ready", port: server.port }));
}
const crashAfter = Number(process.env.STUB_CRASH_AFTER_MS);
if (Number.isFinite(crashAfter) && crashAfter > 0) setTimeout(() => process.exit(1), crashAfter);
