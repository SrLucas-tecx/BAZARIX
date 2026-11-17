/**
 * BAZARIX — sync_rows.js (Sprint 2)
 * Convierte el estado de la app (AppState) en FILAS (un registro = una fila) y al revés.
 *  - stateToRows(state)  -> Map key -> { key, coleccion, bazarId, json }
 *  - diff(rows, base)    -> cambios a subir (nuevos, editados, borrados) con la versión que conocíamos
 *  - apply(state, rows)  -> mezcla filas que llegan del servidor sin perder lo que es solo local
 *
 * Solo LOCAL (nunca se sube): fotos (expositor, plantilla, logo del bazar, fondo del plano),
 * el bazar/piso activo, filtros y preferencias, y los campos derivados de las mesas.
 * Dependencias: state.js (migrateState, emptyCostsConfig, emptyEvento, defaultMapConfig)
 */
const RowSync = (() => {
  const DERIVED_EXP = ["foto", "tableIds", "tableId", "ubicacion"];   // se recalculan o son locales

  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).sort().forEach((k) => { if (v[k] !== undefined) o[k] = sortKeys(v[k]); });
      return o;
    }
    return v;
  }
  /** JSON con las claves ordenadas: el mismo registro siempre da el mismo texto (y el mismo hash). */
  const sjson = (v) => JSON.stringify(sortKeys(v));

  /** Hash de 53 bits (cyrb53): compara contenido sin guardar el texto completo. */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // ── Estado -> filas ──
  function stateToRows(state) {
    const rows = new Map();
    const put = (col, id, bazarId, obj, flat) => {
      if (!id) return;
      // flat (bazar y costos): "<col>:<bazarId>". Resto: con bazarId, para que dos bazares duplicados no choquen.
      const key = flat ? `${col}:${id}` : (bazarId ? `${col}:${bazarId}:${id}` : `${col}:${id}`);
      rows.set(key, { key, coleccion: col, bazarId: bazarId || "", json: sjson(obj) });
    };
    (state.categorias || []).forEach((c) => put("categorias", c.id, "", c));
    (state.caracteristicas || []).forEach((c) => put("caracteristicas", c.id, "", c));
    (state.expositorPlantillas || []).forEach((p) => { const { foto, ...r } = p; put("plantillas", p.id, "", r); });

    Object.values(state.bazaars || {}).forEach((bz) => {
      const { expositores, floors, tareas, compras, invitados, minuteByMinute, responsables, roles, costsConfig,
        logoImage, bgImage, tables, activeFloorId, extras, cajaMovs, ...meta } = bz;
      const { extraCosts, ...cfg } = costsConfig || {};
      const b = bz.id;
      put("bazares", b, b, meta, true);
      put("costos", b, b, cfg, true);                       // aparte: otro permiso (costos:edit)
      (expositores || []).forEach((e) => { const r = { ...e }; DERIVED_EXP.forEach((k) => delete r[k]); put("expositores", e.id, b, r); });
      (floors || []).forEach((f) => {
        const { tables: ts, bgImage: _img, ...fr } = f;
        put("pisos", f.id, b, fr);
        (ts || []).forEach((t) => put("mesas", t.id, b, { ...t, __p: f.id }));
      });
      (tareas || []).forEach((x) => put("tareas", x.id, b, x));
      (compras || []).forEach((x) => put("compras", x.id, b, x));
      (invitados || []).forEach((x) => put("invitados", x.id, b, x));
      (minuteByMinute || []).forEach((x) => put("actividades", x.id, b, x));
      (responsables || []).forEach((x) => put("responsables", x.id, b, x));
      (roles || []).forEach((x) => put("roles", x.id, b, x));
      (extraCosts || []).forEach((x) => put("gastos", x.id, b, x));
      (extras || []).forEach((x) => put("extras", x.id, b, x));
      (cajaMovs || []).forEach((x) => put("cajamovs", x.id, b, x));   // una fila por movimiento: varios cajeros a la vez sin chocar
    });
    return rows;
  }

  // ── Cambios a subir ──  base[key] = { v: versión del servidor, h: hash de lo que el servidor tiene, b: bazarId }
  function diff(rows, base) {
    const changes = [];
    for (const r of rows.values()) {
      const known = base[r.key];
      if (!known || known.h !== hash(r.json)) {
        changes.push({ key: r.key, coleccion: r.coleccion, bazarId: r.bazarId, baseVersion: known ? known.v : 0, json: r.json });
      }
    }
    for (const key of Object.keys(base)) {
      if (!rows.has(key)) changes.push({ key, coleccion: key.split(":")[0], bazarId: base[key].b || "", baseVersion: base[key].v, deleted: true });
    }
    return changes;
  }

  // ── Filas -> estado ──
  // La clave manda: "<col>:<id>" (catálogos) · "<col>:<bazarId>" (bazar, costos) · "<col>:<bazarId>:<id>" (el resto)
  const GLOBAL = { categorias: 1, caracteristicas: 1, plantillas: 1 };
  const FLAT = { bazares: 1, costos: 1 };
  const bazarFromKey = (row) => (GLOBAL[row.coleccion] ? "" : row.key.split(":")[1]);
  const idFromKey = (row) => {
    const parts = row.key.split(":");
    return GLOBAL[row.coleccion] || FLAT[row.coleccion] ? parts.slice(1).join(":") : parts.slice(2).join(":");
  };
  const tsOf = (id) => { const m = /(\d{10,})/.exec(String(id)); return m ? Number(m[1]) : 0; };

  function put(arr, id, obj, carry) {
    const i = arr.findIndex((x) => x.id === id);
    const merged = { ...obj };
    const old = i >= 0 ? arr[i] : null;
    (carry || []).forEach((k) => {
      if (old && old[k] !== undefined) merged[k] = old[k];
      else if (!old) merged[k] = k === "tables" ? [] : k === "foto" ? "" : null;
    });
    if (i >= 0) arr[i] = merged; else arr.push(merged);
  }
  const drop = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); };

  function newBazaar(id) {
    return { id, name: "", createdAt: Date.now(), color: "", mesasMigradas: true, logoImage: null, mapConfig: defaultMapConfig(),
      expositores: [], floors: [], extras: [], cajaMovs: [], tareas: [], compras: [], invitados: [], minuteByMinute: [], responsables: [], roles: [],
      costsConfig: emptyCostsConfig(), customMetrics: [], evento: emptyEvento(), activeFloorId: "" };
  }

  /** Mezcla filas del servidor en `state` (lo local —fotos, bazar activo— se conserva). Llamar luego a migrateState. */
  function apply(state, rows) {
    const PRI = { bazares: 0, pisos: 1, mesas: 2 };
    const list = rows.slice().sort((a, b) => (PRI[a.coleccion] ?? 1) - (PRI[b.coleccion] ?? 1));
    const touchedGastos = new Set();
    state.bazaars = state.bazaars || {};

    for (const row of list) {
      const col = row.coleccion;
      const id = idFromKey(row);
      const obj = row.deleted ? null : JSON.parse(row.json);

      if (col === "categorias" || col === "caracteristicas") {
        const arr = state[col] || (state[col] = []);
        if (obj) put(arr, id, obj); else drop(arr, id);
        continue;
      }
      if (col === "plantillas") {
        const arr = state.expositorPlantillas || (state.expositorPlantillas = []);
        if (obj) put(arr, id, obj, ["foto"]); else drop(arr, id);
        continue;
      }
      if (col === "bazares") {
        if (!obj) { delete state.bazaars[id]; continue; }
        const bz = state.bazaars[id] || (state.bazaars[id] = newBazaar(id));
        const { costsConfig, ...rest } = obj;                  // costsConfig solo llega en datos de la versión 2
        Object.assign(bz, rest);
        if (costsConfig) bz.costsConfig = { ...(bz.costsConfig || emptyCostsConfig()), ...costsConfig, extraCosts: bz.costsConfig?.extraCosts || [] };
        continue;
      }
      if (col === "costos") {
        const target = state.bazaars[id];
        if (target && obj) target.costsConfig = { ...(target.costsConfig || emptyCostsConfig()), ...obj, extraCosts: target.costsConfig?.extraCosts || [] };
        continue;
      }

      const bz = state.bazaars[bazarFromKey(row)];
      if (!bz) continue;                                   // el bazar ya no existe: se ignora
      if (col === "expositores") { obj ? put(bz.expositores, id, obj, ["foto"]) : drop(bz.expositores, id); }
      else if (col === "pisos") { obj ? put(bz.floors, id, obj, ["tables", "bgImage"]) : drop(bz.floors, id); }
      else if (col === "mesas") {
        if (obj) {
          const { __p, ...t } = obj;
          const floor = bz.floors.find((f) => f.id === __p);
          if (floor) put(floor.tables || (floor.tables = []), id, t);
        } else bz.floors.forEach((f) => drop(f.tables || [], id));
      }
      else if (col === "tareas") { obj ? put(bz.tareas, id, obj) : drop(bz.tareas, id); }
      else if (col === "compras") { obj ? put(bz.compras, id, obj) : drop(bz.compras, id); }
      else if (col === "invitados") { obj ? put(bz.invitados, id, obj) : drop(bz.invitados, id); }
      else if (col === "actividades") { obj ? put(bz.minuteByMinute, id, obj) : drop(bz.minuteByMinute, id); }
      else if (col === "responsables") { obj ? put(bz.responsables, id, obj) : drop(bz.responsables, id); }
      else if (col === "roles") { obj ? put(bz.roles, id, obj) : drop(bz.roles, id); }
      else if (col === "extras") { obj ? put(bz.extras || (bz.extras = []), id, obj) : drop(bz.extras || [], id); }
      else if (col === "cajamovs") { obj ? put(bz.cajaMovs || (bz.cajaMovs = []), id, obj) : drop(bz.cajaMovs || [], id); }
      else if (col === "gastos") {
        const arr = bz.costsConfig.extraCosts || (bz.costsConfig.extraCosts = []);
        obj ? put(arr, id, obj) : drop(arr, id);
        touchedGastos.add(bz.id);
      }
    }
    // En la app los gastos nuevos van arriba: se conserva ese orden (más reciente primero).
    touchedGastos.forEach((b) => state.bazaars[b]?.costsConfig.extraCosts.sort((x, y) => tsOf(y.id) - tsOf(x.id)));
    return state;
  }

  const api = { stateToRows, diff, apply, hash, sjson };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
