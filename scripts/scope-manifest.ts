/**
 * Scope an app's PWA manifest.json to its subdirectory.
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/scope-manifest.ts [appPathOrId ...]
 *   deno task scope-manifest [appPathOrId ...]
 *   deno task scope-manifest:all
 *
 * Examples:
 *   deno run --allow-read --allow-write scripts/scope-manifest.ts apps/counter
 *   deno run --allow-read --allow-write scripts/scope-manifest.ts counter
 *   deno run --allow-read --allow-write scripts/scope-manifest.ts dist/apps/counter/manifest.json
 *   deno run --allow-read --allow-write scripts/scope-manifest.ts        # scopes all in ./apps and ./dist/apps
 *   deno task scope-manifest:all
 *
 * What it does:
 *   - Derives app id from directory basename (e.g., "counter" from "apps/counter")
 *   - Computes expected scope: /apps/<id>/
 *   - Patches manifest.json (or manifest.webmanifest) to set:
 *       scope = "/apps/<id>/"
 *       start_url = "/apps/<id>/"
 *       id = "/apps/<id>/"  (ensures uniqueness)
 *   - Writes back formatted JSON
 *
 * This is intended to be called at build time for apps added at build time,
 * ensuring their manifests are properly scoped to their subdirectory before serving.
 */

function appIdFromPath(p: string): string {
  // Handle file path ending with manifest.json -> get parent dir name
  if (p.endsWith("manifest.json") || p.endsWith("manifest.webmanifest")) {
    const dir = p.slice(0, p.lastIndexOf("/"));
    return dir.split("/").filter(Boolean).pop() ?? dir;
  }
  // Handle directory path like "apps/counter" or "dist/apps/counter"
  const clean = p.replace(/\/$/, "");
  return clean.split("/").filter(Boolean).pop() ?? clean;
}

function manifestPathsForApp(arg: string): string[] {
  // If arg looks like a file, return it directly
  if (arg.endsWith("manifest.json") || arg.endsWith("manifest.webmanifest")) {
    return [arg];
  }
  // If arg contains path separators, treat as directory
  const hasSlash = arg.includes("/");
  if (hasSlash) {
    // Normalize to not have trailing slash
    const dir = arg.replace(/\/$/, "");
    return [
      `${dir}/manifest.json`,
      `${dir}/manifest.webmanifest`,
    ];
  }
  // Bare id like "counter" -> check both source and dist locations
  return [
    `apps/${arg}/manifest.json`,
    `apps/${arg}/manifest.webmanifest`,
    `dist/apps/${arg}/manifest.json`,
    `dist/apps/${arg}/manifest.webmanifest`,
  ];
}

async function patchManifest(manifestPath: string, appId: string): Promise<boolean> {
  const expectedScope = `/apps/${appId}/`;
  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ ${manifestPath}: invalid JSON — ${e}`);
    return false;
  }

  const beforeScope = manifest["scope"];
  const beforeStart = manifest["start_url"];
  const beforeId = manifest["id"];

  let changed = false;

  if (manifest["scope"] !== expectedScope) {
    manifest["scope"] = expectedScope;
    changed = true;
  }
  if (manifest["start_url"] !== expectedScope) {
    manifest["start_url"] = expectedScope;
    changed = true;
  }
  // Also ensure id is scoped (important for PWAs to avoid collisions)
  if (manifest["id"] !== expectedScope) {
    manifest["id"] = expectedScope;
    changed = true;
  }

  if (!changed) {
    console.log(`· ${manifestPath} already scoped to ${expectedScope} (scope=${beforeScope}, start_url=${beforeStart}, id=${beforeId})`);
    return true;
  }

  // Preserve formatting with 2-space indent + trailing newline
  const out = JSON.stringify(manifest, null, 2) + "\n";
  await Deno.writeTextFile(manifestPath, out);
  console.log(`✓ ${manifestPath} → scope/start_url/id = ${expectedScope} (was scope=${String(beforeScope)} start_url=${String(beforeStart)} id=${String(beforeId)})`);
  return true;
}

async function processArg(arg: string): Promise<void> {
  const appId = appIdFromPath(arg);
  const candidates = manifestPathsForApp(arg);
  let found = false;
  for (const p of candidates) {
    const ok = await patchManifest(p, appId);
    if (ok) found = true;
  }
  if (!found) {
    console.warn(`⚠ No manifest found for "${arg}" (tried: ${candidates.join(", ")}) — checked appId="${appId}"`);
  }
}

async function processAll(): Promise<void> {
  const dirs = new Set<string>();

  // Collect app ids from ./apps and ./dist/apps (if exists)
  for (const base of ["apps", "dist/apps"]) {
    try {
      for await (const entry of Deno.readDir(base)) {
        if (entry.isDirectory) dirs.add(entry.name);
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }

  if (dirs.size === 0) {
    console.warn("No apps found in ./apps or ./dist/apps");
    return;
  }

  console.log(`Scoping ${dirs.size} apps: ${[...dirs].sort().join(", ")}`);
  for (const id of [...dirs].sort()) {
    await processArg(id);
  }
}

if (import.meta.main) {
  const args = Deno.args;

  if (args.length === 0) {
    await processAll();
  } else if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(`Usage: deno run --allow-read --allow-write scripts/scope-manifest.ts [appPathOrId ...]

Scopes manifest.json start_url/scope/id to /apps/<id>/

Examples:
  deno run --allow-read --allow-write scripts/scope-manifest.ts
  deno run --allow-read --allow-write scripts/scope-manifest.ts apps/counter
  deno run --allow-read --allow-write scripts/scope-manifest.ts counter dist/apps/todo

If no args, scopes all apps found in ./apps and ./dist/apps`);
  } else {
    for (const arg of args) {
      await processArg(arg);
    }
  }
}
