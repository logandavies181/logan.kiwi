/**
 * Build script for pwaShell — handles a list of app build targets.
 *
 * Each target declares:
 *   - name:    app name (used as subdirectory under ./apps and ./dist/apps, e.g., "rummytimer" -> /apps/rummytimer/)
 *   - src:     folder to build from (absolute or relative path, e.g., "../rummytimer" or "/home/logie/src/rummytimer")
 *   - tailwind: whether to run tailwind cli (externally installed) on the project
 *   - dest?:   optional destination override (defaults to apps/<name> and dist/apps/<name>)
 *
 * Also:
 *   - copies manifest.json from src to destination
 *   - copies any ./public folder from src to destination
 *   - scopes manifest.json to /apps/<name>/ (scope/start_url/id)
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-run scripts/build.ts --config build.config.json
 *   deno run --allow-read --allow-write --allow-run scripts/build.ts --targets '[{"name":"rummytimer","src":"../rummytimer","tailwind":true}]'
 *   deno run --allow-read --allow-write --allow-run scripts/build.ts ../rummytimer rummytimer:true
 *   import { buildTargets } from "./scripts/build.ts"; await buildTargets([...])
 *
 * Build config file example (build.config.json):
 * [
 *   { "name": "rummytimer", "src": "../rummytimer", "tailwind": true },
 *   { "name": "myapp", "src": "./external/myapp", "tailwind": false }
 * ]
 */

export interface BuildTarget {
  /** App name, used as subdirectory under ./apps and ./dist/apps */
  name: string;
  /** Folder to build from (source project root) */
  src: string;
  /** Alternative field name for src */
  folder?: string;
  /** Whether to run tailwind cli (externally installed) */
  tailwind?: boolean;
  /** Alternative for tailwind */
  useTailwind?: boolean;
  /** Optional destination override (defaults to apps/<name> and dist/apps/<name>) */
  dest?: string;
  /** Optional entry file override (defaults to auto-detect index.html / main.ts) */
  entry?: string;
}

function resolveTarget(t: BuildTarget): Required<BuildTarget> & { srcPath: string; destApps: string; destDist: string } {
  const src = (t.src ?? t.folder ?? "").trim();
  if (!t.name) throw new Error(`BuildTarget missing 'name': ${JSON.stringify(t)}`);
  if (!src) throw new Error(`BuildTarget ${t.name} missing 'src'/'folder': ${JSON.stringify(t)}`);
  const tailwind = Boolean(t.tailwind ?? t.useTailwind ?? false);
  const destApps = t.dest ? t.dest.replace(/\/$/, "") : `apps/${t.name}`;
  const destDist = t.dest ? t.dest.replace(/\/$/, "") : `dist/apps/${t.name}`;
  // If dest is explicitly apps/... keep dist as dist/apps/...; if dest is dist/... keep both?
  // Normalize: always ensure both apps/<name> and dist/apps/<name> are populated.
  // If dest is custom and starts with apps/, dist counterpart is dist/apps/<name>; if dist/, apps counterpart is apps/<name>
  let finalDestApps: string;
  let finalDestDist: string;
  if (t.dest) {
    if (t.dest.startsWith("dist/")) {
      finalDestDist = t.dest;
      finalDestApps = t.dest.replace(/^dist\//, "");
    } else if (t.dest.startsWith("apps/")) {
      finalDestApps = t.dest;
      finalDestDist = `dist/${t.dest}`;
    } else {
      finalDestApps = t.dest;
      finalDestDist = t.dest;
    }
  } else {
    finalDestApps = destApps;
    finalDestDist = destDist;
  }
  return {
    name: t.name,
    src,
    folder: src,
    tailwind,
    useTailwind: tailwind,
    dest: t.dest ?? finalDestApps,
    entry: t.entry ?? "",
    srcPath: src,
    destApps: finalDestApps,
    destDist: finalDestDist,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
  await Deno.copyFile(src, dest);
}

async function copyDirRecursive(src: string, dest: string, opts?: { exclude?: string[] }): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    if (opts?.exclude?.includes(entry.name)) continue;
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    if (entry.isDirectory) {
      await copyDirRecursive(s, d, opts);
    } else if (entry.isFile) {
      await copyFile(s, d);
    }
  }
}

async function runCommand(cmd: string, args: string[], opts?: { cwd?: string }): Promise<boolean> {
  try {
    const command = new Deno.Command(cmd, {
      args,
      cwd: opts?.cwd,
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await command.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);
    if (out) console.log(out);
    if (err) console.error(err);
    return code === 0;
  } catch (e) {
    console.warn(`Failed to run ${cmd} ${args.join(" ")}: ${e}`);
    return false;
  }
}

async function runTailwind(src: string, dest: string): Promise<void> {
  // Try externally installed tailwindcss first, then via deno npm
  const destAbs = dest.startsWith("/") ? dest : `${Deno.cwd()}/${dest}`;
  const output = `${destAbs}/output.css`;
  const outputRel = `${dest}/output.css`;
  console.log(`  tailwind: generating ${outputRel} from ${src}`);

  // Ensure dest exists
  await Deno.mkdir(dest, { recursive: true });

  // Try 1: tailwindcss binary (externally installed) — use absolute output, run from src so config is found
  let ok = await runCommand("tailwindcss", ["-o", output], { cwd: src });
  if (ok && await exists(output)) {
    console.log(`  ✓ tailwindcss (binary) -> ${outputRel}`);
    return;
  }

  // Try 2: deno run npm:@tailwindcss/cli (v4 works with just -o)
  const args = ["-o", output];
  console.log(`  trying deno run npm:@tailwindcss/cli ${args.join(" ")} (cwd=${src})`);
  ok = await runCommand("deno", ["run", "-A", "npm:@tailwindcss/cli", ...args], { cwd: src });
  if (ok && await exists(output)) {
    console.log(`  ✓ tailwind via deno npm -> ${output}`);
    return;
  }

  // Fallback: try npx
  ok = await runCommand("npx", ["@tailwindcss/cli", ...args], { cwd: src });
  if (ok && await exists(output)) {
    console.log(`  ✓ tailwind via npx -> ${output}`);
    return;
  }

  console.warn(`  ⚠ tailwind failed for ${src} -> ${output} (tried binary, deno npm, npx). Continuing without tailwind output.`);
}

async function scopeManifest(manifestPath: string, appName: string): Promise<void> {
  const expected = `/apps/${appName}/`;
  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch {
    return;
  }
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    let changed = false;
    if (m["scope"] !== expected) { m["scope"] = expected; changed = true; }
    if (m["start_url"] !== expected) { m["start_url"] = expected; changed = true; }
    if (m["id"] !== expected) { m["id"] = expected; changed = true; }
    if (changed) {
      await Deno.writeTextFile(manifestPath, JSON.stringify(m, null, 2) + "\n");
      console.log(`  ✓ scoped ${manifestPath} -> ${expected}`);
    } else {
      console.log(`  · ${manifestPath} already scoped`);
    }
  } catch (e) {
    console.warn(`  ⚠ failed to scope ${manifestPath}: ${e}`);
  }
}

async function tryBunBuild(src: string, destApps: string, destDist: string): Promise<boolean> {
  // Check if project uses bun (justfile contains bun build or src has bun-like main.ts with esm.sh)
  const justfile = `${src}/justfile`;
  let usesBun = false;
  if (await exists(justfile)) {
    try {
      const jf = await Deno.readTextFile(justfile);
      if (jf.includes("bun build")) usesBun = true;
    } catch { /* ignore */ }
  }
  // Also check if src/dist/<name> exists as prebuilt (harmonies-planner pattern)
  // For harmonies-planner, the built output is at dist/harmonies-planner
  if (!usesBun) {
    // Quick check: if main.ts imports from esm.sh, likely needs bun not deno
    const mainTs = `${src}/main.ts`;
    if (await exists(mainTs)) {
      try {
        const content = await Deno.readTextFile(mainTs);
        if (content.includes("esm.sh")) usesBun = true;
      } catch { /* ignore */ }
    }
  }
  if (!usesBun) return false;

  const cwd = await Deno.realPath(src).catch(() => src);
  const destAppsAbs = destApps.startsWith("/") ? destApps : `${Deno.cwd()}/${destApps}`;
  const destDistAbs = destDist.startsWith("/") ? destDist : `${Deno.cwd()}/${destDist}`;

  console.log(`  trying bun build for ${src} -> ${destApps} (cwd=${cwd})`);
  // Try bun build main.ts --outdir <dest>
  let ok = await runCommand("bun", ["build", "main.ts", "--outdir", destAppsAbs], { cwd });
  if (!ok) {
    console.warn(`  ⚠ bun build main.ts failed for ${src}`);
    return false;
  }
  // Also build sw.ts if exists
  if (await exists(`${src}/sw.ts`)) {
    const okSw = await runCommand("bun", ["build", "sw.ts", "--outdir", destAppsAbs], { cwd });
    if (!okSw) console.warn(`  ⚠ bun build sw.ts failed for ${src}`);
    else console.log(`  ✓ bun built sw.ts -> ${destApps}`);
  }
  console.log(`  ✓ bun built ${src} -> ${destApps}`);
  if (destApps !== destDist) {
    await copyDirRecursive(destApps, destDist);
  }
  return true;
}

async function bundleApp(src: string, destApps: string, destDist: string): Promise<void> {
  // First try bun for projects that need it (e.g., harmonies-planner)
  if (await tryBunBuild(src, destApps, destDist)) {
    // Also handle nested dist case: harmonies-planner's justfile outputs to dist/harmonies-planner
    // If src/dist/<name> exists and dest doesn't have files, copy from there
    const srcDistNested = `${src}/dist/${src.split("/").pop()}`;
    if (await exists(srcDistNested) && !(await exists(`${destApps}/index.html`))) {
      console.log(`  copying prebuilt ${srcDistNested} -> ${destApps}`);
      await copyDirRecursive(srcDistNested, destApps);
      if (destApps !== destDist) await copyDirRecursive(destApps, destDist);
    }
    return;
  }

  // Try to detect entry and run deno bundle. For HTML entry, use --outdir; for JS/TS, use --output.
  const candidates = [
    `${src}/index.html`,
    `${src}/index.htm`,
    `${src}/main.ts`,
    `${src}/main.js`,
    `${src}/src/main.ts`,
    `${src}/src/main.js`,
  ];
  let entry: string | undefined;
  for (const c of candidates) {
    if (await exists(c)) { entry = c; break; }
  }
  if (!entry) {
    console.log(`  no bundle entry found in ${src}, will copy files`);
    // Check for nested prebuilt dist
    const nested = `${src}/dist/${src.split("/").pop()}`;
    if (await exists(nested)) {
      console.log(`  copying prebuilt ${nested} -> ${destApps}`);
      await copyDirRecursive(nested, destApps);
      if (destApps !== destDist) await copyDirRecursive(destApps, destDist);
    }
    return;
  }

  // Resolve absolute paths for outdir to handle cwd correctly (deno bundle resolves imports via cwd)
  const cwd = await Deno.realPath(src).catch(() => src);
  const destAppsAbs = destApps.startsWith("/") ? destApps : `${Deno.cwd()}/${destApps}`;
  const destDistAbs = destDist.startsWith("/") ? destDist : `${Deno.cwd()}/${destDist}`;
  const entryBase = entry.slice(src.length + 1); // relative to src, e.g., "index.html"

  // If entry is HTML, bundle with --outdir
  if (entry.endsWith(".html") || entry.endsWith(".htm")) {
    console.log(`  bundling HTML entry ${entryBase} (cwd=${cwd}) -> ${destApps}`);
    let ok = await runCommand("deno", ["bundle", entryBase, "--outdir", destAppsAbs], { cwd });
    if (!ok) {
      console.warn(`  ⚠ deno bundle failed for ${entry} -> ${destApps}, falling back to copy`);
      // Fallback: copy index.html directly
      try {
        await copyFile(entry, `${destApps}/index.html`);
        await copyFile(entry, `${destDist}/index.html`);
        console.log(`  ↳ copied ${entryBase} as fallback`);
      } catch { /* ignore */ }
    } else {
      console.log(`  ✓ bundled ${entryBase} -> ${destApps}`);
      // Ensure dist also has it (copy from destApps to destDist if different and not already)
      if (destApps !== destDist) {
        await copyDirRecursive(destApps, destDist);
      }
    }
  } else {
    // JS/TS entry - use absolute out file
    const outFile = `${destAppsAbs}/bundle.js`;
    const outFileDist = `${destDistAbs}/bundle.js`;
    console.log(`  bundling JS entry ${entryBase} -> ${outFile} (cwd=${cwd})`);
    const entryRel = entryBase;
    let ok = await runCommand("deno", ["bundle", "--platform", "browser", entryRel, "--output", outFile], { cwd });
    if (!ok) console.warn(`  ⚠ deno bundle failed for ${entry}`);
    else {
      if (destApps !== destDist) {
        await Deno.mkdir(destDist, { recursive: true });
        await copyFile(outFile, outFileDist);
      }
    }
  }
  // Handle nested dist fallback for harmonies-planner style projects
  const srcDistNested = `${src}/dist/${src.split("/").pop()}`;
  if (await exists(srcDistNested)) {
    // If dest is missing expected files, copy from prebuilt
    if (!(await exists(`${destApps}/index.html`)) && await exists(`${srcDistNested}/index.html`)) {
      console.log(`  copying prebuilt fallback ${srcDistNested} -> ${destApps}`);
      await copyDirRecursive(srcDistNested, destApps);
      if (destApps !== destDist) await copyDirRecursive(destApps, destDist);
    }
  }
}

export async function buildTarget(raw: BuildTarget): Promise<void> {
  const t = resolveTarget(raw);
  console.log(`\nBuilding ${t.name} from ${t.srcPath} (tailwind=${t.tailwind}) -> ${t.destApps} / ${t.destDist}`);

  // Validate src exists
  if (!await exists(t.srcPath)) {
    throw new Error(`Source folder not found: ${t.srcPath} for app ${t.name}`);
  }

  // Clean destinations
  for (const d of [t.destApps, t.destDist]) {
    try { await Deno.remove(d, { recursive: true }); } catch { /* ignore */ }
    await Deno.mkdir(d, { recursive: true });
  }

  // 1. Bundle the app (handles index.html or JS entry via deno bundle)
  const hasIndexHtml = await exists(`${t.srcPath}/index.html`);
  const hasMain = await exists(`${t.srcPath}/main.ts`) || await exists(`${t.srcPath}/main.js`);
  if (hasIndexHtml || hasMain) {
    await bundleApp(t.srcPath, t.destApps, t.destDist);
  } else {
    // No bundle entry — copy static assets (index.html etc.) manually, excluding dev files
    console.log(`  no bundle entry, copying static assets from ${t.srcPath}`);
    for await (const entry of Deno.readDir(t.srcPath)) {
      if (["node_modules", ".git", "dist", ".deno", "src"].includes(entry.name)) continue;
      const s = `${t.srcPath}/${entry.name}`;
      const dApps = `${t.destApps}/${entry.name}`;
      const dDist = `${t.destDist}/${entry.name}`;
      if (entry.isDirectory) {
        if (entry.name === "public") continue; // handled separately
        await copyDirRecursive(s, dApps);
        if (t.destApps !== t.destDist) await copyDirRecursive(s, dDist);
      } else if (entry.isFile) {
        if (entry.name === "manifest.json" || entry.name === "manifest.webmanifest") continue; // handled separately
        await copyFile(s, dApps);
        if (t.destApps !== t.destDist) await copyFile(s, dDist);
      }
    }
  }

  // 2. Explicitly ensure manifest.json copied
  for (const d of [t.destApps, t.destDist]) {
    const srcManifest = `${t.srcPath}/manifest.json`;
    const destManifest = `${d}/manifest.json`;
    if (await exists(srcManifest) && !await exists(destManifest)) {
      await copyFile(srcManifest, destManifest);
      console.log(`  copied manifest.json -> ${destManifest}`);
    }
    // Also handle manifest.webmanifest
    const srcWeb = `${t.srcPath}/manifest.webmanifest`;
    const destWeb = `${d}/manifest.webmanifest`;
    if (await exists(srcWeb) && !await exists(destWeb)) {
      await copyFile(srcWeb, destWeb);
      console.log(`  copied manifest.webmanifest -> ${destWeb}`);
    }
  }

  // 4. Copy public folder if exists (spec: any ./public folder into destination)
  for (const d of [t.destApps, t.destDist]) {
    const srcPublic = `${t.srcPath}/public`;
    if (await exists(srcPublic)) {
      console.log(`  copying public/ -> ${d}/`);
      for await (const entry of Deno.readDir(srcPublic)) {
        const s = `${srcPublic}/${entry.name}`;
        const destPath = `${d}/${entry.name}`;
        if (entry.isDirectory) {
          await copyDirRecursive(s, destPath);
        } else {
          await copyFile(s, destPath);
        }
      }
    }
  }

  // 5. Patch index.html to use absolute paths for favicon/manifest/css/js (robust for SPA routes and favicon isolation)
  for (const d of [t.destApps, t.destDist]) {
    const idx = `${d}/index.html`;
    if (await exists(idx)) {
      try {
        let html = await Deno.readTextFile(idx);
        const scope = `/apps/${t.name}/`;
        const orig = html;
        // Make favicon, manifest, css absolute to app scope (handle both favicon.svg and hex.svg)
        html = html.replace(/href="\.\/favicon\.svg"/g, `href="${scope}favicon.svg"`);
        html = html.replace(/href="favicon\.svg"/g, `href="${scope}favicon.svg"`);
        html = html.replace(/href="\.\/hex\.svg"/g, `href="${scope}hex.svg"`);
        html = html.replace(/href="hex\.svg"/g, `href="${scope}hex.svg"`);
        html = html.replace(/href="\.\/output\.css"/g, `href="${scope}output.css"`);
        html = html.replace(/href="output\.css"/g, `href="${scope}output.css"`);
        html = html.replace(/href="\.\/manifest\.json"/g, `href="${scope}manifest.json"`);
        html = html.replace(/href="manifest\.json"/g, `href="${scope}manifest.json"`);
        // JS bundle (bundled HTML uses ./index-*.js, index-*.js, or main.js)
        html = html.replace(/src="\.\/index-/g, `src="${scope}index-`);
        html = html.replace(/src="index-/g, `src="${scope}index-`);
        html = html.replace(/src="\.\/main\.js"/g, `src="${scope}main.js"`);
        html = html.replace(/src="main\.js"/g, `src="${scope}main.js"`);
        // Also handle favicon.ico if present
        html = html.replace(/href="favicon\.ico"/g, `href="${scope}favicon.svg"`);
        html = html.replace(/href="\.\/favicon\.ico"/g, `href="${scope}favicon.svg"`);
        if (html !== orig) {
          await Deno.writeTextFile(idx, html);
          console.log(`  patched ${idx} favicon/manifest/css/js to absolute ${scope}`);
        }
      } catch (e) {
        console.warn(`  ⚠ failed to patch ${idx}: ${e}`);
      }
    }
  }

  // 6. Run tailwind if requested
  if (t.tailwind) {
    for (const d of [t.destApps, t.destDist]) {
      await runTailwind(t.srcPath, d);
    }
  } else {
    console.log(`  tailwind skipped for ${t.name}`);
  }

  // 7. Scope manifest.json to subdirectory
  for (const d of [t.destApps, t.destDist]) {
    await scopeManifest(`${d}/manifest.json`, t.name);
    await scopeManifest(`${d}/manifest.webmanifest`, t.name);
  }

  // 8. Generate service worker per app (adheres to manifest scope)
  for (const d of [t.destApps, t.destDist]) {
    await generateServiceWorker(d, t.name);
    await patchIndexHtmlForSW(`${d}/index.html`, t.name);
    await patchJsForSW(d, t.name);
  }

  console.log(`✓ Built ${t.name} -> ${t.destApps} / ${t.destDist}`);
}

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

async function collectPrecacheUrls(dest: string, scope: string): Promise<string[]> {
  const urls = new Set<string>([scope, `${scope}index.html`]);
  try {
    for await (const entry of Deno.readDir(dest)) {
      if (entry.isFile) {
        if (entry.name === "sw.js") continue;
        urls.add(`${scope}${entry.name}`);
      }
    }
  } catch { /* ignore */ }
  for (const core of ["manifest.json", "output.css", "main.js", "favicon.svg", "hex.svg", "index.html"]) {
    if (await exists(`${dest}/${core}`)) urls.add(`${scope}${core}`);
  }
  try {
    for await (const entry of Deno.readDir(dest)) {
      if (entry.isFile && entry.name.startsWith("index-") && entry.name.endsWith(".js")) {
        urls.add(`${scope}${entry.name}`);
      }
    }
  } catch { /* ignore */ }
  return [...urls].sort();
}

async function generateServiceWorker(dest: string, appName: string): Promise<void> {
  const scope = `/apps/${appName}/`;
  const precache = await collectPrecacheUrls(dest, scope);
  const content = swTemplate(appName, precache);
  const swPath = `${dest}/sw.js`;
  await Deno.writeTextFile(swPath, content);
  console.log(`  generated ${swPath} (scope ${scope}, precache ${precache.length} urls)`);
}

async function patchIndexHtmlForSW(indexPath: string, appName: string): Promise<void> {
  if (!await exists(indexPath)) return;
  let html = await Deno.readTextFile(indexPath);
  const scope = `/apps/${appName}/`;
  const swUrl = `${scope}sw.js`;
  // If already has correct registration, skip (and fix old "/" scope)
  if (html.includes(`scope: '${scope}'`) || html.includes(`scope:"${scope}"`) || html.includes(swUrl)) {
    // Fix old "/" scope if present (e.g., rummytimer's main.ts had scope "/")
    if (html.includes(`scope: "/"`) || html.includes(`scope: '/'`)) {
      html = html.replace(/scope:\s*["']\/["']/g, `scope: '${scope}'`);
      await Deno.writeTextFile(indexPath, html);
      console.log(`  patched ${indexPath} scope "/" -> "${scope}"`);
    }
    return;
  }
  // Check if any serviceWorker registration already exists in HTML (not just JS bundle)
  // We inject a small registration snippet before </body>
  const snippet = `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('${swUrl}',{scope:'${scope}'}).catch(e=>console.warn('SW failed',e));}</script>`;
  if (html.includes("serviceWorker") && !html.includes(swUrl)) {
    // Already has some SW registration (maybe in JS), don't duplicate in HTML but ensure sw.js exists
    return;
  }
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${snippet}\n</body>`);
  } else if (html.includes("</head>")) {
    html = html.replace("</head>", `${snippet}\n</head>`);
  } else {
    html += `\n${snippet}\n`;
  }
  await Deno.writeTextFile(indexPath, html);
  console.log(`  injected SW registration into ${indexPath} -> ${swUrl}`);
}

async function patchJsForSW(dest: string, appName: string): Promise<void> {
  const scope = `/apps/${appName}/`;
  try {
    for await (const entry of Deno.readDir(dest)) {
      if (entry.isFile && entry.name.endsWith(".js")) {
        const p = `${dest}/${entry.name}`;
        let text = await Deno.readTextFile(p);
        const orig = text;
        // Fix any serviceWorker.register with wrong scope (e.g., "/" or "/harmonies-planner/" or "/rummytimer/")
        // Handles: register("sw.js", { scope: "/" }), register("sw.js", { scope: "/harmonies-planner/" }), etc.
        // Replace any scope that is not the expected one
        text = text.replace(/register\(\s*["']sw\.js["']\s*,\s*\{\s*scope:\s*["'][^"']*["']\s*\}/g, `register('${scope}sw.js', {scope: '${scope}'}`);
        text = text.replace(/register\(\s*["']\/sw\.js["']\s*,\s*\{\s*scope:\s*["'][^"']*["']\s*\}/g, `register('${scope}sw.js', {scope: '${scope}'}`);
        text = text.replace(/register\(\s*["']\.?\/sw\.js["']\s*\)/g, `register('${scope}sw.js', {scope: '${scope}'})`);
        // Also handle register with just sw.js and scope without quotes? Be generic
        if (text !== orig) {
          await Deno.writeTextFile(p, text);
          console.log(`  patched ${p} SW scope -> "${scope}"`);
        }
      }
    }
  } catch { /* ignore */ }
}

export async function buildTargets(targets: BuildTarget[]): Promise<void> {
  if (!Array.isArray(targets)) throw new Error("buildTargets expects an array of BuildTarget objects");
  if (targets.length === 0) {
    console.log("No build targets provided, skipping app builds");
    return;
  }
  console.log(`Building ${targets.length} targets: ${targets.map((t) => t.name).join(", ")}`);
  for (const t of targets) {
    await buildTarget(t);
  }
  // After building all apps, regenerate shell manifest, re-scope manifests and generate SWs
  console.log("\nRegenerating apps.json manifest...");
  await runCommand("deno", ["run", "--allow-read", "--allow-write", "scripts/generate-manifest.ts"]);
  await runCommand("deno", ["run", "--allow-read", "--allow-write", "scripts/scope-manifest.ts"]);
  await runCommand("deno", ["run", "--allow-read", "--allow-write", "scripts/generate-sw.ts"]);
}

// CLI handling
if (import.meta.main) {
  const args = Deno.args;
  let targets: BuildTarget[] | undefined;

  // --config <path> or --targets <json>
  const configIdx = args.indexOf("--config");
  if (configIdx !== -1 && args[configIdx + 1]) {
    const cfgPath = args[configIdx + 1];
    const text = await Deno.readTextFile(cfgPath);
    targets = JSON.parse(text);
    console.log(`Loaded ${targets!.length} targets from ${cfgPath}`);
  } else {
    const targetsIdx = args.indexOf("--targets");
    if (targetsIdx !== -1 && args[targetsIdx + 1]) {
      targets = JSON.parse(args[targetsIdx + 1]);
    } else if (args.length === 1 && args[0].endsWith(".json")) {
      const text = await Deno.readTextFile(args[0]);
      targets = JSON.parse(text);
    } else if (args.length > 0 && args[0].startsWith("[")) {
      targets = JSON.parse(args[0]);
    } else if (args.length > 0) {
      // Shorthand: each arg is name:src[:tailwind]  e.g., rummytimer:../rummytimer:true
      targets = args.filter((a) => !a.startsWith("-")).map((a) => {
        const [name, src, tw] = a.split(":");
        return { name, src: src ?? ".", tailwind: tw === "true" || tw === "1" };
      });
    }
  }

  // Fallback: check for default config files
  if (!targets) {
    const defaults = ["build.config.json", "apps.config.json", "apps.json"];
    for (const p of defaults) {
      if (await exists(p)) {
        try {
          const text = await Deno.readTextFile(p);
          const parsed = JSON.parse(text);
          // Support both { apps: [...] } and [...] formats
          targets = Array.isArray(parsed) ? parsed : parsed.apps ?? parsed.targets;
          if (targets) {
            console.log(`Using default config ${p} with ${targets.length} targets`);
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Final fallback: example with rummytimer if no config and file exists
  if (!targets) {
    if (await exists("../rummytimer") || await exists("/home/logie/src/rummytimer")) {
      const guessedSrc = await exists("/home/logie/src/rummytimer") ? "/home/logie/src/rummytimer" : "../rummytimer";
      console.log(`No config provided, using fallback target for rummytimer at ${guessedSrc}`);
      targets = [{ name: "rummytimer", src: guessedSrc, tailwind: true }];
    } else {
      console.log("No targets specified and no default config found. Skipping app builds.");
      targets = [];
    }
  }

  await buildTargets(targets!);
}
