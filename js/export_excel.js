/**
 * BAZARIX — export_excel.js
 * Exporta el plan completo del evento a un libro de Excel (.xlsx) con el formato de la plantilla
 * de logística: Ficha descriptiva · Previo · Durante · Post · Lista de compras · Presupuesto · Layout
 * (+ hoja extra "Expositores"). Usa ExcelJS (cdnjs), que da estilos, fórmulas e imágenes.
 * Dependencias: ExcelJS (global), state.js, utils.js, costos.js, eventos.js, canvas.js
 */

const XL = {
  teal:  "FF0D9488",
  soft:  "FFCCFBF1",
  ink:   "FF1E293B",
  line:  "FFCBD5E1",
  money: '"$"#,##0.00',
  date:  "dd/mm/yyyy",
};

const _xlBorder = { style: "thin", color: { argb: XL.line } };
const _xlBorders = { top: _xlBorder, left: _xlBorder, bottom: _xlBorder, right: _xlBorder };

/** "YYYY-MM-DD" → Date en UTC (evita que Excel corra el día por zona horaria). */
function _xlDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : "";
}

function _xlDateText(iso) {
  const d = _xlDate(iso);
  return d ? d.toLocaleDateString("es-MX", { timeZone: "UTC" }) : "por definir";
}

/** Fila de encabezado con el estilo de la plantilla. */
function _xlHeader(row, fromCol, count) {
  for (let i = 0; i < count; i++) {
    const cell = row.getCell(fromCol + i);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.teal } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = _xlBorders;
  }
  row.height = 24;
}

function _xlBodyRow(row, fromCol, count) {
  for (let i = 0; i < count; i++) {
    const cell = row.getCell(fromCol + i);
    cell.border = _xlBorders;
    cell.alignment = { vertical: "top", wrapText: true, ...(cell.alignment || {}) };
  }
}

/** Título de hoja: "Nombre del evento / Fecha a realizarse: ..." combinado sobre las columnas. */
function _xlTitle(ws, bz, cols) {
  ws.mergeCells(2, 2, 2, 1 + cols);
  const cell = ws.getCell(2, 2);
  cell.value = `${bz.name}\nFecha a realizarse: ${_xlDateText(bz.evento.fecha)}`;
  cell.font = { bold: true, size: 13, color: { argb: XL.teal } };
  cell.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(2).height = 38;
}

/** Impresión cómoda: horizontal y ajustada al ancho de una página. */
function _xlPrint(ws) {
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function _xlWidths(ws, widths) {
  ws.getColumn(1).width = 2;
  widths.forEach((w, i) => { ws.getColumn(i + 2).width = w; });
}

/** Hoja tabular genérica con encabezado en la fila 3 (como Previo / Durante / Post / Compras). */
function _xlTableSheet(wb, name, bz, headers, widths, rows, { dateCols = [], moneyCols = [] } = {}) {
  const ws = wb.addWorksheet(name);
  _xlWidths(ws, widths);
  _xlTitle(ws, bz, headers.length);
  _xlHeader(ws.getRow(3), 2, headers.length);
  headers.forEach((h, i) => { ws.getCell(3, 2 + i).value = h; });
  rows.forEach((values, r) => {
    const row = ws.getRow(4 + r);
    values.forEach((v, i) => { row.getCell(2 + i).value = v; });
    dateCols.forEach((c) => { row.getCell(2 + c).numFmt = XL.date; });
    moneyCols.forEach((c) => { row.getCell(2 + c).numFmt = XL.money; });
    _xlBodyRow(row, 2, headers.length);
  });
  ws.views = [{ state: "frozen", ySplit: 3 }];
  _xlPrint(ws);
  return ws;
}

function _xlFicha(wb, bz) {
  const ev = bz.evento;
  const ws = wb.addWorksheet("Ficha descriptiva");
  _xlPrint(ws);
  _xlWidths(ws, [40, 70]);
  ws.mergeCells("B2:C2");
  const title = ws.getCell("B2");
  title.value = "Ficha descriptiva del evento";
  title.font = { bold: true, size: 14, color: { argb: XL.teal } };
  const fields = [
    ["Nombre del evento", bz.name],
    ["Fecha del evento", _xlDate(ev.fecha) || "por definir"],
    ...(bazarEsMultiDia(bz) ? [["Días del evento", ev.dias.map((d, i) => `${getDiaLabel(d, i)}${formatDiaFecha(d.fecha) ? ` (${formatDiaFecha(d.fecha)})` : ""}`).join(" · ")]] : []),
    ["Objetivo del evento", ev.objetivo],
    ["Líder o líderes del evento", ev.lideres],
    ["Público al que va dirigido", ev.publico],
    ["Número de personas asistentes en el evento", ev.asistentes === "" ? "" : Number(ev.asistentes)],
    ["Lugar o lugares del evento", ev.lugar],
    ["Presupuesto base (referencia)", ev.presupuestoBase === "" ? "No definido" : Number(ev.presupuestoBase)],
    ["Número de personas consideradas para staff", ev.staff === "" ? "" : Number(ev.staff)],
  ];
  fields.forEach(([label, value], i) => {
    const row = ws.getRow(3 + i);
    row.getCell(2).value = label;
    row.getCell(2).font = { bold: true, color: { argb: "FF0F766E" } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.soft } };
    row.getCell(3).value = value;
    if (value instanceof Date) row.getCell(3).numFmt = XL.date;
    row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true };
    _xlBodyRow(row, 2, 2);
    row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true };
  });
}

function _xlPresupuesto(wb, bz) {
  const cfg = bz.costsConfig;
  const p = calcPresupuesto(bz);
  const rate = p.rate;
  const ws = wb.addWorksheet("Presupuesto");
  _xlPrint(ws);
  _xlWidths(ws, [34, 34, 16, 12, 20, 20]);
  const headers = ["Concepto", "Comentario", "Costo unitario", "Cantidad", "Costo total sin IVA", `Costo total con IVA${cfg.ivaEnabled ? ` (${cfg.ivaRate}%)` : ""}`];
  _xlHeader(ws.getRow(2), 2, headers.length);
  headers.forEach((h, i) => { ws.getCell(2, 2 + i).value = h; });

  const lines = [];
  if (cfg.conjuntoEnabled) {
    const incluye = MOBILIARIO_ITEMS.filter(({ key }) => cfg[`${key}Enabled`])
      .map(({ key, label }) => `${Number(cfg[`${key}Qty`] || 0)} ${label}`).join(", ");
    lines.push(["Mobiliario (precio conjunto)", `Incluye: ${incluye || "sin conceptos marcados"}`, Number(cfg.conjuntoTotal || 0), 1, false]);
  } else {
    [["tables", "Renta de mesas"], ["chairs", "Renta de sillas"], ["manteles", "Renta de manteles"]].forEach(([key, name]) => {
      if (!cfg[`${key}Enabled`]) return;
      const qty = Number(cfg[`${key}Qty`]) || 1;
      lines.push([name, "Costo total del proveedor", Number(cfg[`${key}Total`] || 0) / qty, qty, false]);
    });
  }
  cfg.extraCosts.forEach((c) => lines.push([c.name, c.comment || "", Number(c.unit || 0), Number(c.qty ?? 1), cfg.ivaEnabled && !!c.ivaIncluido]));

  lines.forEach(([concept, comment, unit, qty, ivaIncluido], i) => {
    const r = 3 + i;
    const row = ws.getRow(r);
    const raw = `D${r}*E${r}`;
    const rawResult = unit * qty;
    row.getCell(2).value = concept;
    row.getCell(3).value = `${comment}${ivaIncluido ? " (costo ya incluye IVA)" : ""}`;
    row.getCell(4).value = unit;
    row.getCell(5).value = qty;
    if (ivaIncluido) {
      // El monto capturado ya trae IVA: la columna "con IVA" es el dato tal cual,
      // y "sin IVA" se calcula hacia atrás.
      row.getCell(6).value = { formula: rate > 0 ? `(${raw})/${1 + rate}` : raw, result: rate > 0 ? rawResult / (1 + rate) : rawResult };
      row.getCell(7).value = { formula: raw, result: rawResult };
    } else {
      row.getCell(6).value = { formula: raw, result: rawResult };
      row.getCell(7).value = { formula: cfg.ivaEnabled ? `(${raw})*${1 + rate}` : raw, result: cfg.ivaEnabled ? rawResult * (1 + rate) : rawResult };
    }
    [4, 6, 7].forEach((c) => { row.getCell(c).numFmt = XL.money; });
    _xlBodyRow(row, 2, headers.length);
  });

  const first = 3;
  const last = 2 + Math.max(lines.length, 1);
  const totalRow = ws.getRow(last + 2);
  totalRow.getCell(2).value = "Total";
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(7).value = { formula: `SUBTOTAL(109,G${first}:G${last})`, result: p.total };
  totalRow.getCell(7).numFmt = XL.money;
  totalRow.getCell(7).font = { bold: true };
  for (let c = 2; c <= 7; c++) {
    totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.soft } };
    totalRow.getCell(c).border = _xlBorders;
  }

  // Balance del evento
  const income = bz.expositores.reduce((s, e) => s + Number(e.costo || 0), 0);
  const base = last + 4;
  const rows = [
    ["Ingresos por expositores", income, null],
    ["Egresos (total del presupuesto)", p.total, `G${last + 2}`],
    ["Balance / ganancia neta", income - p.total, `G${base}-G${base + 1}`],
  ];
  rows.forEach(([label, value, formula], i) => {
    const row = ws.getRow(base + i);
    row.getCell(2).value = label;
    row.getCell(2).font = { bold: true };
    row.getCell(7).value = formula ? { formula, result: value } : value;
    row.getCell(7).numFmt = XL.money;
    row.getCell(7).font = { bold: true };
  });
}

function _xlLayout(wb, bz) {
  const ws = wb.addWorksheet("Layout");
  _xlPrint(ws);
  _xlWidths(ws, [22, 30, 40]);
  ws.mergeCells("B2:D2");
  ws.getCell("B2").value = "Layout — dibujo de los espacios a ocupar en el evento";
  ws.getCell("B2").font = { bold: true, size: 13, color: { argb: XL.teal } };

  const floor = getActiveFloor(bz);
  let nextRow = 4;
  try {
    if (typeof bazaarCanvas !== "undefined" && bazaarCanvas.canvas && floor) {
      bazaarCanvas.render();
      const dataUrl = bazaarCanvas.canvas.toDataURL("image/png");
      if (dataUrl && dataUrl.startsWith("data:image/png")) {
        const width = 760;
        const height = Math.round(width * bazaarCanvas.canvas.height / bazaarCanvas.canvas.width);
        const imageId = wb.addImage({ base64: dataUrl, extension: "png" });
        ws.getCell("B3").value = `Plano: ${floorLabel(floor, bz)}`;
        ws.getCell("B3").font = { bold: true };
        ws.addImage(imageId, { tl: { col: 1, row: 3 }, ext: { width, height } });
        nextRow = 4 + Math.ceil(height / 20) + 2;
      }
    }
  } catch (err) {
    console.warn("No se pudo incluir la imagen del plano:", err);
  }

  ws.getCell(nextRow, 2).value = "Distribución de mesas";
  ws.getCell(nextRow, 2).font = { bold: true, size: 12, color: { argb: XL.teal } };
  const headRow = ws.getRow(nextRow + 1);
  ["Piso", "Mesa", "Expositor asignado"].forEach((h, i) => { headRow.getCell(2 + i).value = h; });
  _xlHeader(headRow, 2, 3);
  let r = nextRow + 2;
  (bz.floors || []).forEach((f) => (f.tables || []).forEach((t) => {
    const duenos = [1, 2].map((slot) => bz.expositores.find((e) => e.id === tableSlotValue(t, slot)));
    const ocupante = t.shared ? duenos.map((d) => `½ ${d ? d.negocio : "libre"}`).join(" · ") : (duenos[0]?.negocio || "Mesa libre");
    const row = ws.getRow(r++);
    row.getCell(2).value = floorLabel(f, bz);
    row.getCell(3).value = t.name;
    row.getCell(4).value = ocupante;
    _xlBodyRow(row, 2, 3);
  }));
}

function _xlStaff(wb, bz) {
  _xlTableSheet(wb, "Staff", bz,
    ["Nombre", "Rol", "Teléfono", "Email"],
    [26, 22, 18, 26],
    bz.responsables.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .map((r) => [r.nombre, getRolNombre(r.rolId, bz), r.tel || "", r.email || ""]));
}

function _xlExpositores(wb, bz) {
  const catName = (id) => AppState.categorias.find((c) => c.id === id)?.nombre || "Sin categoría";
  const multi = bazarEsMultiDia(bz);
  const off = multi ? 1 : 0;   // en eventos de varios días se agrega la columna «Días de participación»
  _xlTableSheet(wb, "Expositores", bz,
    ["Negocio", "Titular", "Categoría", "Características", ...(multi ? ["Días de participación"] : []), "Ubicación", "Mesas compradas", "Sillas asignadas", "Sillas extra", "Costo por silla extra", "Cargo sillas extra", "Costo base", "Costo final", "Adelanto", "Saldo", "Pagado", "Fecha límite de pago", "Espacio"],
    [26, 22, 18, 28, ...(multi ? [22] : []), 24, 14, 14, 12, 18, 16, 14, 14, 14, 14, 10, 18, 16],
    bz.expositores.map((e) => [
      e.negocio, e.nombre, catName(e.categoria), getExpositorCaracteristicas(e).map((c) => c.nombre).join(", "),
      ...(multi ? [getExpositorDiasLabel(e, bz)] : []), getExpositorLocation(e, bz),
      Number(e.mesasCantidad === "otro" ? e.mesasCantidadOtro : e.mesasCantidad || 1),
      Number(e.sillasCantidad || 0), Number(e.sillasExtraCantidad || 0),
      Number(e.costoSillaExtra || 0), Number(e.costoExtraSillas || 0),
      Number(e.costoBase ?? e.costo ?? 0), Number(e.costo || 0), Number(e.adelanto || 0), getExpositorPendingBalance(e),
      e.pagado ? "Sí" : "No", _xlDate(e.fechaLimitePago), e.mesaTipo === "media" ? "Media mesa" : "Mesa completa",
    ]),
    { moneyCols: [8, 9, 10, 11, 12, 13].map((i) => i + off), dateCols: [15 + off] });
}

async function exportarPlanEventoXLSX() {
  const bz = getActiveBazaar();
  if (!bz) return;
  if (typeof ExcelJS === "undefined") {
    showToast("❌ La librería de Excel no cargó (revisa tu conexión)", "error");
    return;
  }
  ensureEventoFields(bz);
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "BAZARIX";
    wb.created = new Date();

    _xlFicha(wb, bz);

    const tareaRow = (t, i, conAvance) => {
      const base = [i + 1, t.actividad, t.descripcion, getItemResponsableTexto(t, bz), _xlDate(t.fecha)];
      return conAvance ? [...base, t.avance, t.hecho ? "✔" : ""] : [...base, t.hecho ? "✔" : ""];
    };
    _xlTableSheet(wb, "Previo", bz,
      ["#", "Actividad", "Descripción", "Responsable", "Fecha de entrega", "Avances", "Listo"],
      [6, 30, 40, 20, 16, 40, 8],
      tareasDeFase(bz, "previo").map((t, i) => tareaRow(t, i, true)), { dateCols: [4] });

    const multiDia = bazarEsMultiDia(bz);
    const durante = (bz.minuteByMinute || []).slice().sort((x, y) =>
      (multiDia ? minutoDiaIndex(x, bz) - minutoDiaIndex(y, bz) : 0) || (x.time || "").localeCompare(y.time || ""));
    _xlTableSheet(wb, "Durante", bz,
      ["#", ...(multiDia ? ["Día"] : []), "Actividad", "Descripción", "Lugar", "Responsable", "Duración", "Hora inicio", "Hora fin", "Área encargada"],
      [6, ...(multiDia ? [16] : []), 30, 40, 18, 20, 12, 12, 12, 20],
      durante.map((r, i) => [i + 1, ...(multiDia ? [minutoDiaLabel(r, bz)] : []), r.activity, r.notes, r.lugar || "", getResponsableNombre(r.responsableId, bz), minuteDuration(r.time, r.horaFin), r.time, r.horaFin || "", getItemRolNombre(r, bz)]));

    _xlTableSheet(wb, "Post", bz,
      ["#", "Actividad", "Descripción", "Responsable", "Fecha de entrega", "Listo"],
      [6, 30, 40, 20, 16, 8],
      tareasDeFase(bz, "post").map((t, i) => tareaRow(t, i, false)), { dateCols: [4] });

    _xlTableSheet(wb, "Lista de compras", bz,
      ["#", "Artículo", "Descripción", "Responsable", "Fecha de entrega", "Cantidad", "Costo unitario", "IVA incluido", "Total", "Comprado"],
      [6, 28, 36, 20, 16, 10, 14, 12, 14, 10],
      bz.compras.map((c, i) => [i + 1, c.articulo, c.descripcion, getItemResponsableTexto(c, bz), _xlDate(c.fecha), Number(c.cantidad || 0), Number(c.costoUnit || 0), c.ivaIncluido ? "Sí" : "No", Number(c.costoTotal || 0), c.comprado ? "✔" : ""]),
      { dateCols: [4], moneyCols: [6, 8] });

    _xlPresupuesto(wb, bz);
    _xlLayout(wb, bz);
    _xlStaff(wb, bz);
    _xlExpositores(wb, bz);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `plan_evento_${bz.name.replace(/[^a-z0-9]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
    document.getElementById("backup-menu")?.classList.remove("open");
    showToast("✅ Plan del evento exportado a Excel");
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo generar el Excel", "error");
  }
}
