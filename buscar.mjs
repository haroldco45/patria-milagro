// Robot de la Patria Milagro: busca noticias, las clasifica con Claude
// y deja cada noticia relevante como un "issue" pendiente de aprobación.
// Node 22+, sin dependencias externas.
import fs from "node:fs/promises";

const REPO = process.env.GITHUB_REPOSITORY;          // "usuario/repositorio"
const GH_TOKEN = process.env.GITHUB_TOKEN;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const DIAS_ATRAS = Number(process.env.DIAS_ATRAS || 3);
const MAX_NOTICIAS = Number(process.env.MAX_NOTICIAS || 60);
const LOTE = 15;

// Búsquedas fijas. Agregue o quite frases según evolucione el gobierno.
const BUSQUEDAS = [
  '"José Manuel Restrepo" vicepresidente',
  '"Decreto 1373"',
  '"Patria Milagro"',
  '"Economía Milagro"',
  '"Milagro Week"',
  'vicepresidencia "banco de proyectos" Colombia',
  'Colombia simplificación trámites decreto gobierno De la Espriella',
  'jóvenes "ni estudian ni trabajan" Colombia gobierno',
  'Colombia seguridad energética inteligencia artificial gobierno',
  'DANE PIB Colombia trimestre crecimiento',
  'Colombia inversión extranjera directa Banco de la República',
  'Colombia tasa de inversión formación bruta de capital'
];

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const fechaBogota = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const resumenPaso = async (t) => { if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, t + "\n"); };

function decodificar(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
const quitarHtml = (s = "") => decodificar(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const normalizar = (s = "") => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function parsearRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(it => {
    const tag = (t) => { const m = it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decodificar(m[1]).trim() : ""; };
    const medio = tag("source");
    let titular = quitarHtml(tag("title"));
    if (medio && titular.endsWith(" - " + medio)) titular = titular.slice(0, -(medio.length + 3));
    const pub = new Date(tag("pubDate"));
    return {
      titular,
      medio,
      url: tag("link"),
      fecha: isNaN(pub) ? "" : fechaBogota(pub),
      ts: isNaN(pub) ? 0 : pub.getTime(),
      descripcion: quitarHtml(tag("description")).slice(0, 400)
    };
  }).filter(n => n.titular && n.url);
}

async function buscarNoticias() {
  const todas = [];
  for (const q of BUSQUEDAS) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${DIAS_ATRAS}d`)}&hl=es-419&gl=CO&ceid=CO:es-419`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (robot veeduria ciudadana)" } });
      if (!r.ok) { console.warn(`Búsqueda "${q}": HTTP ${r.status}`); continue; }
      const lista = parsearRss(await r.text());
      console.log(`Búsqueda "${q}": ${lista.length} noticias`);
      todas.push(...lista);
    } catch (e) { console.warn(`Búsqueda "${q}" falló: ${e.message}`); }
    await sleep(800);
  }
  return todas;
}

// Instrucciones fijas: se envían idénticas en cada lote para aprovechar el prompt caching.
const SISTEMA = `Eres el clasificador de una veeduría ciudadana independiente que hace seguimiento al Gobierno de Colombia 2026–2030 (presidente Abelardo de la Espriella). Tu trabajo es decidir qué noticias sirven como evidencia sobre las cinco misiones que el presidente asignó al vicepresidente José Manuel Restrepo mediante el Decreto 1373 del 9 de septiembre de 2026, dentro del programa llamado "Patria Milagro" o "Economía Milagro".

LAS MISIONES
0 General: noticias sobre el plan en conjunto, el decreto, la coordinación de la vicepresidencia, su financiación o críticas al programa completo.
1 Colombia sin trabas: Estado más eficiente, ágil y productivo. Reducción de trámites, simplificación normativa, eliminación de decretos y resoluciones, modernización y digitalización del Estado, facilidad para crear empresas. El Gobierno citó un diagnóstico de unas 7.000 normas nuevas por año.
2 Talento para el futuro: oportunidades para que más de 2 millones de jóvenes que ni estudian ni trabajan ("ninis") puedan hacerlo. Formación en inteligencia artificial y nuevas tecnologías, empleo juvenil, becas, educación técnica, cifras del DANE sobre jóvenes.
3 Energía para crecer: más energía y tecnología para avanzar en inteligencia artificial y seguridad energética. Generación eléctrica, nuevos proyectos energéticos, centros de datos, gas, tarifas o riesgo de racionamiento cuando se relacionen con la política del Gobierno.
4 Más inversión y oportunidades: llevar el crecimiento del PIB al 6 % y duplicar la relación inversión/PIB. Datos del DANE sobre PIB, formación bruta de capital, inversión privada, confianza empresarial, proyecciones de crecimiento de entidades serias.
5 Liberar el capital: banco de proyectos (unos 170 proyectos por más de 600 billones de pesos) para conectar a Colombia con inversión nacional y extranjera. Ruedas de inversión "Milagro Week", acuerdos con inversionistas, cierres financieros, inversión extranjera directa.

INDICADORES QUE SE PUEDEN ACTUALIZAR
m1-normas: normas, decretos y resoluciones expedidos al año (número).
m2-ninis: jóvenes que ni estudian ni trabajan (número de personas).
m4-pib: crecimiento anual del PIB (porcentaje, ej. 3.5).
m4-inversion: formación bruta de capital fijo como porcentaje del PIB (ej. 15.7).
m5-proyectos: proyectos listos en el banco de proyectos (número).
Solo propón "indicador" cuando el titular o la descripción traigan explícitamente un dato oficial nuevo de ese indicador (por ejemplo, el DANE publica el PIB de un trimestre). Nunca calcules ni supongas cifras.

CÓMO DECIDIR SI ES RELEVANTE
Relevante: hechos del Gobierno nacional relacionados con alguna misión (decretos, anuncios, nombramientos para ejecutar la misión, resultados), datos oficiales de los indicadores, y análisis o críticas de medios, gremios, centros de estudio o la oposición sobre esas misiones.
No relevante: noticias de otros países, farándula, deportes, sucesos judiciales sin relación, notas de gobiernos locales sin vínculo con la política nacional, notas repetidas de la misma noticia, publicidad, notas donde "milagro" o "Restrepo" aparecen con otro sentido o se refieren a otra persona.
Si una misma noticia aparece varias veces desde distintos medios, marca como relevante solo la versión con el titular más informativo y las demás como no relevantes.

TIPOS
norma: decreto, resolución, ley, proyecto de ley radicado o CONPES.
anuncio: el Gobierno anuncia algo que aún no está hecho.
dato: cifra oficial (DANE, Banco de la República, ministerios) o dato verificable.
analisis: opinión, crítica, advertencia o evaluación de terceros (medios, gremios, académicos, oposición, calificadoras).
resultado: algo ya ejecutado y verificable (inversión cerrada, trámites efectivamente eliminados, programa en funcionamiento con beneficiarios).

ESTADOS
anunciado, en_ejecucion, cumplido, retrasado, sin_informacion. Usa "retrasado" solo si la noticia lo dice explícitamente. Para análisis y datos usa normalmente "sin_informacion".

REGLAS DE REDACCIÓN
Neutralidad total: no tomes partido a favor ni en contra del Gobierno. No uses adjetivos valorativos ("histórico", "fracaso", "polémico") salvo que atribuyas la valoración a quien la hizo.
Resume solo lo que dicen el titular y la descripción. Si la información es escasa, dilo con prudencia ("Según el titular de X, …"). No inventes cifras, fechas, nombres ni citas.
Título: máximo 90 caracteres, en español, frase informativa.
Resumen: máximo 2 frases.
Confianza: "alta" si la relación con la misión es directa y clara; "media" si es indirecta; "baja" si dudas (en ese caso normalmente es mejor marcarla como no relevante).

FORMATO DE RESPUESTA
Responde únicamente con un objeto JSON válido, sin texto antes ni después y sin bloques de código:
{"resultados":[{"idx":0,"relevante":true,"mision":4,"titulo":"...","resumen":"...","tipo":"dato","estado":"sin_informacion","confianza":"alta","indicador":null}]}
Para las no relevantes basta con {"idx":N,"relevante":false}.
Cuando propongas indicador usa: {"id":"m4-pib","valor":3.5,"periodo":"II trim. 2026"}.
Incluye un resultado por cada noticia recibida, con el mismo idx.`;

async function clasificar(lote) {
  const cuerpo = {
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Fecha de hoy en Colombia: ${hoyBogota()}.\nClasifica estas noticias:\n${JSON.stringify(lote.map((n, idx) => ({ idx, titular: n.titular, medio: n.medio, fecha: n.fecha, descripcion: n.descripcion })), null, 1)}`
    }]
  };
  for (let intento = 1; intento <= 4; intento++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(cuerpo)
    });
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * intento); continue; }
    const data = await r.json();
    if (!r.ok) throw new Error(`API de Claude: ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
    const u = data.usage || {};
    console.log(`Tokens: entrada ${u.input_tokens}, caché escrita ${u.cache_creation_input_tokens || 0}, caché leída ${u.cache_read_input_tokens || 0}, salida ${u.output_tokens}`);
    const texto = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/```json|```/g, "").trim();
    const obj = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
    return Array.isArray(obj.resultados) ? obj.resultados : [];
  }
  throw new Error("La API de Claude no respondió después de varios intentos.");
}

async function github(ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json", ...(opciones.headers || {}) }
  });
  if (!r.ok && r.status !== 422) throw new Error(`GitHub ${ruta}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function asegurarEtiquetas() {
  const existentes = new Set(((await github("/labels?per_page=100")) || []).map(l => l.name));
  const etiquetas = [
    ["pendiente", "FBCA04", "Noticia encontrada por el robot, esperando revisión"],
    ["aprobar", "2E7D32", "Publicar en la bitácora"],
    ["rechazar", "B71C1C", "No publicar"]
  ];
  for (const [name, color, description] of etiquetas) {
    if (!existentes.has(name)) await github("/labels", { method: "POST", body: JSON.stringify({ name, color, description }) });
  }
}

const TIPOS = new Set(["norma", "anuncio", "dato", "analisis", "resultado"]);
const ESTADOS = new Set(["anunciado", "en_ejecucion", "cumplido", "retrasado", "sin_informacion"]);
const NOMBRES = ["General", "Colombia sin trabas", "Talento para el futuro", "Energía para crecer", "Más inversión y oportunidades", "Liberar el capital"];

async function crearPendiente(noticia, c) {
  const mision = Number.isInteger(c.mision) && c.mision >= 0 && c.mision <= 5 ? c.mision : 0;
  const registro = {
    mision,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(noticia.fecha) ? noticia.fecha : hoyBogota(),
    titulo: String(c.titulo || noticia.titular).slice(0, 140),
    resumen: String(c.resumen || "").slice(0, 800),
    tipo: TIPOS.has(c.tipo) ? c.tipo : "anuncio",
    estado: ESTADOS.has(c.estado) ? c.estado : "sin_informacion",
    fuente: noticia.medio.slice(0, 120),
    url: noticia.url,
    indicador: c.indicador && typeof c.indicador.id === "string" && typeof c.indicador.valor === "number" ? c.indicador : null
  };
  const body = [
    `**Misión ${mision}: ${NOMBRES[mision]}**  ·  confianza ${c.confianza || "sin dato"}`,
    "",
    `**Titular original:** ${noticia.titular}`,
    `**Medio:** ${noticia.medio || "sin dato"}  ·  **Fecha:** ${noticia.fecha || "sin dato"}`,
    `**Enlace:** ${noticia.url}`,
    "",
    `> ${registro.resumen || "(sin resumen)"}`,
    registro.indicador ? `\n⚠️ Propone actualizar el indicador **${registro.indicador.id}** a **${registro.indicador.valor}** (${registro.indicador.periodo || "periodo sin dato"}). Verifíquelo en la fuente antes de aprobar.` : "",
    "",
    "---",
    "**Para publicar:** agregue la etiqueta `aprobar`.  **Para descartar:** agregue la etiqueta `rechazar`.",
    "Si quiere corregir algo, edite este mensaje y cambie el bloque de abajo antes de aprobar.",
    "",
    "```json",
    JSON.stringify(registro, null, 2),
    "```"
  ].join("\n");
  const titulo = `[M${mision}] ${registro.titulo}`.slice(0, 250);
  const issue = await github("/issues", { method: "POST", body: JSON.stringify({ title: titulo, body, labels: ["pendiente"] }) });
  return issue?.html_url;
}

async function main() {
  if (!API_KEY) throw new Error("Falta el secreto ANTHROPIC_API_KEY en el repositorio.");
  if (!GH_TOKEN || !REPO) throw new Error("Este script debe correr dentro de GitHub Actions.");

  const datos = JSON.parse(await fs.readFile("datos/datos.json", "utf8"));
  const vistos = JSON.parse(await fs.readFile("datos/vistos.json", "utf8"));
  const urlsVistas = new Set([...(vistos.urls || []), ...datos.hitos.map(h => h.url).filter(Boolean)]);
  const titulosVistos = new Set([...(vistos.titulos || []), ...datos.hitos.map(h => normalizar(h.titulo))]);

  await asegurarEtiquetas();

  const encontradas = await buscarNoticias();
  const nuevas = [];
  const enEsteRun = new Set();
  for (const n of encontradas.sort((a, b) => b.ts - a.ts)) {
    const t = normalizar(n.titular);
    if (urlsVistas.has(n.url) || titulosVistos.has(t) || enEsteRun.has(t)) continue;
    enEsteRun.add(t);
    nuevas.push(n);
    if (nuevas.length >= MAX_NOTICIAS) break;
  }
  console.log(`Noticias nuevas para clasificar: ${nuevas.length}`);

  let creadas = [];
  for (let i = 0; i < nuevas.length; i += LOTE) {
    const lote = nuevas.slice(i, i + LOTE);
    let resultados;
    try { resultados = await clasificar(lote); }
    catch (e) { console.error(`Lote ${i / LOTE + 1} sin clasificar (se reintentará mañana): ${e.message}`); continue; }
    for (const c of resultados) {
      const n = lote[c.idx];
      if (!n) continue;
      if (c.relevante && c.confianza !== "baja") {
        try { const url = await crearPendiente(n, c); if (url) creadas.push(`- [M${c.mision}] ${c.titulo} — ${url}`); }
        catch (e) { console.error(`No se pudo crear el pendiente "${n.titular}": ${e.message}`); continue; }
      }
    }
    // Solo se marcan como vistas las noticias de lotes que Claude sí clasificó
    for (const n of lote) { urlsVistas.add(n.url); titulosVistos.add(normalizar(n.titular)); }
    await sleep(1000);
  }

  const recortar = (set) => [...set].slice(-3000);
  await fs.writeFile("datos/vistos.json", JSON.stringify({ urls: recortar(urlsVistas), titulos: recortar(titulosVistos) }, null, 1) + "\n");

  await resumenPaso(`## Robot Patria Milagro — ${hoyBogota()}\n\nNoticias encontradas: ${encontradas.length}. Nuevas: ${nuevas.length}. Pendientes creados: ${creadas.length}.\n\n${creadas.join("\n")}`);
  console.log(`Pendientes creados: ${creadas.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
