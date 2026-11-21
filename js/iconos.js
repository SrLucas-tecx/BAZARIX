/**
 * BAZARIX — iconos.js
 * Muestra iconos de Lucide (ver iconos_data.js, generado por tools/generar_iconos.js) en lugar de los emojis de la interfaz.
 * Funciona sobre el DOM ya pintado: busca los emojis de ICONOS_MAPA en el TEXTO de la pantalla y los cambia por <svg>.
 * Los textos del código no cambian, así que ninguna lógica se rompe, y cada render nuevo se convierte solo (MutationObserver).
 *
 * NO se tocan: emojis que elige el usuario (selector de emojis, categorías, características), marcados con la clase
 * "keep-emoji" o el atributo data-keep-emoji · <option>, <textarea>, <input>, <select>, <script>, <style>, <svg>, <canvas>
 * · atributos (title, placeholder, aria-label) · documentos que se exportan a PDF (data-keep-emoji).
 * Dependencias: iconos_data.js (ICONOS_SVG, ICONOS_MAPA). Cargar justo antes de init.js.
 */
const ICONOS = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SALTAR = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "SELECT", "INPUT", "CANVAS", "SVG", "NOSCRIPT", "TITLE"]);
  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const claves = Object.keys(ICONOS_MAPA).sort((a, b) => b.length - a.length);
  const ALT = claves.map((k) => [...k].map(esc).join("")).join("|");
  const BUSCA = new RegExp(`(${ALT})\\uFE0F?`, "gu");
  const HAY = new RegExp(`(?:${ALT})`, "u");

  /** "✅ Hecho" → [{ icono: "circle-check", cls: "" }, { texto: " Hecho" }] */
  function partir(texto) {
    const partes = [];
    let desde = 0;
    for (const m of String(texto).matchAll(BUSCA)) {
      if (m.index > desde) partes.push({ texto: texto.slice(desde, m.index) });
      const [icono, cls] = ICONOS_MAPA[m[1]];
      partes.push({ icono, cls: cls || "" });
      desde = m.index + m[0].length;
    }
    if (desde < texto.length) partes.push({ texto: texto.slice(desde) });
    return partes;
  }

  /** ¿Este elemento (o alguno de sus ancestros) debe quedarse con sus emojis? */
  function omitido(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SALTAR.has(String(n.nodeName).toUpperCase())) return true;
      if ((n.classList && n.classList.contains("keep-emoji")) || (n.hasAttribute && n.hasAttribute("data-keep-emoji"))) return true;
    }
    return false;
  }

  function crearSvg(nombre, cls) {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("class", `ico-i ${cls}`.trim());
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    const u = document.createElementNS(SVG_NS, "use");
    u.setAttribute("href", `#ic-${nombre}`);
    s.appendChild(u);
    return s;
  }

  function convertirTexto(nodo) {
    if (!nodo.parentNode || !HAY.test(nodo.data) || omitido(nodo.parentNode)) return;
    const frag = document.createDocumentFragment();
    partir(nodo.data).forEach((p) => frag.appendChild(p.icono ? crearSvg(p.icono, p.cls) : document.createTextNode(p.texto)));
    nodo.parentNode.replaceChild(frag, nodo);
  }

  function procesar(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { convertirTexto(raiz); return; }
    if (raiz.nodeType !== 1 || omitido(raiz)) return;
    const tw = document.createTreeWalker(raiz, 4 /* SHOW_TEXT */ | 1 /* SHOW_ELEMENT */, {
      acceptNode: (n) => n.nodeType === 1 ? (omitido(n) ? 2 /* REJECT: salta todo su subárbol */ : 3 /* SKIP: entra */) : (HAY.test(n.data) ? 1 : 3),
    });
    const nodos = [];
    while (tw.nextNode()) nodos.push(tw.currentNode);
    nodos.forEach(convertirTexto);
  }

  function sprite() {
    const simbolos = Object.entries(ICONOS_SVG).map(([n, d]) => `<symbol id="ic-${n}" viewBox="0 0 24 24">${d}</symbol>`).join("");
    const holder = document.createElement("div");
    holder.innerHTML = `<svg id="iconos-sprite" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">${simbolos}</svg>`;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  function iniciar() {
    if (document.getElementById("iconos-sprite")) return;
    sprite();
    procesar(document.body);
    if (typeof MutationObserver === "undefined") return;
    const obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === "characterData") procesar(m.target);
        else m.addedNodes.forEach(procesar);
      });
      obs.takeRecords();   // lo que acabamos de cambiar nosotros no vuelve a disparar el observador
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /** Para código nuevo: ICONOS.html("trash-2") devuelve el <svg> como texto HTML. */
  const html = (nombre, cls = "") => `<svg class="ico-i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#ic-${nombre}"/></svg>`;

  return { partir, omitido, procesar, iniciar, html };
})();

if (typeof document !== "undefined" && document.body) ICONOS.iniciar();
if (typeof module !== "undefined") module.exports = ICONOS;
