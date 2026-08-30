async function loadApps() {
  try {
    const res = await fetch("./apps.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.apps ?? [];
  } catch (e) {
    console.warn("Failed to load apps.json:", e);
    return [];
  }
}

async function getAppIconUrl(app) {
  // Try to fetch manifest to get icon, fallback to known filenames
  const base = app.path; // e.g., /apps/rummytimer/
  const candidates = ["favicon.svg", "hex.svg", "icon.svg", "icon.png"];
  // First try manifest
  try {
    const res = await fetch(`${base}manifest.json`);
    if (res.ok) {
      const manifest = await res.json();
      if (manifest.icons && manifest.icons.length > 0) {
        const src = manifest.icons[0].src;
        // Resolve relative to base
        if (src.startsWith("/")) return src;
        if (src.startsWith("./")) return base + src.slice(2);
        return base + src;
      }
    }
  } catch { /* ignore */ }
  // Fallback: try known filenames via HEAD check is expensive, just return first candidate
  // We'll let <img> handle 404 fallback via onerror
  return base + candidates[0];
}

function createAppCard(app, iconUrl) {
  const a = document.createElement("a");
  a.href = app.path;
  a.className = "app-card";
  a.setAttribute("data-app-id", app.id);
  a.title = app.description || app.name;

  const img = document.createElement("img");
  img.className = "app-icon";
  img.src = iconUrl;
  img.alt = `${app.name} icon`;
  img.loading = "lazy";
  // Fallback if first icon fails
  img.onerror = () => {
    // Try alternative icons
    const fallbacks = ["hex.svg", "favicon.svg", "icon.svg"];
    const current = img.src.split("/").pop();
    const idx = fallbacks.indexOf(current);
    if (idx !== -1 && idx + 1 < fallbacks.length) {
      img.src = app.path + fallbacks[idx + 1];
    } else if (!img.src.endsWith("favicon.svg")) {
      img.src = app.path + "favicon.svg";
    }
  };

  const textWrap = document.createElement("div");
  textWrap.className = "app-text";

  const name = document.createElement("span");
  name.className = "app-name";
  name.textContent = app.name;

  const desc = document.createElement("small");
  desc.className = "app-desc";
  desc.textContent = app.description || "";

  textWrap.append(name, desc);
  a.append(img, textWrap);
  return a;
}

async function init() {
  const appEl = document.getElementById("app");
  if (!appEl) return;

  // Apps section - vertical list, no splash title
  const appsSection = document.createElement("section");
  appsSection.className = "apps-section";

  const appsNav = document.createElement("nav");
  appsNav.className = "apps-nav";
  appsNav.setAttribute("aria-label", "Hosted applications");

  const loading = document.createElement("p");
  loading.textContent = "Loading apps...";
  loading.className = "apps-loading";
  appsNav.appendChild(loading);

  appsSection.append(appsNav);

  appEl.append(appsSection);

  // Load and render apps vertically with favicons
  const apps = await loadApps();
  appsNav.innerHTML = "";

  if (apps.length === 0) {
    const empty = document.createElement("p");
    empty.className = "apps-empty";
    empty.textContent = "No apps available.";
    appsNav.appendChild(empty);
  } else {
    for (const appData of apps) {
      const iconUrl = await getAppIconUrl(appData);
      const card = createAppCard(appData, iconUrl);
      appsNav.appendChild(card);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
