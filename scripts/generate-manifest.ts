/**
 * Generates dist/apps.json manifest by scanning ./apps subdirectories.
 * Allows shell to dynamically render buttons for each hosted app.
 */
const appsDir = "./apps";
const outPath = "./dist/apps.json";

interface AppMeta {
  id: string;
  name: string;
  description: string;
  path: string;
}

async function getAppMeta(id: string): Promise<AppMeta> {
  const base: AppMeta = {
    id,
    name: id,
    description: "",
    path: `/apps/${id}/`,
  };

  // Try to read optional apps/<id>/app.json metadata
  try {
    const metaRaw = await Deno.readTextFile(`${appsDir}/${id}/app.json`);
    const meta = JSON.parse(metaRaw);
    if (meta.name) base.name = meta.name;
    if (meta.description) base.description = meta.description;
  } catch {
    // no app.json, fallback to pretty name from id or title parsing
    base.name = id.charAt(0).toUpperCase() + id.slice(1);
    // Try to extract <title> from index.html as description fallback
    try {
      const html = await Deno.readTextFile(`${appsDir}/${id}/index.html`);
      const m = html.match(/<title>(.*?)<\/title>/i);
      if (m) base.name = m[1];
    } catch {
      // ignore
    }
  }
  return base;
}

try {
  const apps: AppMeta[] = [];
  for await (const entry of Deno.readDir(appsDir)) {
    if (entry.isDirectory) {
      const meta = await getAppMeta(entry.name);
      apps.push(meta);
    }
  }
  apps.sort((a, b) => a.id.localeCompare(b.id));

  const manifest = { apps, generatedAt: new Date().toISOString() };
  await Deno.mkdir("./dist", { recursive: true });
  await Deno.writeTextFile(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Generated ${outPath} with ${apps.length} apps: ${apps.map((a) => a.id).join(", ")}`);
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    console.log(`No ${appsDir} directory found, writing empty manifest`);
    await Deno.mkdir("./dist", { recursive: true });
    await Deno.writeTextFile(outPath, JSON.stringify({ apps: [] }, null, 2));
  } else {
    console.error("Failed to generate manifest:", e);
    Deno.exit(1);
  }
}
