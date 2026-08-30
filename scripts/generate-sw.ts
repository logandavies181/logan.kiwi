/**
 * Generate a minimal installable Service Worker per app, scoped to /apps/<name>/
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/generate-sw.ts [appNameOrPath ...]
 *   deno task generate-sw
 *   deno task generate-sw:all
 *
 * For each app in ./apps and ./dist/apps, generates:
 *   apps/<name>/sw.js
 *   dist/apps/<name>/sw.js
 * and patches index.html to register it with correct scope.
 */

const APPS_DIRS = ["apps", "dist/apps"];

function swTemplate(appName: string, precacheUrls: string[] = []): string {
  const scope = `/apps/${appName}/`;
  const precache = precacheUrls.length > 0 ? JSON.stringify(precacheUrls, null, 2) : JSON.stringify([`${scope}`, `${scope}index.html`], null, 2);
  return `// Service Worker for ${appName} — scope ${scope}
// Network-first for built files, precached for offline
const CACHE_NAME = 'pwa-${appName}-v1';
const SCOPE = '${scope}';
const PRECACHE_URLS = ${precache};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Handle scope with and without trailing slash
  const inScope = url.pathname === SCOPE.slice(0, -1) || url.pathname.startsWith(SCOPE);
  if (!inScope) return;

  // Normalize request for scope root without slash
  let request = event.request;
  if (url.pathname === SCOPE.slice(0, -1)) {
    request = new Request(SCOPE, event.request);
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
            if (url.pathname === SCOPE.slice(0, -1)) {
              caches.open(CACHE_NAME).then((c) => c.put(SCOPE, clone.clone()));
            }
          });
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(SCOPE + 'index.html') || caches.match(SCOPE) || caches.match(SCOPE.slice(0, -1));
        }
        return caches.match(event.request);
      }))
  );
});
`;
}

function registrationSnippet(appName: string): string {
  const scope = `/apps/${appName}/`;
  const swPath = `${scope}sw.js`;
  return `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('${swPath}',{scope:'${scope}'}).catch(e=>console.warn('SW failed',e));}</script>`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function patchIndexHtml(indexPath: string, appName: string): Promise<void> {
  if (!await exists(indexPath)) return;
  let html = await Deno.readTextFile(indexPath);
  const scope = `/apps/${appName}/`;
  const snippet = registrationSnippet(appName);

  // If already has serviceWorker registration for this scope, skip
  if (html.includes(`scope:'${scope}'`) || html.includes(`scope: "${scope}"`) || html.includes(`${scope}sw.js`)) {
    // Already registered, ensure it's correct scope (patch old "/" scope if needed)
    // Fix old rummytimer scope "/" -> "/apps/<name>/"
    if (html.includes(`scope: "/"`) || html.includes(`scope:"/"`) || html.includes(`scope: '/'`)) {
      html = html.replace(/scope:\s*["']\/["']/g, `scope: '${scope}'`);
      html = html.replace(/register\(["']sw\.js["']\s*,\s*\{\s*scope:\s*["']\/["']\s*\}/g, `register('${scope}sw.js', {scope: '${scope}'}`);
      await Deno.writeTextFile(indexPath, html);
      console.log(`  patched ${indexPath} scope "/" -> "${scope}"`);
    }
    return;
  }

  // Also check if any serviceWorker registration exists at all
  if (html.includes("serviceWorker")) {
    // Already has some SW registration, don't duplicate but ensure sw.js is referenced
    return;
  }

  // Inject before </body> or </head> if no body
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${snippet}\n</body>`);
  } else if (html.includes("</head>")) {
    html = html.replace("</head>", `${snippet}\n</head>`);
  } else {
    html += `\n${snippet}\n`;
  }
  await Deno.writeTextFile(indexPath, html);
  console.log(`  injected SW registration into ${indexPath}`);
}

async function collectPrecacheUrls(appDir: string, scope: string): Promise<string[]> {
  const urls = new Set<string>([scope, `${scope}index.html`]);
  try {
    for await (const entry of Deno.readDir(appDir)) {
      if (entry.isFile) {
        // Only cache built assets, not sw.js itself to avoid cache loop during install
        if (entry.name === "sw.js") continue;
        urls.add(`${scope}${entry.name}`);
      }
    }
  } catch { /* ignore */ }
  // Ensure core files are present even if not listed (defensive)
  for (const core of ["manifest.json", "output.css", "main.js", "favicon.svg", "hex.svg", "index.html"]) {
    if (await exists(`${appDir}/${core}`)) urls.add(`${scope}${core}`);
  }
  // Also include any hashed JS like index-*.js
  try {
    for await (const entry of Deno.readDir(appDir)) {
      if (entry.isFile && entry.name.startsWith("index-") && entry.name.endsWith(".js")) {
        urls.add(`${scope}${entry.name}`);
      }
    }
  } catch { /* ignore */ }
  return [...urls].sort();
}

async function generateForApp(appName: string): Promise<void> {
  const scope = `/apps/${appName}/`;

  for (const base of APPS_DIRS) {
    const appDir = `${base}/${appName}`;
    if (!await exists(appDir)) continue;

    const precache = await collectPrecacheUrls(appDir, scope);
    const swContent = swTemplate(appName, precache);
    const swPath = `${appDir}/sw.js`;
    await Deno.writeTextFile(swPath, swContent);
    console.log(`✓ ${swPath} (scope ${scope}, precache ${precache.length} urls)`);

    // Patch index.html
    await patchIndexHtml(`${appDir}/index.html`, appName);

    // Also ensure manifest scope is correct (defensive, scope-manifest also does this)
    const manifestPath = `${appDir}/manifest.json`;
    if (await exists(manifestPath)) {
      try {
        const raw = await Deno.readTextFile(manifestPath);
        const m = JSON.parse(raw);
        let changed = false;
        if (m.scope !== scope) { m.scope = scope; changed = true; }
        if (m.start_url !== scope) { m.start_url = scope; changed = true; }
        if (m.id !== scope) { m.id = scope; changed = true; }
        if (changed) {
          await Deno.writeTextFile(manifestPath, JSON.stringify(m, null, 2) + "\n");
          console.log(`  ✓ scoped ${manifestPath} -> ${scope}`);
        }
      } catch { /* ignore */ }
    }
  }
}

async function collectApps(): Promise<string[]> {
  const ids = new Set<string>();
  for (const base of APPS_DIRS) {
    try {
      for await (const entry of Deno.readDir(base)) {
        if (entry.isDirectory) ids.add(entry.name);
        // Ignore .gitkeep etc.
        if (entry.name.startsWith(".")) ids.delete(entry.name);
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  // Filter out files that are not app dirs (like .gitkeep)
  return [...ids].filter((id) => !id.startsWith(".")).sort();
}

if (import.meta.main) {
  const args = Deno.args.filter((a) => !a.startsWith("-"));
  let apps: string[];
  if (args.length > 0) {
    // Allow "apps/rummytimer" or "rummytimer" or "dist/apps/rummytimer"
    apps = args.map((a) => a.split("/").filter(Boolean).pop()!);
  } else {
    apps = await collectApps();
  }

  if (apps.length === 0) {
    console.warn("No apps found in ./apps or ./dist/apps");
    Deno.exit(0);
  }

  console.log(`Generating SW for ${apps.length} apps: ${apps.join(", ")}`);
  for (const app of apps) {
    await generateForApp(app);
  }
}

export { generateForApp, swTemplate };
