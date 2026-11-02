/**
 * BAZARIX — categorias.js
 * Catálogos globales (compartidos entre bazares), independientes entre sí:
 *  - CATEGORÍAS: clasifican al expositor (una por expositor) y alimentan las gráficas.
 *  - CARACTERÍSTICAS: etiquetas extra del negocio (hecho a mano, vegano…). Un expositor
 *    puede tener varias. No tienen gráfica propia. Antes se llamaban "subcategorías".
 * Las categorías ya NO tienen subcategorías.
 *
 * Datos: AppState.categorias      = [{ id, nombre, emoji, color, descripcion }]
 *        AppState.caracteristicas = [{ id, nombre, emoji, color, descripcion }]
 *        expositor.caracteristicas / plantilla.caracteristicas = [id, ...]
 * Dependencias: state.js, utils.js, modales.js (openModal/closeModal), dialogs.js
 */

let categoriaManagementTab = "categoria";   // "categoria" | "caracteristica"

const CATALOG_TEXT = {
  categoria: {
    nueva: "Nueva categoría", editar: "Editar categoría", creada: "✅ Categoría creada", actualizada: "✅ Categoría actualizada",
    nombrePh: "Ej. Artesanías", descPh: "Ej. Productos hechos a mano y artesanías.",
    hint: "Clasifica al expositor: cada expositor tiene una sola categoría y aparece en las gráficas."
  },
  caracteristica: {
    nueva: "Nueva característica", editar: "Editar característica", creada: "✅ Característica creada", actualizada: "✅ Característica actualizada",
    nombrePh: "Ej. Hecho a mano", descPh: "Ej. Productos elaborados artesanalmente.",
    hint: "Etiqueta extra del negocio (vegano, hecho a mano…). Un expositor puede tener varias y no genera gráfica."
  }
};

// ==========================================
// LECTURA / HELPERS
// ==========================================
function getCategoriasPrincipales() {
  return AppState.categorias;
}

function getCaracteristicas() {
  return AppState.caracteristicas || [];
}

/** Solo la categoría (ya no hay subcategoría). */
function getExpositorCategoryLabel(item) {
  const category = AppState.categorias.find((c) => c.id === item?.categoria);
  return category ? `${category.emoji} ${category.nombre}` : "Sin Categoría";
}

/** Características del expositor (o plantilla) que todavía existen en el catálogo. */
function getExpositorCaracteristicas(item) {
  const ids = Array.isArray(item?.caracteristicas) ? item.caracteristicas : [];
  const catalog = getCaracteristicas();
  return ids.map((id) => catalog.find((c) => c.id === id)).filter(Boolean);
}

/**
 * Fila compacta para tarjetas y tablas: máximo `max` chips + "Ver todas".
 * Si no hay características devuelve "" (no deja espacio vacío).
 * kind: "exp" (expositor del bazar activo) | "plt" (expositor guardado).
 */
function caracteristicasChipsHTML(item, kind = "exp", max = 2) {
  const list = getExpositorCaracteristicas(item);
  if (!list.length) return "";
  const chips = list.slice(0, max).map((c) =>
    `<span class="caract-chip-mini" style="--chip-color:${escapeHTML(c.color)}" title="${escapeHTML(c.descripcion || c.nombre)}">${escapeHTML(c.emoji)} ${escapeHTML(c.nombre)}</span>`
  ).join("");
  const more = list.length > max
    ? `<button type="button" class="link-inline caract-more" onclick="openCaracteristicas('${kind}','${escapeHTML(item.id)}')">Ver todas (${list.length})</button>`
    : "";
  return `<div class="caract-row">${chips}${more}</div>`;
}

/** Ventana con TODAS las características de un expositor. */
function openCaracteristicas(kind, id) {
  const item = kind === "plt"
    ? AppState.expositorPlantillas.find((p) => p.id === id)
    : getActiveBazaar()?.expositores.find((e) => e.id === id);
  if (!item) return;
  const list = getExpositorCaracteristicas(item);
  document.getElementById("modal-caracteristicas-title").textContent = `Características de ${item.negocio}`;
  document.getElementById("modal-caracteristicas-list").innerHTML = list.length
    ? list.map((c) => `
        <div class="subcategory-popup-row" style="border-left:4px solid ${escapeHTML(c.color)};">
          <span>${escapeHTML(c.emoji)} <strong>${escapeHTML(c.nombre)}</strong></span>
          ${c.descripcion ? `<small class="form-hint" style="margin:0;">${escapeHTML(c.descripcion)}</small>` : ""}
        </div>`).join("")
    : `<p class="form-hint">Este expositor no tiene características.</p>`;
  openModal("modal-caracteristicas");
}

// ==========================================
// PANTALLA CATÁLOGOS
// ==========================================
function setCategoriaManagementTab(tab) {
  categoriaManagementTab = tab === "caracteristica" ? "caracteristica" : "categoria";
  renderCategorias();
}

function renderCategorias() {
  const container = document.getElementById("categorias-grid");
  if (!container) return;
  const isCar = categoriaManagementTab === "caracteristica";

  const addButton = document.getElementById("category-add-btn");
  if (addButton) addButton.textContent = isCar ? "+ Nueva característica" : "+ Nueva categoría";
  [["categoria", "category-tab-categoria"], ["caracteristica", "category-tab-caracteristica"]].forEach(([tab, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const on = tab === categoriaManagementTab;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  });

  const list = isCar ? getCaracteristicas() : AppState.categorias;
  if (!list.length) {
    container.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">${isCar ? "🧩" : "🏷️"}</span>
        <h3>${isCar ? "Sin características" : "Sin categorías"}</h3>
        <p>${isCar
          ? "Crea características (ej. vegano, hecho a mano) para asignarlas a tus expositores."
          : "Crea una categoría para empezar a clasificar a tus expositores."}</p>
      </div>`;
    return;
  }

  const search = (document.getElementById("catalog-search")?.value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  const sortedList = [...list]
    .filter((item) => {
      const searchableText = `${item.nombre || ""} ${item.descripcion || ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es");
      return searchableText.includes(search);
    })
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }));

  if (!sortedList.length) {
    container.innerHTML = `<div class="catalog-empty"><p>No se encontraron resultados para “${escapeHTML(search)}”.</p></div>`;
    return;
  }

  const bazaars = Object.values(AppState.bazaars || {});
  container.innerHTML = sortedList.map((item) => {
    const total = bazaars.reduce((n, bz) => n + (bz.expositores || []).filter((e) =>
      isCar ? (e.caracteristicas || []).includes(item.id) : e.categoria === item.id).length, 0);
    const del = isCar ? `deleteCaracteristica('${item.id}')` : `deleteCategoria('${item.id}')`;
    return `
      <div class="catalog-card" style="--cat-color:${escapeHTML(item.color)};">
        <div class="catalog-card-head">
          <span class="catalog-card-emoji" aria-hidden="true">${escapeHTML(item.emoji)}</span>
          <div class="catalog-card-title">
            <strong>${escapeHTML(item.nombre)}</strong>
            ${item.descripcion ? `<small>${escapeHTML(item.descripcion)}</small>` : ""}
          </div>
          <span class="catalog-card-count">${total} expositor${total === 1 ? "" : "es"}</span>
        </div>
        <div class="catalog-card-actions">
          <button class="btn-secondary btn-sm" onclick="openModalCategoria('${item.id}')">✏️ Editar</button>
          <button class="btn-danger btn-sm" onclick="${del}">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join("");
}

/** Agrega las categorías o características sugeridas que aún no existen (compara por nombre). */
async function addSuggestedCatalog() {
  const isCar = categoriaManagementTab === "caracteristica";
  if (isCar && !Array.isArray(AppState.caracteristicas)) AppState.caracteristicas = [];
  const list = isCar ? AppState.caracteristicas : AppState.categorias;
  const faltan = (isCar ? DEFAULT_STATE.caracteristicas : DEFAULT_STATE.categorias)
    .filter((item) => !list.some((x) => String(x.nombre).trim().toLowerCase() === item.nombre.toLowerCase()));
  if (!faltan.length) {
    showToast("Ya tienes todas las sugeridas");
    return;
  }
  const tipo = isCar ? "características" : "categorías";
  if (!await appConfirm(`Se agregarán ${faltan.length} ${tipo} sugeridas que aún no tienes. No se cambia ni se borra nada de lo que ya existe.`, "Agregar sugeridas", "Agregar")) return;
  faltan.forEach((item) => list.push({ ...item, id: list.some((x) => x.id === item.id) ? `${item.id}-${Date.now()}` : item.id }));
  saveState();
  renderAll();
  showToast(`✅ ${faltan.length} ${tipo} agregadas`);
}

// ==========================================
// MODAL: crear / editar (categoría o característica)
// ==========================================
function _findCatalogItem(id) {
  const cat = AppState.categorias.find((c) => c.id === id);
  if (cat) return { item: cat, kind: "categoria" };
  const car = getCaracteristicas().find((c) => c.id === id);
  return car ? { item: car, kind: "caracteristica" } : null;
}

function openModalCategoria(id = null, kind = null) {
  document.getElementById("form-categoria").reset();
  const found = id ? _findCatalogItem(id) : null;
  if (id && !found) return;
  const currentKind = found ? found.kind : (kind || (categoriaManagementTab === "caracteristica" ? "caracteristica" : "categoria"));
  const text = CATALOG_TEXT[currentKind];

  document.getElementById("cat-id").value = found ? found.item.id : "";
  document.getElementById("cat-tipo").value = currentKind;
  document.getElementById("modal-cat-title").textContent = found ? text.editar : text.nueva;
  document.getElementById("cat-type-hint").textContent = text.hint;
  document.getElementById("cat-nombre").placeholder = text.nombrePh;
  document.getElementById("cat-descripcion").placeholder = text.descPh;
  document.getElementById("cat-emoji").value = found ? found.item.emoji : "";
  document.getElementById("cat-nombre").value = found ? found.item.nombre : "";
  document.getElementById("cat-color").value = found ? (found.item.color || "#0d9488") : "#0d9488";
  document.getElementById("cat-descripcion").value = found ? (found.item.descripcion || "") : "";
  openModal("modal-categoria");
}

function saveCategoriaHandler(e) {
  e.preventDefault();
  const kind = document.getElementById("cat-tipo").value === "caracteristica" ? "caracteristica" : "categoria";
  const text = CATALOG_TEXT[kind];
  const id = document.getElementById("cat-id").value;
  const nombre = document.getElementById("cat-nombre").value.trim();
  if (!nombre) return;
  if (kind === "caracteristica" && !Array.isArray(AppState.caracteristicas)) AppState.caracteristicas = [];
  const list = kind === "caracteristica" ? AppState.caracteristicas : AppState.categorias;

  if (list.some((item) => item.id !== id && String(item.nombre).trim().toLowerCase() === nombre.toLowerCase())) {
    showToast("Ya existe uno con ese nombre", "error");
    return;
  }

  const data = {
    emoji: document.getElementById("cat-emoji").value.trim() || (kind === "caracteristica" ? "🏷️" : "📦"),
    nombre,
    color: document.getElementById("cat-color").value || "#0d9488",
    descripcion: document.getElementById("cat-descripcion").value.trim()
  };
  const index = id ? list.findIndex((item) => item.id === id) : -1;
  if (index !== -1) list[index] = { ...list[index], ...data };
  else list.push({ id: `${kind === "caracteristica" ? "car" : "cat"}-${Date.now()}`, ...data });

  saveState();
  renderAll();
  closeModal("modal-categoria");
  showToast(index !== -1 ? text.actualizada : text.creada);
}

// ==========================================
// ELIMINAR
// ==========================================
async function deleteCategoria(id) {
  const category = AppState.categorias.find((item) => item.id === id);
  if (!category) return;
  const bazaars = Object.values(AppState.bazaars || {});
  const expositores = bazaars.reduce((n, bz) => n + (bz.expositores || []).filter((e) => e.categoria === id).length, 0);
  const plantillas = AppState.expositorPlantillas.filter((p) => p.categoria === id).length;
  const aviso = expositores || plantillas
    ? `\n\n${expositores} expositor(es) y ${plantillas} plantilla(s) quedarán sin categoría.` : "";
  if (!await appConfirm(`¿Eliminar la categoría "${category.nombre}"?${aviso}`, "Eliminar categoría")) return;

  AppState.categorias = AppState.categorias.filter((item) => item.id !== id);
  bazaars.forEach((bz) => (bz.expositores || []).forEach((e) => { if (e.categoria === id) e.categoria = ""; }));
  AppState.expositorPlantillas.forEach((p) => { if (p.categoria === id) p.categoria = ""; });
  saveState();
  renderAll();
  showToast("🗑️ Categoría eliminada");
}

async function deleteCaracteristica(id) {
  const item = getCaracteristicas().find((c) => c.id === id);
  if (!item) return;
  const bazaars = Object.values(AppState.bazaars || {});
  const expositores = bazaars.reduce((n, bz) => n + (bz.expositores || []).filter((e) => (e.caracteristicas || []).includes(id)).length, 0);
  const plantillas = AppState.expositorPlantillas.filter((p) => (p.caracteristicas || []).includes(id)).length;
  const aviso = expositores || plantillas
    ? `\n\nSe quitará de ${expositores} expositor(es) y ${plantillas} plantilla(s).` : "";
  if (!await appConfirm(`¿Eliminar la característica "${item.nombre}"?${aviso}`, "Eliminar característica")) return;

  AppState.caracteristicas = AppState.caracteristicas.filter((c) => c.id !== id);
  const quitar = (x) => { x.caracteristicas = (x.caracteristicas || []).filter((cid) => cid !== id); };
  bazaars.forEach((bz) => (bz.expositores || []).forEach(quitar));
  AppState.expositorPlantillas.forEach(quitar);
  saveState();
  renderAll();
  showToast("🗑️ Característica eliminada");
}

// ==========================================
// CHIPS DE FILTRO (pantalla Expositores)
// ==========================================
function renderCategoryChips() {
  const container = document.getElementById("category-chips-container");
  if (!container) return;
  const bz = getActiveBazaar();
  const expositorCategories = new Set((bz?.expositores || []).map((exp) => exp.categoria).filter(Boolean));
  const mainCategories = getCategoriasPrincipales();
  const categories = !bz || bz.expositores.length === 0
    ? mainCategories
    : mainCategories.filter((cat) => expositorCategories.has(cat.id));
  let filterChanged = false;
  if (AppState.filterCategory !== "all" && !categories.some((cat) => cat.id === AppState.filterCategory)) {
    AppState.filterCategory = "all";
    filterChanged = true;
  }
  container.innerHTML = categories.map((cat) => `
    <button class="filter-chip" onclick="setFilterCategory('${cat.id}', this)">
      ${cat.emoji} ${escapeHTML(cat.nombre)}
    </button>`).join("");
  if (filterChanged) renderExpositores();
}
