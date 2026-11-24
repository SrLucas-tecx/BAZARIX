// Vistas Compacta / Lista / «Ver más» de Expositores:  node test_vistas.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");
const t = (n) => console.log(`  ✓ ${n}`);

const ls = {}, els = {}, opened = [], closed = [];
const mkEl = (id) => { const cls = new Set(); return (els[id] = { id, innerHTML: "", textContent: "", value: "", hidden: false, style: {},
  classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) } }); };
const ctx = vm.createContext({
  console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true }, window: { addEventListener() {} },
  localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
  document: { hidden: false, addEventListener() {}, getElementById: (id) => els[id] || mkEl(id), querySelectorAll: () => [], body: { classList: { contains: () => false } } },
  showToast() {}, appConfirm: async () => true,
});
["storage.js", "team_core.js", "state.js", "sync_rows.js", "utils.js", "responsables.js", "evento_ficha.js", "eventos.js", "mesas.js", "categorias.js", "modales.js", "ui.js", "historial.js", "expositores.js"]
  .forEach((f) => vm.runInContext(read(`js/${f}`), ctx, { filename: f }));
vm.runInContext(`openModal = (id) => { __open.push(id); els_open(id, true); }; closeModal = (id) => { __closed.push(id); els_open(id, false); };`, Object.assign(ctx, { __open: opened, __closed: closed, els_open: (id, on) => (els[id] || mkEl(id)).classList.toggle("open", on) }));
const run = (c) => vm.runInContext(c, ctx);
run("function renderAll() { renderExpositores(); }");   // las acciones repintan; aquí solo importa Expositores
const J = (c) => JSON.parse(run(`JSON.stringify(${c})`));

run(`AppState.bazaars.b1 = { id: "b1", name: "Bazar", expositores: [], floors: [], tareas: [], compras: [], invitados: [], minuteByMinute: [], costsConfig: emptyCostsConfig(), evento: emptyEvento(), mesasMigradas: true };
  AppState.currentBazaarId = "b1"; migrateState(AppState);
  AppState.bazaars.b1.expositores.push(
    { id: "e1", nombre: "Ana <b>", negocio: "Velas & Co", categoria: "cat-1", costo: 250, adelanto: 0, pagado: false, banned: false, checklist: [], historial: [], publicationStatus: "pendiente" },
    { id: "e2", nombre: "Beto", negocio: "Café", categoria: "", costo: 100, adelanto: 0, pagado: true, banned: true, checklist: [], historial: [], publicationStatus: "lista" });
  migrateState(AppState);`);
const grid = () => els["expositores-grid"];

// Vista guardada
run(`AppState.expositorView = "compact"; migrateState(AppState)`);
assert.equal(run("AppState.expositorView"), "compact", "la vista «compacta» sobrevive a la migración");
run(`AppState.expositorView = "otra"; migrateState(AppState)`);
assert.equal(run("AppState.expositorView"), "cards", "una vista desconocida vuelve a Tarjetas");
t("la vista elegida se conserva y una inválida vuelve a Tarjetas");

// Tarjetas completas: sin cambios
run(`setExpositorView("cards")`);
assert.ok(grid().innerHTML.includes("Marcar Pagado") && grid().innerHTML.includes("Recibo") && !grid().innerHTML.includes("exp-mini"));
assert.ok(!grid().classList.contains("is-compact-view") && !grid().classList.contains("is-list-view"));
t("Tarjetas: igual que antes (acciones completas)");

// Compacta
run(`setExpositorView("compact")`);
let h = grid().innerHTML;
assert.equal(h.split('<div class="exp-mini ').length - 1, 2, "una tarjeta compacta por expositor");
for (const s of ["Velas &amp; Co", "Ana &lt;b&gt; · 🎨 Artesanías", "Beto · Sin Categoría", "$250.00", "Ver más", "openExpositorDetalle('e1')", "openModalExpositor('e1')", "Ubicación", "Costo total", "Saldo", "Pagado", "Pendiente", "Baneado"]) assert.ok(h.includes(s), `compacta: falta ${s}`);
assert.ok(grid().classList.contains("is-compact-view") && !grid().classList.contains("is-list-view"));
assert.ok(!h.includes("Marcar Pagado"), "la compacta no trae los botones pesados");
t("Compacta: nombre, subtítulo, 3 datos, «Ver más» y lápiz; todo escapado");

// Lista
run(`setExpositorView("list")`);
assert.ok(grid().classList.contains("is-list-view") && !grid().classList.contains("is-compact-view"));
assert.equal(grid().innerHTML.split('<div class="exp-mini ').length - 1, 2);
t("Lista: mismas filas con la clase de lista");

// Filtros y búsqueda aplican a las nuevas vistas
run(`AppState.filterStatus = "paid"; renderExpositores()`);
assert.equal(grid().innerHTML.split('<div class="exp-mini ').length - 1, 1, "el filtro de pago también filtra la lista");
run(`AppState.filterStatus = "all"; AppState.searchQuery = "zzz"; renderExpositores()`);
assert.ok(grid().innerHTML.includes("Sin resultados"), "sin coincidencias: estado vacío");
run(`AppState.searchQuery = ""; renderExpositores()`);
t("filtros y búsqueda funcionan igual en las vistas nuevas");

// Tabla sigue igual
run(`setExpositorView("table")`);
assert.ok(grid().innerHTML.includes("expositor-directory-table") && !grid().classList.contains("is-list-view"));
t("Tabla: sin cambios y quita las clases de lista/compacta");

// «Ver más»
run(`setExpositorView("compact"); openExpositorDetalle("e1")`);
assert.deepEqual(opened.slice(-1), ["modal-expositor-detalle"]);
let d = els["expositor-detalle-body"].innerHTML;
assert.ok(d.includes("Marcar Pagado") && d.includes("Recibo") && d.includes("Velas &amp; Co") && els["expositor-detalle-title"].textContent === "Velas & Co", "«Ver más» muestra la tarjeta completa con todas sus acciones");
run(`togglePaymentStatus("e1")`);   // la acción redibuja y la ventana abierta se actualiza sola
d = els["expositor-detalle-body"].innerHTML;
assert.ok(d.includes("Marcar Pendiente") && !d.includes("Marcar Pagado"), "tras marcar pagado, «Ver más» ya muestra el estado nuevo");
run(`deleteExpositor("e1")`);

setTimeout(() => {
  assert.ok(closed.includes("modal-expositor-detalle"), "si el expositor se elimina, «Ver más» se cierra solo");
  t("«Ver más»: tarjeta completa, se mantiene al día y se cierra si el expositor desaparece");

  // Cableado
  const html = read("index.html");
  assert.ok(html.indexOf('id="modal-expositor-detalle"') < html.indexOf('id="modal-expositor"'), "«Ver más» va antes del editor para que éste se abra encima");
  for (const v of ["cards", "compact", "list", "table"]) assert.ok(html.includes(`data-view="${v}"`), `botón de vista ${v}`);
  assert.ok(html.includes('href="vistas.css"') && !html.includes("botones.css"), "vistas.css cargado; botones.css ya no");
  assert.ok(read("sw.js").includes("vistas.css") && !read("sw.js").includes("botones.css"));
  const css = read("vistas.css"); assert.equal(css.split("{").length, css.split("}").length);
  assert.ok(/#ic-layout-grid/.test(html) && /#ic-table/.test(html), "los botones de vista usan los iconos del sprite");
  const data = read("js/iconos_data.js");
  ["layout-grid", "layout-dashboard", "list", "table"].forEach((n) => assert.ok(data.includes(`"${n}":`), `icono ${n} en el sprite`));
  t("index.html, service worker e iconos de los botones de vista conectados");
  console.log("\nTODO OK");
}, 10);
