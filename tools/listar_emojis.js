#!/usr/bin/env node
/**
 * BAZARIX — tools/listar_emojis.js
 * Lista TODOS los emojis (y los símbolos que se usan como icono, ej. ✕ ✓ ↗ ▾) que aparecen en la interfaz:
 * index.html, js/*.js y los .css. Sirve de inventario para sustituirlos por una librería de iconos.
 *
 * Uso:   node tools/listar_emojis.js [carpeta-del-proyecto]      (o doble clic a listar_emojis.cmd en Windows)
 * Crea:  emojis_lista.md          resumen por emoji (cuántas veces, dónde, de qué tipo)
 *        emojis_ubicaciones.csv   una fila por aparición: archivo, línea, emoji, texto (ábrelo en Excel)
 *
 * Se ignoran los comentarios (// … /* … *​/ <!-- … -->) porque no se ven en pantalla. Es una heurística:
 * una línea rara puede colarse o faltar; revisa el CSV antes de reemplazar a ciegas.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const SKIP_JS = new Set(["team_core.js"]);   // servidor (copia de Core.gs): sin interfaz

// Emoji real (se ve a color) · símbolo de texto usado como icono
const PICTO = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?|[\u{1F3FB}-\u{1F3FF}])*)/u;
const SYMBOL = /[\u2190-\u21FF\u25A0-\u25FF\u2700-\u27BF\uFF0B]/u;
const SCAN = new RegExp(`(${PICTO.source})|(${SYMBOL.source})`, "gu");

function kindOf(token) {
  if (token.includes("\uFE0F") || /\p{Emoji_Presentation}/u.test(token) || token.includes("\u200D") || token.includes("\u20E3")) return "emoji";
  return "simbolo";
}

function files() {
  const out = [];
  const add = (f) => { if (fs.existsSync(path.join(root, f))) out.push(f); };
  add("index.html");
  fs.readdirSync(root).filter((f) => f.endsWith(".css")).sort().forEach((f) => out.push(f));
  const js = path.join(root, "js");
  if (fs.existsSync(js)) fs.readdirSync(js).filter((f) => f.endsWith(".js") && !SKIP_JS.has(f)).sort().forEach((f) => out.push(`js/${f}`));
  return out;
}

/** Devuelve las líneas con los comentarios sustituidos por espacios (se conserva la numeración). */
function stripComments(file, text) {
  const ext = path.extname(file);
  let lines = text.split(/\r?\n/);
  if (ext === ".html") {
    text = text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));   // comentarios HTML y /* */ de <script>/<style>
    return text.split(/\r?\n/);
  }
  let inBlock = false;
  return lines.map((line) => {
    let out = "", i = 0;
    while (i < line.length) {
      if (inBlock) { const end = line.indexOf("*/", i); if (end < 0) { out += " ".repeat(line.length - i); i = line.length; } else { out += " ".repeat(end + 2 - i); i = end + 2; inBlock = false; } continue; }
      const rest = line.slice(i);
      if (rest.startsWith("/*") && !/^\/\*+\//.test(rest) ) { inBlock = true; out += "  "; i += 2; continue; }
      if (ext === ".js" && rest.startsWith("//") && (i === 0 || /\s/.test(line[i - 1]))) {
        const before = line.slice(0, i);
        const balanced = (before.match(/"/g) || []).length % 2 === 0 && (before.match(/`/g) || []).length % 2 === 0 && (before.match(/'/g) || []).length % 2 === 0;
        if (balanced) { out += " ".repeat(line.length - i); break; }
      }
      out += line[i]; i++;
    }
    return out;
  });
}

/** Zona de la interfaz según el archivo y la línea (para saber qué sustituir y cómo). */
function zona(file, line) {
  if (file === "js/emojis.js") return "selector de emojis (lista que elige el usuario)";
  if (file === "js/state.js" && /\bemoji:/.test(line)) return "dato por defecto (categorías / características)";
  if (file.endsWith(".css")) return "estilo (content: de CSS)";
  if (/showToast\(/.test(line)) return "aviso (toast)";
  if (/\bplaceholder=|\bplaceholder:/.test(line)) return "texto de ayuda de un campo";
  if (file === "js/canvas.js" || file === "js/canvas_helpers.js") return /fillText|ctx\./.test(line) ? "dibujo del plano (canvas)" : "interfaz";
  if (file === "js/export_excel.js" || file === "js/pdf.js" || /exportar.*PDF|html2pdf/.test(line)) return "documento exportado";
  return "interfaz";
}

const hits = [];      // { file, line, token, kind, zona, texto }
for (const file of files()) {
  const raw = fs.readFileSync(path.join(root, file), "utf8");
  const original = raw.split(/\r?\n/);
  stripComments(file, raw).forEach((clean, idx) => {
    for (const m of clean.matchAll(SCAN)) {
      const token = m[0];
      const at = m.index;
      const orig = original[idx];
      const from = Math.max(0, at - 36), to = Math.min(orig.length, at + token.length + 44);
      hits.push({ file, line: idx + 1, token, kind: kindOf(token), zona: zona(file, orig), texto: orig.slice(from, to).trim().replace(/\s+/g, " ") });
    }
  });
}

const cp = (t) => [...t].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
const byToken = new Map();
hits.forEach((h) => {
  const e = byToken.get(h.token) || { token: h.token, kind: h.kind, n: 0, files: new Map(), zonas: new Set(), ejemplo: h.texto };
  e.n++; e.files.set(h.file, (e.files.get(h.file) || 0) + 1); e.zonas.add(h.zona); byToken.set(h.token, e);
});
const sorted = [...byToken.values()].sort((a, b) => b.n - a.n || a.token.localeCompare(b.token));
const emojis = sorted.filter((e) => e.kind === "emoji"), simbolos = sorted.filter((e) => e.kind === "simbolo");
const fmtFiles = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} (${n})`).join(", ");
const cell = (s) => String(s).replace(/\|/g, "\\|");

let md = `# Inventario de emojis de BAZARIX\n\nGenerado con \`node tools/listar_emojis.js\` — ${new Date().toLocaleString("es-MX")}\n\n`;
md += `- **Emojis distintos:** ${emojis.length} (${emojis.reduce((s, e) => s + e.n, 0)} apariciones)\n- **Símbolos usados como icono:** ${simbolos.length} (${simbolos.reduce((s, e) => s + e.n, 0)} apariciones)\n- **Archivos revisados:** ${files().length}\n\n`;
md += `> Los comentarios del código se ignoran (no se ven en pantalla). El detalle línea por línea está en \`emojis_ubicaciones.csv\`.\n\n`;
const table = (list) => `| Icono | Código | Veces | Zonas | Dónde (archivo y veces) | Ejemplo |\n|---|---|---:|---|---|---|\n` +
  list.map((e) => `| ${e.token} | ${cp(e.token)} | ${e.n} | ${cell([...e.zonas].join("; "))} | ${cell(fmtFiles(e.files))} | \`${cell(e.ejemplo).replace(/`/g, "'")}\` |`).join("\n") + "\n";
md += `## Emojis\n\n${table(emojis)}\n## Símbolos de texto usados como icono\n\n${table(simbolos)}\n`;
const porArchivo = new Map(); hits.forEach((h) => porArchivo.set(h.file, (porArchivo.get(h.file) || 0) + 1));
md += `\n## Apariciones por archivo\n\n| Archivo | Apariciones |\n|---|---:|\n` + [...porArchivo.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `| ${f} | ${n} |`).join("\n") + "\n";
fs.writeFileSync(path.join(root, "emojis_lista.md"), md, "utf8");

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = "\ufeff" + [["Archivo", "Línea", "Icono", "Código", "Tipo", "Zona", "Texto alrededor"], ...hits.map((h) => [h.file, h.line, h.token, cp(h.token), h.kind === "emoji" ? "emoji" : "símbolo", h.zona, h.texto])]
  .map((r) => r.map(q).join(";")).join("\n");
fs.writeFileSync(path.join(root, "emojis_ubicaciones.csv"), csv, "utf8");

console.log(`Emojis distintos: ${emojis.length} · apariciones: ${emojis.reduce((s, e) => s + e.n, 0)}`);
console.log(`Símbolos-icono distintos: ${simbolos.length} · apariciones: ${simbolos.reduce((s, e) => s + e.n, 0)}`);
console.log("Creados: emojis_lista.md y emojis_ubicaciones.csv en " + root);
