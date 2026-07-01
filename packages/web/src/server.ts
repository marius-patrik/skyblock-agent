import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ServeWebOptions = {
  host?: string;
  port?: number;
  distDir?: string;
};

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function defaultDistDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
}

function safeJoin(root: string, requestPath: string) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, "");
  const target = path.join(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function responseFromFile(filePath: string) {
  const headers = new Headers();
  headers.set("content-type", MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream");
  headers.set("cache-control", filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  return new Response(Bun.file(filePath), { headers });
}

export function serveWeb(options: ServeWebOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 18473;
  const distDir = options.distDir ?? defaultDistDir();
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`SkyAgent web bundle is missing at ${distDir}. Run 'bun run --cwd packages/web build' before serving.`);
  }

  return Bun.serve({
    hostname: host,
    port,
    fetch(request) {
      const url = new URL(request.url);
      const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = safeJoin(distDir, requestPath);
      if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return responseFromFile(filePath);
      }
      return responseFromFile(path.join(distDir, "index.html"));
    },
  });
}

function parseArg(name: string, fallback: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

if (import.meta.main) {
  const host = parseArg("host", "127.0.0.1");
  const port = Number(parseArg("port", "18473"));
  const server = serveWeb({ host, port });
  console.log(`SkyAgent web listening on http://${server.hostname}:${server.port}`);
}
