#!/usr/bin/env node
/**
 * BAZARIX — tools/generar_iconos.js
 * Genera js/iconos_data.js: los iconos de Lucide (https://lucide.dev, licencia ISC) que usa la interfaz
 * y la tabla emoji → icono. Para cambiar un icono: edita MAPA aquí y vuelve a correrlo.
 *
 * Uso (una vez):  npm install --no-save lucide-static
 *       generar:  node tools/generar_iconos.js [ruta/a/lucide-static]
 * El resultado (js/iconos_data.js) se incluye en el proyecto: la app NO necesita npm ni internet para mostrar los iconos.
 */
const fs = require("node:fs");
const path = require("node:path");

// emoji de la interfaz → [icono de Lucide, clase opcional]
const MAPA = {
  "✅": ["circle-check"], "❌": ["circle-x"], "⚠️": ["triangle-alert"], "ℹ️": ["info"], "🚨": ["siren"],
  "🗑️": ["trash-2"], "✏️": ["pencil"], "✎": ["pencil"], "💾": ["save"], "📝": ["file-pen"], "📋": ["clipboard-list"], "☑️": ["square-check"],
  "➕": ["plus"], "＋": ["plus"], "➖": ["minus"], "✓": ["check"], "✔": ["check"], "✔️": ["check"], "✕": ["x"],
  "🟢": ["circle", "ic-dot ic-ok"], "⚪": ["circle", "ic-dot ic-off"],
  "⏳": ["hourglass"], "⌛": ["hourglass"], "🕒": ["clock"], "🕓": ["clock"], "🕐": ["clock"], "🕘": ["history"],
  "⛔": ["ban"], "🚫": ["ban"], "🔒": ["lock"], "🔓": ["lock-open"], "🔑": ["key-round"], "🛡️": ["shield"], "👑": ["crown"],
  "👥": ["users"], "👤": ["user"], "🙋": ["hand"], "🎭": ["drama"], "👁️": ["eye"],
  "💰": ["coins"], "💵": ["banknote"], "💎": ["gem"], "🧾": ["receipt"], "📈": ["trending-up"], "📊": ["chart-column"],
  "🎪": ["tent"], "🏪": ["store"], "🏠": ["house"], "🏛️": ["landmark"], "🪑": ["armchair"], "🗺️": ["map"], "🎟️": ["ticket"],
  "🏷️": ["tag"], "📦": ["package"], "🛒": ["shopping-cart"], "⭐": ["star"], "✨": ["sparkles"], "⚡": ["zap"], "🎨": ["palette"],
  "📄": ["file-text"], "📗": ["file-spreadsheet"], "📂": ["folder-open"], "🗂️": ["folders"], "🖼️": ["image"], "📷": ["camera"],
  "📥": ["download"], "📤": ["upload"], "🔄": ["refresh-cw"], "↻": ["rotate-cw"], "✂️": ["scissors"],
  "📅": ["calendar"], "📣": ["megaphone"], "📞": ["phone"], "✉️": ["mail"], "🔍": ["search"], "🔎": ["search"],
  "⚙️": ["settings"], "📐": ["ruler"], "🧲": ["magnet"], "🧩": ["puzzle"], "🕸️": ["hexagon"], "🖱️": ["mouse-pointer-click"],
  "↔": ["move-horizontal"], "↔️": ["move-horizontal"], "↕": ["move-vertical"], "↕️": ["move-vertical"],
  "☀️": ["sun"], "🌙": ["moon"], "💻": ["laptop"], "😊": ["smile"],
};

// iconos que se usan directo en el HTML (sin emoji de por medio)
const EXTRA = ["layout-grid", "layout-dashboard", "list", "table"];

const dir = path.resolve(process.argv[2] || "node_modules/lucide-static");
const iconsDir = path.join(dir, "icons");
if (!fs.existsSync(iconsDir)) { console.error(`No encuentro ${iconsDir}. Corre: npm install --no-save lucide-static`); process.exit(1); }
const version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;

const nombres = [...new Set(Object.values(MAPA).map((v) => v[0]).concat(EXTRA))].sort();
const svg = {};
for (const n of nombres) {
  const f = path.join(iconsDir, `${n}.svg`);
  if (!fs.existsSync(f)) { console.error(`El icono «${n}» no existe en Lucide ${version}`); process.exit(1); }
  const m = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(fs.readFileSync(f, "utf8"));
  svg[n] = m[1].replace(/\s+/g, " ").replace(/> </g, "><").trim();
}
const mapa = {};
for (const [e, v] of Object.entries(MAPA)) mapa[e.replace(/\uFE0F/g, "")] = v;   // se compara sin el selector de variación

const out = `/* GENERADO por tools/generar_iconos.js — no editar a mano.
   Iconos: Lucide v${version} (https://lucide.dev) — licencia ISC. */
const ICONOS_SVG = ${JSON.stringify(svg, null, 1)};
const ICONOS_MAPA = ${JSON.stringify(mapa)};
`;
fs.writeFileSync(path.join(__dirname, "..", "js", "iconos_data.js"), out, "utf8");
console.log(`${nombres.length} iconos de Lucide ${version} · ${Object.keys(mapa).length} emojis mapeados → js/iconos_data.js (${(out.length / 1024).toFixed(1)} KB)`);
