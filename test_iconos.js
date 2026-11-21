// Iconos de Lucide en lugar de emojis (interfaz):  node test_iconos.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");
const t = (n) => console.log(`  ✓ ${n}`);

const ctx = vm.createContext({ console });
vm.runInContext(read("js/iconos_data.js") + "\n" + read("js/iconos.js"), ctx);
const run = (c) => vm.runInContext(c, ctx);
const J = (c) => JSON.parse(run(`JSON.stringify(${c})`));

// ── Datos ──
const svg = J("ICONOS_SVG"), mapa = J("ICONOS_MAPA");
Object.entries(mapa).forEach(([e, [icono]]) => assert.ok(svg[icono] && svg[icono].includes("<"), `«${e}» apunta a un icono que no existe: ${icono}`));
Object.keys(mapa).forEach((k) => assert.ok(!k.includes("\uFE0F"), "las claves van sin selector de variación"));
assert.ok(read("js/iconos_data.js").includes("licencia ISC"), "se conserva el aviso de licencia de Lucide");
t(`${Object.keys(svg).length} iconos y ${Object.keys(mapa).length} emojis mapeados, todos consistentes`);

// ── partir(): cada emoji → icono, el texto intacto ──
const P = (s) => J(`ICONOS.partir(${JSON.stringify(s)})`);
assert.deepEqual(P("✅ Hecho"), [{ icono: "circle-check", cls: "" }, { texto: " Hecho" }]);
assert.deepEqual(P("🗑️"), [{ icono: "trash-2", cls: "" }], "con selector de variación (U+FE0F)");
assert.deepEqual(P("🗑"), [{ icono: "trash-2", cls: "" }], "y sin él");
assert.deepEqual(P("✔️ y ✔"), [{ icono: "check", cls: "" }, { texto: " y " }, { icono: "check", cls: "" }]);
assert.deepEqual(P("🟢 Activo"), [{ icono: "circle", cls: "ic-dot ic-ok" }, { texto: " Activo" }], "los puntos de estado llevan clase");
assert.deepEqual(P("Sin emojis"), [{ texto: "Sin emojis" }]);
assert.deepEqual(P("a🎉b"), [{ texto: "a🎉b" }], "un emoji que no está en el mapa se deja como está");
assert.deepEqual(P("📊📈"), [{ icono: "chart-column", cls: "" }, { icono: "trending-up", cls: "" }]);
t("partir(): emojis con/sin U+FE0F, varios seguidos, clases y emojis no mapeados");

// ── omitido(): qué no se convierte ──
const el = (nodeName, { cls = [], attrs = [], parent = null } = {}) => ({ nodeType: 1, nodeName, parentNode: parent,
  classList: { contains: (c) => cls.includes(c) }, hasAttribute: (a) => attrs.includes(a) });
const body = el("BODY");

const O = (n) => { ctx.__n = n; return run("ICONOS.omitido(__n)"); };
assert.equal(O(el("P", { parent: body })), false);
assert.equal(O(el("BUTTON", { parent: body })), false);
for (const tag of ["OPTION", "TEXTAREA", "SCRIPT", "STYLE", "INPUT", "SELECT", "CANVAS", "svg"]) assert.equal(O(el(tag, { parent: body })), true, tag);
assert.equal(O(el("SPAN", { cls: ["keep-emoji"], parent: body })), true, "keep-emoji");
assert.equal(O(el("B", { parent: el("DIV", { attrs: ["data-keep-emoji"], parent: body }) })), true, "hereda de un ancestro con data-keep-emoji");
assert.equal(O(el("SMALL", { parent: el("TD", { cls: ["keep-emoji"], parent: body }) })), true, "hereda keep-emoji");
t("omitido(): option, textarea, input, script, canvas… y todo lo marcado keep-emoji (también por herencia)");

// ── Que los lugares donde se pintan emojis del USUARIO estén protegidos ──
const protegidos = [
  ["js/categorias.js", 'caract-chip-mini keep-emoji'], ["js/categorias.js", '<span class="keep-emoji">${escapeHTML(c.emoji)}'],
  ["js/categorias.js", 'catalog-card-emoji keep-emoji'], ["js/categorias.js", 'filter-chip keep-emoji'],
  ["js/expositores.js", 'card-category keep-emoji'], ["js/expositores.js", '<td class="keep-emoji">${escapeHTML(catName)}'],
  ["js/plantillas.js", 'card-category keep-emoji'], ["js/plantillas.js", '<small class="keep-emoji">'],
  ["js/metricas.js", '<strong class="keep-emoji">${r.cat.emoji}'], ["js/modales.js", '<span class="keep-emoji">${escapeHTML(c.emoji)}'],
  ["index.html", 'id="modal-caracteristicas-list" class="subcategory-popup-list keep-emoji"'], ["index.html", 'class="emoji-picker keep-emoji" id="emoji-picker"'],
  ["js/pdf.js", 'data-keep-emoji'], ["js/eventos.js", 'data-keep-emoji'],
];
protegidos.forEach(([f, s]) => assert.ok(read(f).includes(s), `${f}: falta proteger → ${s}`));
t("los emojis que elige el usuario (selector, categorías, características) y los PDF están protegidos");

// ── Cableado ──
const html = read("index.html");
assert.ok(html.indexOf("js/iconos_data.js") < html.indexOf("js/iconos.js") && html.indexOf("js/iconos.js") < html.indexOf("js/init.js"), "orden: datos → motor → init");
assert.ok(html.includes('href="iconos.css"'));
assert.ok(read("sw.js").includes("js/iconos.js") && read("sw.js").includes("js/iconos_data.js") && read("sw.js").includes("iconos.css"), "disponible sin conexión");
const css = read("iconos.css"); assert.equal(css.split("{").length, css.split("}").length);
t("index.html y el service worker cargan los iconos (también sin conexión)");
console.log("\nTODO OK");
