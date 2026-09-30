// Servidor local para probar la app entera en el navegador, con el código real de api/
// y los dobles de falsos.mjs en lugar de Gemini y de Upstash.
//
//   node pruebas/servidor.mjs            → http://localhost:8107
//   RAPIDO=1 node pruebas/servidor.mjs   → los tiempos de la llamada en segundos (arribo,
//                                          cadencia de controles) para ver una llamada
//                                          entera en medio minuto
//   CON_BASE=1                           → con base de datos en memoria
//   CODIGO_ACCESO=... CODIGO_ADMIN=...   → como en Vercel
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearRedis, crearGemini, instalarFetch, URL_BASE } from "./falsos.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const puerto = Number(process.env.PUERTO || 8107);

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "clave-falsa";
if (process.env.CON_BASE === "1") {
  process.env.UPSTASH_REDIS_REST_URL = URL_BASE;
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
}

export const redis = crearRedis();
export const gemini = crearGemini();
instalarFetch({ redis, gemini });

const chat = (await import("../api/chat.js")).default;
const datos = (await import("../api/datos.js")).default;
const rutasApi = { "/api/chat": chat, "/api/datos": datos };
// Las mismas reescrituras que vercel.json.
const bonitas = { "/panel": "/panel.html", "/instructores": "/instructores.html", "/fundamentos": "/fundamentos.html", "/terminos": "/terminos.html", "/privacidad": "/privacidad.html" };
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };

function acelerar(html) {
  if (process.env.RAPIDO !== "1") return html;
  return html
    .replace(/const ARRIBOS = \{[^}]*\};/, "const ARRIBOS = { corto:[0.1,0.1], normal:[0.15,0.15], largo:[0.25,0.25] };")
    .replace(/const CADENCIA = \{[^}]*\};/, "const CADENCIA = { critico:5000, estable:6000, rcp:4000 };");
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const h = rutasApi[url.pathname];
  if (h) {
    let cuerpo = "";
    for await (const trozo of req) cuerpo += trozo;
    let body = null;
    if (cuerpo) { try { body = JSON.parse(cuerpo); } catch (e) { body = cuerpo; } }
    const vreq = { method: req.method, headers: { ...req.headers, "x-forwarded-for": "127.0.0.1" }, query: Object.fromEntries(url.searchParams), body };
    const vres = {
      _estado: 200,
      status(c) { this._estado = c; return this; },
      json(o) { res.writeHead(this._estado, { "content-type": "application/json" }); res.end(JSON.stringify(o)); return this; }
    };
    try { await h(vreq, vres); } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
    return;
  }
  let ruta = bonitas[url.pathname] || (url.pathname === "/" ? "/index.html" : url.pathname);
  const archivo = path.join(raiz, path.normalize(ruta));
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end("no existe"); return; }
  let contenido = fs.readFileSync(archivo);
  if (ruta === "/index.html") contenido = acelerar(contenido.toString("utf8"));
  res.writeHead(200, { "content-type": tipos[path.extname(archivo)] || "application/octet-stream" });
  res.end(contenido);
});

servidor.listen(puerto, () => console.log("Simulador 107 de prueba en http://localhost:" + puerto));
export default servidor;
