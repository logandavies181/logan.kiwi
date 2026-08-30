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

function swTemplate(appName: string): string {
  const scope = `/apps/${appName}/`;
  return `// Service Worker for ${appName} — scope ${scope}
// Minimal installable SW: adheres to manifest scope
const CACHE_NAME = 'pwa-${appName}-v1';
const SCOPE = '${scope}';

self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle requests within scope
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(SCOPE)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Optionally cache successful GETs
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
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

async function generateForApp(appName: string): Promise<void> {
  const scope = `/apps/${appName}/`;
  const swContent = swTemplate(appName);

  for (const base of APPS_DIRS) {
    const appDir = `${base}/${appName}`;
    if (!await exists(appDir)) continue;

    const swPath = `${appDir}/sw.js`;
    await Deno.writeTextFile(swPath, swContent);
    console.log(`✓ ${swPath} (scope ${scope})`);

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
