const PORT = 8080;
const DIST_DIR = "./dist";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".map": "application/json",
};

function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname);

  // Normalize path: serve index.html for root
  if (pathname === "/") pathname = "/index.html";

  // Prevent directory traversal
  const safePath = pathname.replace(/\.\./g, "");
  const filePath = `${DIST_DIR}${safePath}`;

  try {
    const stat = await Deno.stat(filePath);
    if (stat.isDirectory) {
      // Redirect directory without trailing slash to with slash for correct relative asset resolution (favicons, etc.)
      if (!pathname.endsWith("/")) {
        const url = new URL(req.url);
        return Response.redirect(`${url.origin}${pathname}/`, 301);
      }
      // Try serving index.html inside directory
      const indexPath = `${filePath}/index.html`;
      const data = await Deno.readFile(indexPath);
      return new Response(data, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const data = await Deno.readFile(filePath);
    const headers: Record<string, string> = {
      "content-type": contentType(filePath),
    };
    // For service workers, allow the scope to match manifest (e.g., /apps/<name>/)
    if (filePath.endsWith("/sw.js") || filePath.endsWith("/serviceworker.js") || filePath.endsWith("/service-worker.js")) {
      // Derive scope from file path: dist/apps/<name>/sw.js -> /apps/<name>/
      const match = filePath.match(/\/apps\/([^/]+)\/sw\.js$/);
      if (match) {
        headers["Service-Worker-Allowed"] = `/apps/${match[1]}/`;
      } else if (pathname === "/sw.js") {
        headers["Service-Worker-Allowed"] = "/";
      }
      headers["Cache-Control"] = "no-cache";
    }
    return new Response(data, {
      headers,
    });
  } catch {
    // Favicon fallback: browsers request /favicon.ico even when we serve SVG
    if (pathname === "/favicon.ico" || pathname === "/favicon.svg") {
      for (const cand of [`${DIST_DIR}/favicon.svg`, `${DIST_DIR}/favicon.ico`]) {
        try {
          const data = await Deno.readFile(cand);
          return new Response(data, {
            headers: { "content-type": contentType(cand) },
          });
        } catch { /* try next */ }
      }
    }

    const isAppsPath = pathname.startsWith("/apps/");
    const isAppsJson = pathname === "/apps.json";

    // For single-page apps hosted in ./apps/<id>/ subdirectories:
    // extension-less routes like /apps/<id>/settings should serve that app's index.html (SPA fallback)
    if (isAppsPath && !pathname.includes(".")) {
      const parts = pathname.split("/").filter(Boolean);
      // parts = ["apps", "<id>", ...]
      if (parts.length >= 2) {
        const appId = parts[1];
        try {
          const appIndex = await Deno.readFile(`${DIST_DIR}/apps/${appId}/index.html`);
          return new Response(appIndex, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        } catch {
          // app index not found -> 404
        }
      }
      return new Response("Not Found", { status: 404 });
    }

    // SPA fallback for shell routes (top-level) — not for apps
    if (!isAppsPath && !isAppsJson && !pathname.includes(".")) {
      try {
        const indexData = await Deno.readFile(`${DIST_DIR}/index.html`);
        return new Response(indexData, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch {
        // ignore
      }
    }
    return new Response("Not Found", { status: 404 });
  }
});

console.log(`Serving ${DIST_DIR} at http://localhost:${PORT}`);
