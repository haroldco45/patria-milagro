// Aplica la decisión tomada sobre un pendiente (etiqueta "aprobar" o "rechazar").
//   node scripts/aprobar.mjs           -> si es "aprobar", agrega el registro a datos/datos.json
//   node scripts/aprobar.mjs --cerrar  -> comenta y cierra el issue
import fs from "node:fs/promises";

const REPO = process.env.GITHUB_REPOSITORY;
const GH_TOKEN = process.env.GITHUB_TOKEN;
const cerrar = process.argv.includes("--cerrar");

const TIPOS = new Set(["norma", "anuncio", "dato", "analisis", "resultado"]);
const ESTADOS = new Set(["anunciado", "en_ejecucion", "cumplido", "retrasado", "sin_informacion"]);
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const ahoraBogota = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-05:00`;
};

export function extraerRegistro(body = "") {
  const m = body.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error("No encontré el bloque ```json``` con el registro.");
  const r = JSON.parse(m[1]);
  const mision = Number(r.mision);
  if (!Number.isInteger(mision) || mision < 0 || mision > 5) throw new Error("La misión debe ser un número de 0 a 5.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha || ""))) throw new Error("La fecha debe tener formato AAAA-MM-DD.");
  const titulo = String(r.titulo || "").trim();
  if (!titulo) throw new Error("El título está vacío.");
  const url = String(r.url || "");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("El enlace debe empezar por http:// o https://.");
  return {
    mision,
    fecha: r.fecha,
    titulo: titulo.slice(0, 140),
    resumen: String(r.resumen || "").slice(0, 800),
    tipo: TIPOS.has(r.tipo) ? r.tipo : "anuncio",
    estado: ESTADOS.has(r.estado) ? r.estado : "sin_informacion",
    fuente: String(r.fuente || "").slice(0, 120),
    url,
    indicador: r.indicador && typeof r.indicador.id === "string" && Number.isFinite(Number(r.indicador.valor))
      ? { id: r.indicador.id, valor: Number(r.indicador.valor), periodo: String(r.indicador.periodo || "") } : null
  };
}

export function aplicar(datos, numero, reg) {
  const id = `gh-${numero}`;
  if (datos.hitos.some(h => h.id === id)) return false;
  const { indicador, ...hito } = reg;
  datos.hitos.push({ id, ...hito, creadoEn: ahoraBogota() });
  if (indicador) {
    const ind = datos.indicadores.find(i => i.id === indicador.id);
    if (ind) Object.assign(ind, { actual: indicador.valor, actualFecha: indicador.periodo, fuente: hito.fuente || ind.fuente, url: hito.url || ind.url, actualizadoEn: ahoraBogota() });
  }
  datos.actualizado = hoyBogota();
  return true;
}

async function github(ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json" }
  });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${ruta}: ${r.status}`);
  return r.status === 204 || r.status === 404 ? null : r.json();
}

async function main() {
  const evento = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const etiqueta = evento.label?.name;
  const issue = evento.issue;
  if (!issue || !["aprobar", "rechazar"].includes(etiqueta)) return;

  // Se usa el texto más reciente del issue, por si fue editado antes de aprobar
  const actual = await github(`/issues/${issue.number}`);
  const body = actual?.body ?? issue.body ?? "";

  if (!cerrar) {
    if (etiqueta !== "aprobar") return;
    const reg = extraerRegistro(body);
    const datos = JSON.parse(await fs.readFile("datos/datos.json", "utf8"));
    if (aplicar(datos, issue.number, reg)) {
      await fs.writeFile("datos/datos.json", JSON.stringify(datos, null, 2) + "\n");
      console.log(`Registro gh-${issue.number} agregado.`);
    } else {
      console.log(`El registro gh-${issue.number} ya estaba publicado.`);
    }
    return;
  }

  const comentar = (texto) => github(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: texto }) });
  const quitarPendiente = () => github(`/issues/${issue.number}/labels/pendiente`, { method: "DELETE" });

  if (etiqueta === "rechazar") {
    await quitarPendiente();
    await comentar("Descartado. No se publica en la bitácora.");
    await github(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
    return;
  }

  const datos = JSON.parse(await fs.readFile("datos/datos.json", "utf8"));
  if (datos.hitos.some(h => h.id === `gh-${issue.number}`)) {
    await quitarPendiente();
    await comentar(`Publicado en la bitácora el ${hoyBogota()}. La página pública se actualiza en uno o dos minutos.`);
    await github(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
  } else {
    await comentar("No se pudo publicar este registro. Revise el registro de la acción en la pestaña Actions, corrija el bloque JSON si hace falta y vuelva a poner la etiqueta `aprobar`.");
    await github(`/issues/${issue.number}/labels/aprobar`, { method: "DELETE" });
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error(e.message);
    try {
      const evento = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
      await github(`/issues/${evento.issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `No se pudo aplicar la decisión: ${e.message}` }) });
      if (evento.label?.name === "aprobar") await github(`/issues/${evento.issue.number}/labels/aprobar`, { method: "DELETE" });
    } catch {}
    process.exit(1);
  });
}
