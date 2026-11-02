/**
 * EXPOSITORES.COM — state.js
 * Estado global, persistencia y getters
 * Dependencias: ninguna (módulo raíz)
 */

/**
 * BAZARIX — Core.js v2.0
 * ─────────────────────────────────────────────────────────────────
 * NUEVAS FUNCIONES EN ESTA VERSIÓN:
 *  1. Eliminar mesas del canvas (botón en modal editar mesa)
 *  2. Reset de canvas: borra TODAS las mesas y la imagen de fondo
 *  3. Checklist editable (editar texto de ítem existente)
 *  4. Lista de Invitados por bazar (nombre, confirmación asistencia)
 *  5. Guardar expositor como "plantilla" reutilizable entre bazares
 *  6. Costo de mobiliario: campo Costo TOTAL + cálculo automático de Costo Unitario
 *  7. Campo "Adelanto" y "Fecha límite de pago" por expositor
 *  8. PDF con adelanto, saldo restante y estado claro del pago
 *  9. Imagen de bazar (reemplaza emoji) en la tarjeta del bazar
 * 10. Sección /tab "Mis Bazares" — tabla para gestionar y borrar bazares
 * ─────────────────────────────────────────────────────────────────
 */

// ==========================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN (AppState)
// [EDITABLE: agrega nuevos campos por bazar o por expositor aquí]
// ==========================================

// Checklist por defecto que recibe cada expositor nuevo.
// [EDITABLE: agrega/quita pendientes por defecto aquí]
function defaultChecklistItems() {
  const base = Date.now();
  return [
    { id: `chk-${base}-1`, label: "Contrato / registro firmado", done: false },
    { id: `chk-${base}-2`, label: "Pago de mesa confirmado", done: false },
    { id: `chk-${base}-3`, label: "Mesa asignada en el plano", done: false },
    { id: `chk-${base}-4`, label: "Material / mercancía entregada", done: false }
  ];
}

// Configuración de costos vacía para un bazar nuevo.
// [EDITABLE: cambia los valores por defecto de nuevos bazares aquí]
function emptyCostsConfig() {
  return {
    tablesEnabled: false,
    tablesQty: 0,
    tablesTotal: 0,   // <- NUEVO: costo TOTAL (antes era tablesUnit)
    chairsEnabled: false,
    chairsQty: 0,
    chairsTotal: 0,   // <- NUEVO: costo TOTAL
    chairsPerTable: 2,
    globalPricesConfigured: false,
    tablePrice: 0,       // precio global por mesa completa (sugerido al registrar expositores)
    halfTablePrice: 0,   // precio global por media mesa (no es la mitad de una mesa: lo fija el organizador)
    ivaEnabled: false, // IVA opcional sobre todos los egresos
    ivaRate: 16,
    extraCosts: []    // [{ id, name, comment, unit, qty, cost }]  cost = unit × qty (sin IVA)
  };
}

function emptyCustomMetrics() {
  return [];
}

function emptyMinuteByMinute() {
  return [];
}

// Ficha descriptiva del evento (el nombre del evento es bz.name).
function emptyEvento() {
  return { fecha: "", objetivo: "", lideres: "", publico: "", asistentes: "", lugar: "", staff: "", presupuestoBase: "", multiDia: false, dias: [] };
}

// Roles sugeridos para un bazar nuevo (el usuario puede editarlos o borrarlos).
const ROLE_COLORS = ["#0d9488", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#ec4899"];
function defaultRoles() {
  const base = Date.now();
  return ["Coordinación", "Logística", "Difusión", "Finanzas"].map((nombre, i) => ({
    id: `rol-${base}-${i}`, nombre, color: ROLE_COLORS[i % ROLE_COLORS.length]
  }));
}

// Asegura los campos de logística de un bazar (ficha, tareas, compras, IVA/presupuesto, Durante).
// Se llama al migrar y antes de renderizar, así también funciona con bazares recién creados.
function ensureEventoFields(bz) {
  if (!bz) return;
  const base = emptyEvento();
  if (!bz.evento || typeof bz.evento !== "object" || Array.isArray(bz.evento)) bz.evento = base;
  else Object.keys(base).forEach((k) => { if (bz.evento[k] === undefined) bz.evento[k] = base[k]; });
  if (bz.evento.presupuestoBase !== "" && bz.evento.presupuestoBase !== null) {
    const presupuestoBase = Number(bz.evento.presupuestoBase);
    bz.evento.presupuestoBase = Number.isFinite(presupuestoBase) ? Math.max(0, presupuestoBase) : "";
  } else {
    bz.evento.presupuestoBase = "";
  }

  // Eventos de varios días: bz.evento.multiDia + bz.evento.dias = [{ id, nombre, fecha }]
  bz.evento.multiDia = Boolean(bz.evento.multiDia);
  if (!Array.isArray(bz.evento.dias)) bz.evento.dias = [];
  bz.evento.dias = bz.evento.dias.filter((d) => d && typeof d === "object");
  bz.evento.dias.forEach((d, i) => {
    if (!d.id) d.id = `dia-${Date.now()}-${i}`;
    d.nombre = String(d.nombre ?? "");
    d.fecha = String(d.fecha ?? "");
  });
  if (bz.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(bz.color))) bz.color = "";

  if (!Array.isArray(bz.roles)) bz.roles = defaultRoles();
  if (!Array.isArray(bz.responsables)) bz.responsables = [];
  bz.responsables.forEach((r) => {
    if (!r.id) r.id = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (r.nombre === undefined) r.nombre = "";
    if (r.rolId === undefined) r.rolId = "";
    if (r.tel === undefined) r.tel = "";
    if (r.email === undefined) r.email = "";
  });

  // Convierte un nombre suelto (texto libre viejo) en un responsable real,
  // reutilizando uno existente con el mismo nombre en vez de duplicar.
  const responsableIdFromTexto = (nombre) => {
    const clean = String(nombre || "").trim();
    if (!clean) return "";
    const existing = bz.responsables.find((r) => r.nombre.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;
    const nuevo = { id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre: clean, rolId: "", tel: "", email: "" };
    bz.responsables.push(nuevo);
    return nuevo.id;
  };

  if (!Array.isArray(bz.tareas)) bz.tareas = [];
  bz.tareas.forEach((t) => {
    if (!t.id) t.id = `tarea-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    if (t.fase !== "previo" && t.fase !== "post") t.fase = "previo";
    ["actividad", "descripcion", "fecha", "avance"].forEach((k) => { if (t[k] === undefined) t[k] = ""; });
    if (t.responsableId === undefined) t.responsableId = t.responsable ? responsableIdFromTexto(t.responsable) : "";
    if (t.areaRolId === undefined) t.areaRolId = "";
    t.hecho = Boolean(t.hecho);
  });

  if (!Array.isArray(bz.compras)) bz.compras = [];
  bz.compras.forEach((c) => {
    if (!c.id) c.id = `compra-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    ["articulo", "descripcion", "fecha", "presupuestoId"].forEach((k) => { if (c[k] === undefined) c[k] = ""; });
    if (c.responsableId === undefined) c.responsableId = c.responsable ? responsableIdFromTexto(c.responsable) : "";
    if (c.areaRolId === undefined) c.areaRolId = "";
    if (!Number.isFinite(Number(c.cantidad))) c.cantidad = 1;
    if (!Number.isFinite(Number(c.costoTotal))) {
      c.costoTotal = Number(c.cantidad || 0) * Number(c.costoUnit || 0);
    }
    c.costoTotal = Math.max(0, Number(c.costoTotal) || 0);
    c.costoUnit = Number(c.cantidad) > 0 ? c.costoTotal / Number(c.cantidad) : 0;
    if (c.ivaIncluido === undefined) c.ivaIncluido = true;
    c.ivaIncluido = Boolean(c.ivaIncluido);
    c.comprado = Boolean(c.comprado);
  });

  const cfg = bz.costsConfig || (bz.costsConfig = emptyCostsConfig());
  if (cfg.globalPricesConfigured === undefined) {
    cfg.globalPricesConfigured = Number(cfg.chairExtraUnitPrice) > 0 ||
      Number(cfg.tablePrice) > 0 || Number(cfg.halfTablePrice) > 0;
  }
  if (!Number.isFinite(Number(cfg.chairExtraUnitPrice))) {
    const rateCounts = new Map();
    (Array.isArray(bz.expositores) ? bz.expositores : []).forEach((exp) => {
      if (Number(exp.sillasExtraCantidad || 0) <= 0) return;
      const price = Math.round(Math.max(0, Number(exp.costoSillaExtra) || 0) * 100) / 100;
      rateCounts.set(price, (rateCounts.get(price) || 0) + 1);
    });
    const initialPrice = [...rateCounts.entries()].reduce(
      (best, entry) => entry[1] > best[1] ? entry : best,
      [0, 0]
    )[0];
    cfg.chairExtraUnitPrice = initialPrice;
    applyGlobalChairExtraPrice(bz);
  }
  ["tablePrice", "halfTablePrice"].forEach((k) => { cfg[k] = Math.max(0, Number(cfg[k]) || 0); });
  if (cfg.ivaEnabled === undefined) cfg.ivaEnabled = false;
  if (!Number.isFinite(Number(cfg.ivaRate))) cfg.ivaRate = 16;
  if (!Array.isArray(cfg.extraCosts)) cfg.extraCosts = [];
  cfg.extraCosts.forEach((c) => {
    if (c.qty === undefined) c.qty = 1;
    if (c.unit === undefined) c.unit = Number(c.cost || 0) / (Number(c.qty) || 1);
    if (c.comment === undefined) c.comment = "";
    if (c.ivaIncluido === undefined) c.ivaIncluido = false;
  });

  (bz.minuteByMinute || []).forEach((row) => {
    if (row.lugar === undefined) row.lugar = "";
    if (row.horaFin === undefined) row.horaFin = "";
    if (row.dia === undefined) row.dia = "";   // id de bz.evento.dias; "" = todos los días
    if (row.responsableId === undefined) row.responsableId = row.responsible ? responsableIdFromTexto(row.responsible) : "";
    if (row.areaRolId === undefined) {
      const rolIgual = bz.roles.find((r) => r.nombre.trim().toLowerCase() === String(row.area || "").trim().toLowerCase());
      row.areaRolId = rolIgual ? rolIgual.id : "";
    }
  });
}

function applyGlobalChairExtraPrice(bz) {
  const price = Math.round(Math.max(0, Number(bz?.costsConfig?.chairExtraUnitPrice) || 0) * 100) / 100;
  (Array.isArray(bz?.expositores) ? bz.expositores : []).forEach((exp) => {
    const extraCount = Math.max(0, Number(exp.sillasExtraCantidad) || 0);
    const oldExtraCost = Number(exp.costoExtraSillas);
    if (!Number.isFinite(Number(exp.costoBase))) {
      const legacyExtraCost = Number.isFinite(oldExtraCost)
        ? oldExtraCost
        : (Number(exp.costoSillaExtra) || 0) * extraCount;
      exp.costoBase = Math.max(0, (Number(exp.costo) || 0) - legacyExtraCost);
    }
    const extraCost = Math.round(extraCount * price * 100) / 100;
    exp.costoSillaExtra = price;
    exp.costoExtraSillas = extraCost;
    exp.costo = Math.round((Math.max(0, Number(exp.costoBase) || 0) + extraCost) * 100) / 100;
  });
}

// ==========================================
// MESAS COMPARTIDAS (media mesa)
// table.shared = true → la mesa se divide en 2 mitades: exhibitorId (A) y exhibitorId2 (B).
// La asistencia es por mitad: attended/absent (A) y attended2/absent2 (B).
// ==========================================
function normalizeTableOwners(table) {
  table.exhibitorId = String(table.exhibitorId || "");
  table.shared = Boolean(table.shared);
  table.exhibitorId2 = table.shared ? String(table.exhibitorId2 || "") : "";
  if (table.exhibitorId2 && table.exhibitorId2 === table.exhibitorId) table.exhibitorId2 = "";   // el mismo expositor no puede ocupar las dos mitades
  ["attended", "absent", "attended2", "absent2"].forEach((k) => { table[k] = Boolean(table[k]); });
}
function tableOwnerIds(table) {
  return [table?.exhibitorId, table?.shared ? table?.exhibitorId2 : ""].filter(Boolean);
}
function tableSlotValue(table, slot) {
  return Number(slot) === 2 ? (table?.shared ? table.exhibitorId2 || "" : "") : (table?.exhibitorId || "");
}
function tableSlotOf(table, expId) {
  if (!expId) return 0;
  if (table?.exhibitorId === expId) return 1;
  return table?.shared && table.exhibitorId2 === expId ? 2 : 0;
}
function setTableSlot(table, slot, expId) {
  if (Number(slot) === 2) table.exhibitorId2 = expId || ""; else table.exhibitorId = expId || "";
}
function resetTableSlotAttendance(table, slot) {
  if (Number(slot) === 2) { table.attended2 = false; table.absent2 = false; } else { table.attended = false; table.absent = false; }
}
function tableAttendanceState(table, slot = 1) {
  return Number(slot) === 2
    ? (table.absent2 ? "absent" : table.attended2 ? "attended" : "pending")
    : (table.absent ? "absent" : table.attended ? "attended" : "pending");
}
/** Color del expositor en el plano: el suyo, o el de su categoría. */
function getExpositorPlanoColor(exp) {
  if (/^#[0-9a-f]{6}$/i.test(String(exp?.color || ""))) return exp.color;
  return AppState.categorias.find((c) => c.id === exp?.categoria)?.color || "#0284c7";
}
/** Color de una mesa ocupada: el mismo color que muestra el expositor en el plano. */
function getTableOwnerColor(exp) {
  return getExpositorPlanoColor(exp);
}

function defaultMapConfig() {
  return { pixelsPerMeter: 100, backgroundOpacity: 1 };
}

function createFloor(id, name, tables = [], bgImage = null, backgroundOpacity = 1) {
  return { id, name, tables, bgImage, backgroundOpacity, dia: "", orientation: "landscape", bgScale: 1, bgScaleX: 1, bgScaleY: 1, bgRotation: 0, bgX: 0, bgY: 0, elements: [] };
}

const DEFAULT_STATE = {
  // Catálogo de categorías compartido entre todos los bazares.
  categorias: [
    { id: "cat-1", nombre: "Artesanías", emoji: "🎨", color: "#0d9488", descripcion: "Productos hechos a mano, arte y piezas artesanales." },
    { id: "cat-2", nombre: "Gastronomía", emoji: "🥐", color: "#e11d48", descripcion: "Alimentos, bebidas y productos gastronómicos." },
    { id: "cat-3", nombre: "Moda y Textil", emoji: "👗", color: "#8b5cf6", descripcion: "Ropa, accesorios, calzado y productos textiles." },
    { id: "cat-4", nombre: "Hogar y Salud", emoji: "🌿", color: "#10b981", descripcion: "Artículos para el hogar, bienestar, cuidado personal y salud." },
    { id: "cat-5", nombre: "Joyería y Accesorios", emoji: "💍", color: "#db2777", descripcion: "Bisutería, joyería, relojes y accesorios." },
    { id: "cat-6", nombre: "Arte e Ilustración", emoji: "🖼️", color: "#f97316", descripcion: "Pinturas, ilustraciones, prints y arte original." },
    { id: "cat-7", nombre: "Papelería y Regalos", emoji: "📓", color: "#eab308", descripcion: "Libretas, agendas, tarjetas y detalles para regalar." },
    { id: "cat-8", nombre: "Juguetes y Coleccionables", emoji: "🧸", color: "#ef4444", descripcion: "Juguetes, figuras, peluches y artículos de colección." },
    { id: "cat-9", nombre: "Belleza y Cuidado Personal", emoji: "💄", color: "#ec4899", descripcion: "Cosméticos, skincare, perfumería y cuidado personal." },
    { id: "cat-10", nombre: "Mascotas", emoji: "🐾", color: "#84cc16", descripcion: "Productos y accesorios para mascotas." },
    { id: "cat-11", nombre: "Plantas y Jardín", emoji: "🪴", color: "#22c55e", descripcion: "Plantas, suculentas, macetas y jardinería." },
    { id: "cat-12", nombre: "Música y Entretenimiento", emoji: "🎵", color: "#3b82f6", descripcion: "Música, instrumentos, videojuegos y juegos de mesa." },
    { id: "cat-13", nombre: "Tecnología y Gadgets", emoji: "🎧", color: "#06b6d4", descripcion: "Accesorios tecnológicos, gadgets y electrónica." },
    { id: "cat-14", nombre: "Libros y Cómics", emoji: "📚", color: "#6366f1", descripcion: "Libros, fanzines, cómics y manga." },
    { id: "cat-15", nombre: "Anime y Cultura Pop", emoji: "🎌", color: "#a855f7", descripcion: "Mercancía de anime, series, películas y cultura pop." },
    { id: "cat-16", nombre: "Servicios y Experiencias", emoji: "🎟️", color: "#64748b", descripcion: "Talleres, fotografía, tatuajes y otros servicios." }
  ],

  // Características: etiquetas extra del negocio, compartidas entre bazares.
  // [{ id, nombre, emoji, color, descripcion }]; cada expositor guarda una lista de ids.
  caracteristicas: [
    { id: "car-pines", nombre: "Pines", emoji: "📌", color: "#ef4444", descripcion: "Pines y botones de metal o esmalte." },
    { id: "car-stickers", nombre: "Stickers", emoji: "🏷️", color: "#f59e0b", descripcion: "Stickers y calcomanías." },
    { id: "car-llaveros", nombre: "Llaveros", emoji: "🔑", color: "#0d9488", descripcion: "Llaveros y colgantes." },
    { id: "car-parches", nombre: "Parches", emoji: "🧵", color: "#8b5cf6", descripcion: "Parches bordados o termoadheribles." },
    { id: "car-prints", nombre: "Prints y posters", emoji: "📜", color: "#3b82f6", descripcion: "Láminas, prints y posters." },
    { id: "car-hecho-a-mano", nombre: "Hecho a mano", emoji: "🧶", color: "#db2777", descripcion: "Productos elaborados artesanalmente." },
    { id: "car-personalizado", nombre: "Personalizado", emoji: "✏️", color: "#06b6d4", descripcion: "Se personaliza con nombre, diseño o pedido especial." },
    { id: "car-edicion-limitada", nombre: "Edición limitada", emoji: "✨", color: "#eab308", descripcion: "Producción corta o piezas únicas." },
    { id: "car-fan-art", nombre: "Fan art", emoji: "🎨", color: "#a855f7", descripcion: "Arte inspirado en series, anime, juegos o películas." },
    { id: "car-vegano", nombre: "Vegano", emoji: "🌱", color: "#22c55e", descripcion: "Sin ingredientes de origen animal." },
    { id: "car-sin-gluten", nombre: "Sin gluten", emoji: "🌾", color: "#f97316", descripcion: "Opciones sin gluten." },
    { id: "car-eco", nombre: "Eco-friendly", emoji: "♻️", color: "#10b981", descripcion: "Materiales reciclados o sostenibles." },
    { id: "car-local", nombre: "Producto local", emoji: "📍", color: "#e11d48", descripcion: "Elaborado localmente." },
    { id: "car-3d", nombre: "Impresión 3D", emoji: "🖨️", color: "#6366f1", descripcion: "Piezas hechas con impresión 3D." },
    { id: "car-tarjeta", nombre: "Acepta tarjeta", emoji: "💳", color: "#64748b", descripcion: "Cobra con tarjeta o terminal." },
    { id: "car-pedido", nombre: "Bajo pedido", emoji: "📦", color: "#84cc16", descripcion: "Se elabora por encargo." }
  ],

  // Plantillas de expositores guardados (reutilizables entre bazares).
  // [EDITABLE: estructura de plantilla: { id, nombre, negocio, categoria, tel, email, foto, notas }]
  expositorPlantillas: [],

  // Cada bazar es independiente: expositores, mesas, costos e invitados.
  // La app arranca SIN bazares: el usuario crea el primero desde Inicio.
  bazaars: {},

  currentBazaarId: null,
  searchQuery: "",
  filterCategory: "all",
  filterStatus: "all",
  filterExpositorDay: "all",
  expositorSort: "recent"
};

let AppState = loadState();

function getBazaarsNewestFirst(bazaars = Object.values(AppState.bazaars || {})) {
  const creationTime = (bazaar) => {
    const savedTime = Number(bazaar.createdAt);
    if (Number.isFinite(savedTime) && savedTime > 0) return savedTime;
    const savedDate = Date.parse(bazaar.createdAt);
    if (Number.isFinite(savedDate) && savedDate > 0) return savedDate;
    const idTimestamp = /^bazaar-(\d+)$/.exec(String(bazaar.id || ""))?.[1];
    return Number(idTimestamp) || 0;
  };
  return [...bazaars].sort((a, b) => creationTime(b) - creationTime(a));
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

// ==========================================
// 2. PERSISTENCIA (localStorage)
// ==========================================
function loadState() {
  try {
    const saved = localStorage.getItem("EXPOSITORES_APP_STATE");
    if (saved) {
      const parsed = JSON.parse(saved);
      return migrateState(parsed);
    }
  } catch (err) {
    console.warn("Error cargando estado:", err);
  }
  return migrateState(cloneDefaultState());
}

// migrateState: asegura que bazares viejos tengan los campos nuevos.
function migrateState(parsed) {
  parsed.searchQuery = "";
  if (!parsed.expositorPlantillas) parsed.expositorPlantillas = [];
  if (!Array.isArray(parsed.categorias)) parsed.categorias = JSON.parse(JSON.stringify(DEFAULT_STATE.categorias));
  if (!Array.isArray(parsed.caracteristicas)) parsed.caracteristicas = [];
  // Migración: las antiguas "subcategorías" pasan a ser Características (catálogo aparte, sin categoría padre).
  parsed.categorias.filter((c) => c.tipo === "subcategoria").forEach((old) => {
    if (!parsed.caracteristicas.some((x) => x.id === old.id)) {
      parsed.caracteristicas.push({
        id: old.id, nombre: old.nombre || "Característica", emoji: old.emoji || "🏷️",
        color: old.color || "#0d9488", descripcion: old.descripcion || ""
      });
    }
  });
  parsed.categorias = parsed.categorias.filter((c) => c.tipo !== "subcategoria");
  parsed.categorias.forEach((category) => {
    if (category.descripcion === undefined) category.descripcion = "";
    delete category.tipo; delete category.parentId; delete category.tieneSubcategorias;
  });
  parsed.caracteristicas.forEach((item) => {
    if (!item.id) item.id = `car-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!item.nombre) item.nombre = "Característica";
    if (!item.emoji) item.emoji = "🏷️";
    if (!item.color) item.color = "#0d9488";
    if (item.descripcion === undefined) item.descripcion = "";
  });
  // Expositores y plantillas: "subcategoria" (texto) -> "caracteristicas" (lista de ids).
  const migrarCaracteristicas = (item) => {
    const previas = Array.isArray(item.caracteristicas) ? item.caracteristicas : (item.subcategoria ? [item.subcategoria] : []);
    item.caracteristicas = [...new Set(previas)];
    delete item.subcategoria;
  };
  (parsed.expositorPlantillas || []).forEach(migrarCaracteristicas);
  Object.values(parsed.bazaars || {}).forEach((bz) => (bz.expositores || []).forEach(migrarCaracteristicas));
  if (!["cards", "table"].includes(parsed.expositorView)) parsed.expositorView = "cards";
  if (!["recent", "az", "za"].includes(parsed.expositorSort)) parsed.expositorSort = "recent";
  if (!["previo", "post"].includes(parsed.tareasFase)) parsed.tareasFase = "previo";
  if (typeof parsed.diaEventoDia !== "string") parsed.diaEventoDia = "";   // pestaña de Día del Evento ("" = automática)
  if (typeof parsed.minutoDia !== "string") parsed.minutoDia = "all";   // pestaña activa de Minuto a Minuto
  if (!["mobiliario", "gastos"].includes(parsed.costosSubTab)) parsed.costosSubTab = "mobiliario";

  Object.values(parsed.bazaars || {}).forEach((bz) => {
    const createdAt = Number(bz.createdAt);
    const createdDate = Date.parse(bz.createdAt);
    if ((!Number.isFinite(createdAt) || createdAt <= 0) && (!Number.isFinite(createdDate) || createdDate <= 0)) {
      const idTimestamp = /^bazaar-(\d+)$/.exec(String(bz.id || ""))?.[1];
      if (idTimestamp) bz.createdAt = Number(idTimestamp);
    }
    if (!bz.invitados)   bz.invitados   = [];
    if (!bz.minuteByMinute) bz.minuteByMinute = emptyMinuteByMinute();
    if (!bz.customMetrics) bz.customMetrics = emptyCustomMetrics();
    ensureEventoFields(bz);
    if (!bz.mapConfig) bz.mapConfig = defaultMapConfig();
    if (!Number.isFinite(Number(bz.mapConfig.pixelsPerMeter)) || bz.mapConfig.pixelsPerMeter <= 0) {
      bz.mapConfig.pixelsPerMeter = 100;
    }
    if (!Number.isFinite(Number(bz.mapConfig.backgroundOpacity))) bz.mapConfig.backgroundOpacity = 1;
    bz.mapConfig.backgroundOpacity = Math.max(0, Math.min(1, Number(bz.mapConfig.backgroundOpacity)));
    if (!Array.isArray(bz.floors) || bz.floors.length === 0) {
      bz.floors = [createFloor(`${bz.id}-floor-1`, "Planta baja", bz.tables || [], bz.bgImage || null, bz.mapConfig.backgroundOpacity)];
    }
    if (!Array.isArray(bz.expositores)) bz.expositores = [];
    bz.floors.forEach((floor, index) => {
      if (!floor.id) floor.id = `${bz.id}-floor-${index + 1}`;
      if (!floor.name) floor.name = `Piso ${index + 1}`;
      if (typeof floor.dia !== "string") floor.dia = "";   // plano de un día concreto ("" = sin día)
      if (!Array.isArray(floor.tables)) floor.tables = [];
      floor.tables.forEach(normalizeTableOwners);
      if (!["landscape", "portrait"].includes(floor.orientation)) floor.orientation = "landscape";
      if (floor.bgImage === undefined) floor.bgImage = null;
      if (!Number.isFinite(Number(floor.backgroundOpacity))) floor.backgroundOpacity = 1;
      floor.backgroundOpacity = Math.max(0, Math.min(1, Number(floor.backgroundOpacity)));
      if (!Number.isFinite(Number(floor.bgScale)) || floor.bgScale <= 0) floor.bgScale = 1;
      if (!Number.isFinite(Number(floor.bgScaleX)) || floor.bgScaleX <= 0) floor.bgScaleX = floor.bgScale;
      if (!Number.isFinite(Number(floor.bgScaleY)) || floor.bgScaleY <= 0) floor.bgScaleY = floor.bgScale;
      if (!Number.isFinite(Number(floor.bgRotation))) floor.bgRotation = 0;
      floor.bgRotation = ((Number(floor.bgRotation) % 360) + 360) % 360;
      if (!Number.isFinite(Number(floor.bgX))) floor.bgX = 0;
      if (!Number.isFinite(Number(floor.bgY))) floor.bgY = 0;
      if (!Array.isArray(floor.elements)) floor.elements = [];
      if (!Array.isArray(floor.zones)) floor.zones = [];
      floor.elements.forEach((element) => {
        if (!element.id) element.id = `element-${Date.now()}-${Math.random()}`;
        if (!element.type) element.type = "otro";
        if (!element.label) element.label = "Elemento";
        if (!Number.isFinite(Number(element.x))) element.x = 100;
        if (!Number.isFinite(Number(element.y))) element.y = 100;
        if (!Number.isFinite(Number(element.width)) || element.width <= 0) element.width = 30;
        if (!Number.isFinite(Number(element.height)) || element.height <= 0) element.height = 30;
        if (!element.emoji) element.emoji = { electricidad: "⚡", pilar: "▣", entrada: "↗", otro: "•" }[element.type] || "•";
      });
    });
    if (!bz.activeFloorId || !bz.floors.some((floor) => floor.id === bz.activeFloorId)) {
      bz.activeFloorId = bz.floors[0].id;
    }
    if (!bz.logoImage)   bz.logoImage   = null;

    // Migrar costsConfig: renombrar tablesUnit->tablesTotal, chairsUnit->chairsTotal
    const cfg = bz.costsConfig || {};
    if (cfg.tablesUnit !== undefined && cfg.tablesTotal === undefined) {
      cfg.tablesTotal = cfg.tablesUnit * (cfg.tablesQty || 0);
      delete cfg.tablesUnit;
    }
    if (cfg.chairsUnit !== undefined && cfg.chairsTotal === undefined) {
      cfg.chairsTotal = cfg.chairsUnit * (cfg.chairsQty || 0);
      delete cfg.chairsUnit;
    }
    if (cfg.tablesTotal === undefined) cfg.tablesTotal = 0;
    if (cfg.chairsTotal === undefined) cfg.chairsTotal = 0;
    if (!Number.isSafeInteger(Number(cfg.chairsPerTable)) || Number(cfg.chairsPerTable) < 0) cfg.chairsPerTable = 2;

    // Migrar expositores: agregar adelanto y fechaLimitePago si no existen
    (bz.expositores || []).forEach((exp) => {
      if (exp.ubicacion === undefined) exp.ubicacion = "";
      if (exp.adelanto           === undefined) exp.adelanto           = 0;
      if (exp.fechaLimitePago    === undefined) exp.fechaLimitePago    = "";
      if (!exp.publicationStatus) exp.publicationStatus = "pendiente";
      if (exp.banned === undefined) exp.banned = false;
      if (exp.mesasCantidad === undefined) exp.mesasCantidad = 1;
      if (exp.mesasCantidadOtro === undefined) exp.mesasCantidadOtro = "";
      if (!Number.isFinite(Number(exp.sillasPorMesa))) exp.sillasPorMesa = cfg.chairsPerTable;
      exp.sillasPorMesa = Math.max(0, Math.floor(Number(exp.sillasPorMesa)));
      if (!Number.isFinite(Number(exp.sillasCantidad))) {
        const mesas = exp.mesasCantidad === "otro" ? exp.mesasCantidadOtro : exp.mesasCantidad;
        const totalSillas = Math.max(1, Math.floor(Number(mesas) || 1)) * exp.sillasPorMesa;
        exp.sillasCantidad = Number.isSafeInteger(totalSillas) ? totalSillas : 0;
      } else {
        exp.sillasCantidad = Math.max(0, Math.floor(Number(exp.sillasCantidad)));
      }
      if (!Number.isFinite(Number(exp.sillasExtraCantidad))) exp.sillasExtraCantidad = 0;
      exp.sillasExtraCantidad = Math.max(0, Math.floor(Number(exp.sillasExtraCantidad)));
      if (!Number.isFinite(Number(exp.costoSillaExtra))) exp.costoSillaExtra = 0;
      if (!Number.isFinite(Number(exp.costoExtraSillas))) exp.costoExtraSillas = 0;
      if (!Number.isFinite(Number(exp.costoBase))) exp.costoBase = Math.max(0, Number(exp.costo || 0) - Number(exp.costoExtraSillas || 0));
      if (exp.areaEncargada === undefined) exp.areaEncargada = "";
      if (exp.encargadoId === undefined) exp.encargadoId = "";
      if (!Array.isArray(exp.diasParticipacion)) exp.diasParticipacion = [];   // [] = todos los días
      if (exp.mesaTipo !== "media") exp.mesaTipo = "completa";                  // "media" = media mesa
      if (!/^#[0-9a-f]{6}$/i.test(String(exp.color || ""))) exp.color = "";      // color en el plano (opcional)
      if (!Array.isArray(exp.historial)) exp.historial = [];
    });
    const mapTables = (bz.floors || []).flatMap((floor) => floor.tables || []);
    // Migración de ubicaciones antiguas: se ejecuta UNA sola vez por bazar. Antes se repetía en cada carga
    // y podía "resucitar" mesas que ya se habían quitado. Después, la fuente de verdad es la mesa del plano.
    if (!bz.mesasMigradas) {
      bz.expositores.forEach((exp) => {
        const oldIds = new Set(Array.isArray(exp.tableIds) ? exp.tableIds : []);
        if (exp.tableId) oldIds.add(exp.tableId);
        if (!Array.isArray(exp.tableIds) && !oldIds.size && exp.ubicacion) {   // registros anteriores a los ids de mesa
          String(exp.ubicacion).split(",").map((name) => name.trim().toLowerCase()).forEach((name) => {
            const match = mapTables.find((table) => table.name.trim().toLowerCase() === name);
            if (match) oldIds.add(match.id);
          });
        }
        oldIds.forEach((tableId) => {
          const table = mapTables.find((item) => item.id === tableId);
          if (table && !tableOwnerIds(table).length) table.exhibitorId = exp.id;
        });
      });
      bz.mesasMigradas = true;
    }
    const nombresMesas = new Set(mapTables.map((table) => String(table.name).trim().toLowerCase()));
    bz.expositores.forEach((exp) => {
      const assignedTables = mapTables.filter((table) => tableSlotOf(table, exp.id) > 0);
      exp.tableIds = assignedTables.map((table) => table.id);
      exp.tableId = exp.tableIds[0] || "";
      if (assignedTables.length) {
        exp.ubicacion = assignedTables.map((table) => table.name).join(", ");
        if (exp.ubicacionAnterior === undefined) exp.ubicacionAnterior = "";
      } else {
        // Sin mesas, la ubicación se deriva (queda vacía). Un texto escrito a mano antes de existir el plano
        // se conserva aparte; si solo era el nombre de una mesa que ya no es suya, se descarta.
        if (exp.ubicacionAnterior === undefined) {
          const partes = String(exp.ubicacion || "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
          exp.ubicacionAnterior = partes.length && partes.every((n) => nombresMesas.has(n)) ? "" : String(exp.ubicacion || "");
        }
        exp.ubicacion = "";
      }
    });
    (bz.minuteByMinute || []).forEach((row) => {
      if (row.area === undefined) row.area = "";
    });
    getActiveTables(bz).forEach((table) => {
      if (table.rotation === undefined) table.rotation = 0;
    });
    bz.invitados.forEach((inv) => {
      if (inv.expositorId === undefined) inv.expositorId = "";
      if (inv.asistio === undefined) inv.asistio = false;
    });
  });
  // Si el bazar activo no existe (respaldo importado, bazar borrado...), usa el primero disponible.
  const bazaarIds = Object.keys(parsed.bazaars || {});
  if (!parsed.bazaars?.[parsed.currentBazaarId]) parsed.currentBazaarId = bazaarIds[0] || null;
  return parsed;
}

function saveState() {
  try {
    localStorage.setItem("EXPOSITORES_APP_STATE", JSON.stringify(AppState));
    if (typeof showSaveIndicator === "function") showSaveIndicator();
    return true;
  } catch (err) {
    console.error("Error al guardar datos:", err);
    showToast("⚠️ Error al guardar datos", "error");
    return false;
  }
}

function getActiveBazaar() {
  return AppState.bazaars[AppState.currentBazaarId] || null;
}

function getActiveFloor(bz = getActiveBazaar()) {
  if (!bz) return null;
  return bz.floors?.find((floor) => floor.id === bz.activeFloorId) || bz.floors?.[0] || null;
}

function getActiveTables(bz = getActiveBazaar()) {
  return getActiveFloor(bz)?.tables || [];
}

// ==========================================
