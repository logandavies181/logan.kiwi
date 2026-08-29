import { greet } from "./greet.js";

async function loadApps() {
  try {
    const res = await fetch("./apps.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.apps ?? [];
  } catch (e) {
    console.warn("Failed to load apps.json:", e);
    // No hardcoded apps — apps are provided at build time in ./apps.
    // Return empty list so shell shows "No apps" state instead of fake buttons.
    return [];
  }
}

function createAppButton(app) {
  // Use anchor styled as button to link to subdirectory hosting the app
  const a = document.createElement("a");
  a.href = app.path;
  a.className = "app-button";
  a.setAttribute("data-app-id", app.id);
  a.textContent = app.name;
  a.title = app.description || app.name;
  return a;
}

async function init() {
  const app = document.getElementById("app");
  if (!app) return;

  const h1 = document.createElement("h1");
  h1.textContent = greet("Deno");

  const p = document.createElement("p");
  p.textContent = "Vanilla JS + Deno bundle — edit src/main.js and run deno task build.";

  const btn = document.createElement("button");
  btn.textContent = "Click me";
  btn.addEventListener("click", () => {
    btn.textContent = `Clicked at ${new Date().toLocaleTimeString()}`;
  });

  // Shell navigation to hosted apps in ./apps subdirectories
  const appsSection = document.createElement("section");
  appsSection.className = "apps-section";
  const appsHeading = document.createElement("h2");
  appsHeading.textContent = "Apps";
  const appsDesc = document.createElement("p");
  appsDesc.textContent = "Applications hosted in subdirectories of ./apps:";
  appsDesc.className = "apps-desc";
  const appsNav = document.createElement("nav");
  appsNav.className = "apps-nav";
  appsNav.setAttribute("aria-label", "Hosted applications");

  const loading = document.createElement("p");
  loading.textContent = "Loading apps...";
  loading.className = "apps-loading";
  appsNav.appendChild(loading);
  appsSection.append(appsHeading, appsDesc, appsNav);

  app.append(h1, p, btn, appsSection);
  console.log("App initialized");

  // Load and render app buttons
  const apps = await loadApps();
  appsNav.innerHTML = "";
  if (apps.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No apps found in ./apps. Add a subdirectory with an index.html to create one.";
    appsNav.appendChild(empty);
  } else {
    for (const a of apps) {
      const link = createAppButton(a);
      // Optionally show description below button as card
      const card = document.createElement("div");
      card.className = "app-card";
      const desc = document.createElement("small");
      desc.textContent = a.description;
      card.append(link, desc);
      appsNav.appendChild(card);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
