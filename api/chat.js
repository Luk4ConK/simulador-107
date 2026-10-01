// Simulador 107 — función del servidor: el operador y la devolución.
// Guarda la clave de API fuera del navegador: los alumnos nunca la ven.
//
// Variables de entorno (se cargan en Vercel, no en el código):
//
//   GEMINI_API_KEY     · gratis · clave de Google AI Studio. Si está, se usa esta.
//   ANTHROPIC_API_KEY  · pago   · clave de Claude. Se usa si no hay clave de Gemini.
//   CODIGO_ACCESO      · opcional · código de los alumnos de la cuenta principal
//   CODIGO_ADMIN       · opcional · código del dueño: abre el panel de administración
//   NOMBRE_PRINCIPAL   · opcional · nombre de la cuenta principal, la del titular (por defecto "Kalu Lab")
//
//   UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN · opcional · la base de datos.
//      Las carga sola la integración de Upstash en Vercel (también sirven KV_REST_API_URL
//      y KV_REST_API_TOKEN). Sin base, la app funciona igual que antes: sin registro de
//      prácticas, sin salas y con un único código de acceso.
//
//   MODELO_OPERADOR    · opcional · uno o varios modelos, separados por comas y en orden de
//                        preferencia, para probar primero en la conversación (por ejemplo
//                        "gemini-3.5-flash-lite,gemini-3.1-flash-lite"). Los de la lista de
//                        abajo quedan detrás, de respaldo. Después de cambiarla, redesplegar.
//   MODELO_EVALUADOR   · opcional · lo mismo, para la devolución
//   GEMINI_SIN_PENSAR  · opcional · poné "1" si el operador tarda demasiado en contestar
//
// Este archivo no importa nada de otros archivos del proyecto a propósito: sin
// package.json ni build, Vercel lo despliega tal cual. api/datos.js repite las pocas
// funciones de base de datos que usan los dos; si cambiás una, cambiá la otra.
//
// Las llamadas a Gemini y a Claude van por fetch, sin SDK, por la misma razón: el
// proyecto no tiene dependencias y se quiere mantener así.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Se prueban en orden. Cada modelo tiene su propia cuota en la capa gratuita de Gemini
// (por modelo y por proyecto, no por clave), así que cuando uno se agota se sigue con el
// siguiente. Los Flash-Lite van primero para el operador porque tienen ~500 pedidos por
// día cada uno, contra ~20 de los Flash. Un modelo que no existe para esta clave (404, o
// 403 como los 2.5 desde el 18/09/2026 para quien no los usaba) se enfría 6 h, así que la
// lista puede tener nombres de más.
// Sin alias "-latest": comparten la cuota del modelo al que apuntan y sólo gastaban un
// pedido fallido más. Los Flash del desborde del operador (3.6 y 3.7) no son los del
// evaluador (3.8, 3.5 y 2.5): si el operador se come su cuota diaria en un pico, las
// devoluciones de fin de ronda no se quedan sin modelo. Los Flash-Lite sí los comparten,
// pero van al final de la lista del evaluador.
const DEFAULTS = {
  gemini: {
    operador:  ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite",
                "gemini-3.6-flash", "gemini-3.7-flash", "gemma-3-27b-it"],
    evaluador: ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash",
                "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
  },
  anthropic: {
    operador:  ["claude-haiku-4-5", "claude-haiku-4-5-20251001"],
    evaluador: ["claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-4-5"]
  }
};

// El prompt del operador NO se recorta nunca: recortarlo en silencio fue la causa de casi
// todos los comportamientos raros del operador (ver CLAUDE.md). Si pasa este tope, se
// rechaza con un error que se ve, para que se note en las pruebas y se suba el tope.
const TOPE_PROMPT = 40000;

// Vercel corta la función a los 60 s (maxDuration en vercel.json) con un 504 en HTML, que
// el navegador no puede leer y que, en la devolución, no deja nada guardado. Por eso los
// modelos tienen hasta los 45 s desde que llegó el pedido, y cada uno su propio tope, para
// que uno que se cuelga no se coma el tiempo de los demás. Los 15 s que sobran son para
// contar el uso y guardar la práctica.
const PRESUPUESTO_MS = 45000;
const TOPE_MODELO_MS = { rapido: 15000, lento: 30000 };

// Una clase cerrada (o vencida) no deja entrar ni empezar otra práctica, pero la llamada
// que estaba en curso se termina y se evalúa: durante este margen, contado desde el cierre
// o el vencimiento, se aceptan los turnos de una práctica ya empezada y la devolución.
const GRACIA_SALA_MS = 20 * 60000;

// Modelo -> { hasta, motivo }: no se prueba antes que los demás hasta esa hora. No se
// guarda "el que anduvo" para ponerlo primero: así se hacía antes y, tras un desborde, el
// operador quedaba pegado al Flash de reserva (y se comía la cuota diaria del evaluador)
// aunque los Flash-Lite se hubieran liberado a los pocos segundos.
const enfriado = {};

const SISTEMA_EVALUADOR =
  "Sos instructor de guardavidas y de primeros auxilios evaluando una práctica de llamada al sistema de emergencias. " +
  "Respondés únicamente con un objeto JSON válido, sin texto alrededor y sin bloques de código.";

export default async function handler(req, res) {
  const inicio = Date.now();   // de acá se cuenta el PRESUPUESTO_MS de los modelos
  if (req.method === "GET") {
    // /api/chat?diag=1 — comprueba la clave, los modelos y la base. No devuelve secretos.
    if (req.query && (req.query.diag === "1" || req.query.diag === "true")) {
      return res.status(200).json(await diagnostico());
    }
    // Qué está activado, sin mostrar ningún valor: la entrada y la página /activar lo usan
    // para decirle al dueño qué le falta cargar en Vercel.
    return res.status(200).json({
      requiereCodigo: requiereCodigo(), proveedor: proveedor().nombre, registro: Boolean(kvConfig()),
      admin: Boolean((process.env.CODIGO_ADMIN || "").trim()), clave: Boolean(proveedor().clave)
    });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "metodo_no_permitido" });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === "string") {
    try { cuerpo = JSON.parse(cuerpo); } catch (e) { return res.status(400).json({ error: "json_invalido" }); }
  }
  if (!cuerpo || typeof cuerpo !== "object") return res.status(400).json({ error: "cuerpo_vacio" });

  // ---- acceso ----
  const ip = ipDe(req);
  const codigo = String(req.headers["x-codigo"] || "");
  let acceso = null;
  if (requiereCodigo()) {
    if (await demasiadosIntentos(ip, "alumnos")) {
      return res.status(429).json({ error: "demasiados_intentos", detalle: "Muchos códigos equivocados seguidos. Esperá diez minutos." });
    }
    try { acceso = await resolverCodigo(codigo); }
    catch (e) { return res.status(503).json({ error: "base", detalle: String(e.message || e).slice(0, 200) }); }
    if (!acceso) {
      if (codigo.trim()) await anotarIntento(ip, codigo, "alumnos");
      return res.status(401).json({ error: "codigo_invalido" });
    }
  } else {
    acceso = { rol: "alumno", cuentaId: "principal" };
  }
  // Clase cerrada o vencida: los grupos que estaban en una llamada la terminan y reciben su
  // devolución (ver GRACIA_SALA_MS). Lo que no se puede es entrar (verificar) ni empezar una
  // práctica nueva (el primer turno trae `inicio`). La gracia no saltea un bloqueo de la
  // cuenta: resolverCodigo deja "sala_cerrada" aunque la cuenta además esté pausada.
  const enCurso = cuerpo.modo === "evaluar" || (cuerpo.modo === "operador" && !cuerpo.inicio);
  const gracia = acceso.bloqueo === "sala_cerrada" && acceso.sala && enCurso
    && !bloqueoDeCuenta(acceso.cuenta)
    && Date.now() - Number(acceso.sala.vence) < GRACIA_SALA_MS;
  if (acceso.bloqueo && !gracia) return res.status(403).json({ error: acceso.bloqueo, detalle: textoBloqueo(acceso.bloqueo) });

  // Verificación del código: no gasta una llamada al modelo.
  if (cuerpo.modo === "verificar") {
    return res.status(200).json({ ok: true, ...(await datosPublicos(acceso)) });
  }

  const prov = proveedor();
  if (!prov.clave) {
    return res.status(500).json({
      error: "sin_clave",
      detalle: "Falta cargar GEMINI_API_KEY o ANTHROPIC_API_KEY en Vercel, y volver a desplegar."
    });
  }

  try {
    if (cuerpo.modo === "operador") {
      // La primera vuelta de cada práctica controla el cupo mensual de la cuenta.
      if (cuerpo.inicio) {
        const cupo = await cupoDisponible(acceso);
        if (!cupo.ok) return res.status(403).json({ error: "cupo_agotado", detalle: cupo.detalle });
      }
      const fijo = String(cuerpo.fijo || "");
      const variable = String(cuerpo.variable || "");
      const sistema = fijo ? fijo + "\n\n" + variable : String(cuerpo.instrucciones || "");
      if (sistema.length > TOPE_PROMPT) {
        return res.status(413).json({ error: "prompt_largo", detalle: "El guion del operador mide " + sistema.length + " caracteres y el tope es " + TOPE_PROMPT + ". Hay que subir TOPE_PROMPT en api/chat.js." });
      }

      const turnos = unirTurnos((Array.isArray(cuerpo.turnos) ? cuerpo.turnos : [])
        .filter(t => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
        .slice(-40)
        .map(t => ({ role: t.role, content: t.content.slice(0, 4000) })));

      // La conversación tiene que arrancar por el lado de quien llama.
      const mensajes = (!turnos.length || turnos[0].role === "assistant")
        ? [{ role: "user", content: "[Entra la llamada al 107]" }, ...turnos]
        : turnos;

      let r;
      try {
        r = await generar(prov, "operador", {
          sistema, fijo: fijo || null, variable,
          mensajes,
          // Alcanza para dos oraciones más los marcadores. Si el modelo piensa antes de
          // contestar, esos tokens salen de acá: por eso no va más justo.
          maxTokens: 800,
          rapido: true,
          hasta: inicio + PRESUPUESTO_MS
        });
      } catch (e) { await contarFalla(e); throw e; }
      await contarUso(acceso, "turnos", r.modelo, r.cuotas);
      return res.status(200).json({ texto: r.texto, modelo: r.modelo });
    }

    if (cuerpo.modo === "evaluar") {
      // El tablero pasa a "evaluando" en este mismo pedido: así el "terminada" o "sin
      // devolución" que escribe guardarPractica llega siempre después. El aviso que manda
      // la app por /api/datos es otra función y puede llegar tarde; ése ya no pisa un
      // estado terminal (ver sala-estado en api/datos.js).
      if (acceso.sala && kvConfig() && cuerpo.registro && typeof cuerpo.registro === "object") {
        const g = grupoDe(cuerpo.registro), k = P + "salaest:" + acceso.sala.codigo;
        try {
          await kvPipe([
            ["HSET", k, g.toLowerCase(), JSON.stringify({ grupo: g, estado: "evaluando", escenario: corto(cuerpo.registro.escenario && cuerpo.registro.escenario.titulo, 140), perfil: cuerpo.registro.perfil === "lego" ? "lego" : "guardavidas", t: Date.now() })],
            ["EXPIRE", k, 3 * 86400]
          ]);
        } catch (e) {}
      }

      let datos = null, modelo = null, error = null;
      try {
        const r = await generar(prov, "evaluador", {
          sistema: SISTEMA_EVALUADOR,
          mensajes: [{ role: "user", content: String(cuerpo.prompt || "").slice(0, 60000) }],
          // El presupuesto de razonamiento se descuenta de maxTokens. Con 1800 y el
          // razonamiento encendido, el modelo lo gastaba pensando en voz alta y la
          // respuesta se cortaba a mitad de palabra, antes del JSON.
          maxTokens: 4000,
          sinPensar: true,
          rapido: false,
          hasta: inicio + PRESUPUESTO_MS,
          // Un JSON cortado o roto no cuenta como respuesta: se pasa al modelo siguiente,
          // en vez de contestar json_invalido teniendo cinco modelos más para probar.
          validar: t => Boolean(extraerJSON(t))
        });
        modelo = r.modelo;
        await contarUso(acceso, "evaluaciones", r.modelo, r.cuotas);
        datos = extraerJSON(r.texto);
        if (!datos) error = { codigo: "json_invalido", estado: 502, detalle: r.texto.slice(0, 600) };
      } catch (e) {
        await contarFalla(e);
        error = e && e.jsonInvalido
          ? { codigo: "json_invalido", estado: 502, detalle: String(e.texto || "").slice(0, 600) }
          : { codigo: "api", estado: (e && e.estado) || 502, detalle: String((e && e.message) || e).slice(0, 300) };
      }

      // El puntaje lo calcula el código a partir de la rúbrica, nunca el modelo.
      const calc = datos && Array.isArray(cuerpo.rubrica) ? puntuar(datos, cuerpo.rubrica, cuerpo.topeCritico) : null;

      // El registro no puede tirar abajo la devolución: si la base falla, el alumno igual
      // ve su resultado.
      let practicaId = null;
      if (kvConfig() && cuerpo.registro && typeof cuerpo.registro === "object") {
        try { practicaId = await guardarPractica(acceso, cuerpo, { datos, modelo, calc, error }); }
        catch (e) { practicaId = null; }
      }

      if (!datos) return res.status(error.estado === 429 ? 429 : 502).json({ error: error.codigo, detalle: error.detalle, practicaId });
      return res.status(200).json({
        datos, modelo, practicaId, guardado: Boolean(practicaId),
        puntaje: calc ? calc.puntaje : null, topeado: calc ? calc.topeado : false
      });
    }

    return res.status(400).json({ error: "modo_desconocido" });
  } catch (e) {
    const estado = e && e.estado ? e.estado : 502;
    return res.status(estado).json({ error: "api", detalle: String((e && e.message) || e).slice(0, 300) });
  }
}

/* ======================================================================
   Modelos
   ====================================================================== */

function proveedor() {
  const gemini = (process.env.GEMINI_API_KEY || "").trim();
  const anthropic = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (gemini) return { nombre: "gemini", clave: gemini };
  return { nombre: "anthropic", clave: anthropic };
}

function candidatos(prov, rol) {
  // MODELO_OPERADOR / MODELO_EVALUADOR pueden traer varios, separados por comas: así se
  // ajusta la rotación desde Vercel, sin tocar el código, cuando Google saca o retira modelos.
  const forzados = [...new Set(((rol === "operador" ? process.env.MODELO_OPERADOR : process.env.MODELO_EVALUADOR) || "")
    .split(",").map(s => s.trim()).filter(Boolean))];
  // Los forzados van primero, en el orden cargado, pero no solos: si se quedan sin cuota,
  // la clase sigue con los demás.
  return [...forzados, ...DEFAULTS[prov.nombre][rol].filter(m => !forzados.includes(m))];
}

function libre(modelo) { return !(enfriado[modelo] && enfriado[modelo].hasta > Date.now()); }

// Recorre los modelos candidatos hasta que uno responda. No son fallas reales, y por eso
// se pasa al siguiente: el modelo no existe para esta clave (404/403), está saturado o
// tuvo un error de su lado (500, 503, 504), se quedó sin cuota (429), devolvió vacío
// porque gastó los tokens pensando, devolvió algo que no sirve (`opciones.validar`), o no
// contestó a tiempo o se cortó la red. Cada uno queda "enfriado" un rato: los libres se
// prueban primero, siempre en el orden de la lista.
// `opciones.hasta` es la hora límite del pedido entero: cada modelo tiene su propio tope,
// pero nunca más de lo que queda, así la función contesta antes de que la corte Vercel.
async function generar(prov, rol, opciones) {
  const lista = candidatos(prov, rol);
  const orden = lista.filter(libre).concat(lista.filter(m => !libre(m)));
  const hasta = opciones.hasta || Date.now() + PRESUPUESTO_MS;
  let ultimo = null, cuotas = 0, sinTiempo = false;
  for (const modelo of orden) {
    const queda = hasta - Date.now();
    if (queda < 3000) { sinTiempo = true; break; }
    // El corte va como hora absoluta: los reintentos internos (sin razonamiento en Gemini,
    // sin extras en Claude) usan lo que queda del mismo corte, no uno nuevo.
    const corte = Date.now() + Math.min(opciones.rapido ? TOPE_MODELO_MS.rapido : TOPE_MODELO_MS.lento, queda);
    try {
      const texto = prov.nombre === "gemini"
        ? await viaGemini(prov.clave, { ...opciones, modelo, corte })
        : await viaAnthropic(prov.clave, { ...opciones, modelo, corte });
      if (opciones.validar && !opciones.validar(texto)) {
        const e = new Error("no devolvió un JSON válido: " + texto.slice(0, 120));
        e.jsonInvalido = true; e.texto = texto;
        throw e;
      }
      delete enfriado[modelo];
      return { texto, modelo, cuotas };
    } catch (e) {
      ultimo = e;
      if (e.cuota) { cuotas++; enfriar(modelo, e.esperaMs || 60000, e.diaria ? "cuota diaria agotada" : "cuota por minuto"); continue; }
      if (e.modeloInexistente) { enfriar(modelo, 6 * 3600000, "no disponible para esta clave"); continue; }
      if (e.modeloOcupado) { enfriar(modelo, 20000, "saturado"); continue; }
      if (e.jsonInvalido) { enfriar(modelo, 60000, "devolvió un JSON inválido"); continue; }
      if (e.vacio || e.rechazo) { enfriar(modelo, 60000, e.vacio ? "respuesta vacía" : "rechazó el pedido"); continue; }
      // Sin estado HTTP: se cortó la red ("fetch failed") o se pasó de su tope de tiempo
      // (TimeoutError). Va después de vacío/rechazo, que tampoco traen estado.
      if (!e.estado) { enfriar(modelo, 20000, e.name === "TimeoutError" ? "no respondió a tiempo" : "sin respuesta"); continue; }
      throw e;
    }
  }
  // Si alguno se quedó sin cuota, eso es lo que hay que contar (429), aunque el último
  // de la lista haya fallado por otra cosa (por ejemplo, que no existe para esta clave).
  if (cuotas) {
    const e = new Error("Todos los modelos disponibles llegaron a su tope de uso por ahora. " + String((ultimo && ultimo.message) || "").slice(0, 120));
    e.estado = 429; e.cuota = true;
    throw e;
  }
  if (sinTiempo) {
    const e = new Error("Los modelos no respondieron a tiempo. " + String((ultimo && ultimo.message) || "").slice(0, 120));
    e.estado = 504;
    throw e;
  }
  throw ultimo || new Error("sin modelos disponibles");
}

function enfriar(modelo, ms, motivo) {
  enfriado[modelo] = { hasta: Date.now() + ms, motivo };
}

async function diagnostico() {
  const prov = proveedor();
  const salida = {
    proveedor: prov.nombre, claveCargada: Boolean(prov.clave),
    codigoAcceso: Boolean((process.env.CODIGO_ACCESO || "").trim()),
    codigoAdmin: Boolean((process.env.CODIGO_ADMIN || "").trim()),
    candidatos: { operador: prov.clave ? candidatos(prov, "operador") : [], evaluador: prov.clave ? candidatos(prov, "evaluador") : [] }
  };
  // Base de datos
  const kvc = kvConfig();
  salida.baseDeDatos = { configurada: Boolean(kvc) };
  if (kvc) {
    try { salida.baseDeDatos.ok = (await kv("PING")) === "PONG"; }
    catch (e) { salida.baseDeDatos.ok = false; salida.baseDeDatos.detalle = String(e.message).slice(0, 150); }
  }
  if (!prov.clave) {
    salida.error = "Falta cargar GEMINI_API_KEY o ANTHROPIC_API_KEY en Vercel, y volver a desplegar.";
    return salida;
  }
  if (prov.nombre === "gemini") {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": prov.clave }, signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (!r.ok) { salida.error = "La clave fue rechazada: " + JSON.stringify(d).slice(0, 200); return salida; }
      salida.modelosDisponibles = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => String(m.name).replace("models/", ""));
    } catch (e) {
      salida.error = "No se pudo consultar la lista de modelos: " + String(e.message).slice(0, 150);
      return salida;
    }
  }
  try {
    const r = await generar(prov, "operador", {
      sistema: "Respondé exactamente la palabra: listo",
      mensajes: [{ role: "user", content: "probando" }],
      maxTokens: 40, rapido: true
    });
    salida.prueba = { ok: true, modelo: r.modelo, respuesta: r.texto.slice(0, 80) };
  } catch (e) {
    salida.prueba = { ok: false, detalle: String(e.message).slice(0, 250) };
  }
  const ahora = Date.now();
  salida.enfriados = Object.fromEntries(Object.entries(enfriado)
    .filter(([, v]) => v.hasta > ahora)
    .map(([m, v]) => [m, v.motivo + " · " + Math.ceil((v.hasta - ahora) / 60000) + " min"]));
  return salida;
}

// Gemini y Claude esperan turnos alternados. Si un pedido falló y el alumno volvió a
// hablar, quedan dos turnos seguidos del mismo lado: se juntan en uno.
function unirTurnos(turnos) {
  const out = [];
  for (const t of turnos) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content += "\n" + t.content;
    else out.push({ role: t.role, content: t.content });
  }
  return out;
}

async function viaAnthropic(clave, opciones, sinExtras) {
  const { modelo, sistema, fijo, variable, mensajes, maxTokens } = opciones;
  // La parte fija del prompt va en su propio bloque con cache_control: se cobra una
  // décima parte cada vez que se repite en la misma llamada. La parte que cambia turno a
  // turno (el estado de la llamada) va después, fuera de la caché.
  const system = fijo
    ? [{ type: "text", text: fijo, cache_control: { type: "ephemeral" } }].concat(variable ? [{ type: "text", text: variable }] : [])
    : [{ type: "text", text: sistema }];
  const cuerpo = { model: modelo, max_tokens: maxTokens, system, messages: mensajes };
  const headers = { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" };
  if (!sinExtras && /^claude-sonnet-5/.test(modelo)) {
    // Sonnet 5 y 5.5 piensan por defecto: con esfuerzo bajo alcanza para una devolución
    // en JSON, y se le da margen de tokens para que el razonamiento no corte la respuesta.
    cuerpo.output_config = { effort: "low" };
    cuerpo.max_tokens = Math.max(maxTokens, 8000);
  }
  if (!sinExtras && modelo === "claude-sonnet-5-5") {
    // Si un clasificador de seguridad rechaza el pedido, la API lo reintenta sola con otro modelo.
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    cuerpo.fallbacks = "default";
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(cuerpo), signal: senalDeCorte(opciones.corte) });
  if (!r.ok) {
    const t = await r.text();
    // Si algún parámetro opcional no lo acepta, se repite una vez sin los extras.
    if (!sinExtras && r.status === 400 && /fallback|anthropic-beta|output_config|effort/i.test(t)) {
      return viaAnthropic(clave, opciones, true);
    }
    throw fallo(t, r.status, r.headers);
  }
  const data = await r.json();
  if (data.stop_reason === "refusal") { const e = new Error("el modelo rechazó el pedido"); e.rechazo = true; throw e; }
  const texto = (data.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
  if (!texto) { const e = new Error("respuesta vacía"); e.vacio = true; throw e; }
  return texto;
}

// El tope de tiempo de un pedido al proveedor, a partir del corte (hora absoluta) que fija
// generar(). Sin esto, un modelo colgado se comía los 60 s de la función.
function senalDeCorte(corte) {
  return AbortSignal.timeout(Math.max(1000, (corte || Date.now() + TOPE_MODELO_MS.lento) - Date.now()));
}

async function viaGemini(clave, opciones) {
  try {
    return await pedirAGemini(clave, opciones);
  } catch (e) {
    // No todos los modelos aceptan que se les apague el razonamiento. Si se queja de
    // eso, se reintenta sin pedírselo antes de dar la llamada por perdida.
    if (e.sinPensarNoSoportado) return await pedirAGemini(clave, { ...opciones, sinPensar: false, rapido: false });
    throw e;
  }
}

async function pedirAGemini(clave, { modelo, sistema, mensajes, maxTokens, rapido, sinPensar, corte }) {
  // Gemma no acepta instrucciones de sistema: se le pasan al principio del primer turno.
  const esGemma = /^gemma/i.test(modelo);
  const contents = mensajes.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const cuerpo = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (esGemma) {
    contents[0].parts[0].text = sistema + "\n\n---\n\n" + contents[0].parts[0].text;
  } else {
    cuerpo.systemInstruction = { parts: [{ text: sistema }] };
    // El evaluador lo pide siempre (`sinPensar`), porque razonar le come los tokens de la
    // respuesta. El operador lo pide sólo si el instructor prendió GEMINI_SIN_PENSAR,
    // porque ahí es una decisión de velocidad, no de correctitud.
    if (sinPensar || (rapido && process.env.GEMINI_SIN_PENSAR === "1")) {
      cuerpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
  }

  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelo) + ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpo),
      signal: senalDeCorte(corte)
    }
  );
  if (!r.ok) throw fallo(await r.text(), r.status, r.headers);
  const data = await r.json();
  const cand = (data.candidates || [])[0] || {};
  const partes = (cand.content && cand.content.parts) || [];
  const texto = partes.filter(p => p && p.text && !p.thought).map(p => p.text).join("\n").trim();
  if (!texto) {
    const e = new Error("respuesta vacía (" + (cand.finishReason || (data.promptFeedback && data.promptFeedback.blockReason) || "sin motivo") + ")");
    e.vacio = true;
    throw e;
  }
  return texto;
}

function fallo(texto, status, headers) {
  const t = String(texto);
  const err = new Error(t.slice(0, 300));
  err.estado = (status === 429) ? 429 : 502;
  // Modelo que esta clave no puede usar: no es una falla real, hay que probar el siguiente.
  // El 403 entra acá porque es lo que puede contestar un modelo restringido (los 2.5 desde
  // el 18/09/2026, para los proyectos que no los usaban): si no, cortaba la rotación.
  err.modeloInexistente = status === 404 || status === 403 || /NOT_FOUND|not_found|not found|does not exist|is not supported for generateContent|unknown model/i.test(t);
  // El modelo no acepta thinkingConfig: hay que repetir el pedido sin eso.
  err.sinPensarNoSoportado = status === 400 && /thinking/i.test(t);
  // El modelo está saturado o falló de su lado (500 INTERNAL, 504 DEADLINE_EXCEEDED: la
  // guía de errores de Gemini dice que se reintenten, y aparecen justo con carga). No es
  // una falla de la cuenta ni del pedido: hay que probar el siguiente de la lista, que es
  // justamente para lo que está. INTERNAL y DEADLINE_EXCEEDED van sin /i para no agarrar
  // un "internal" suelto en el texto de un 400.
  err.modeloOcupado = [500, 502, 503, 504, 529].includes(status) || /INTERNAL|DEADLINE_EXCEEDED/.test(t) || /UNAVAILABLE|high demand|overloaded/i.test(t);
  // Sin cuota: por minuto se libera enseguida; la diaria, recién al otro día.
  err.cuota = status === 429 || /RESOURCE_EXHAUSTED|rate_limit_error/i.test(t);
  if (err.cuota) {
    let ms = 60000;
    const d = t.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (d) ms = Math.ceil(parseFloat(d[1]) * 1000) + 1000;
    const ra = headers && headers.get && Number(headers.get("retry-after"));
    if (ra) ms = ra * 1000 + 1000;
    err.diaria = /PerDay|per day|daily/i.test(t);
    if (err.diaria) ms = Math.max(ms, 3600000);
    err.esperaMs = Math.min(ms, 6 * 3600000);
  }
  return err;
}

function extraerJSON(texto) {
  const intentos = [texto];
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) intentos.push(fence[1]);
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a !== -1 && b > a) intentos.push(texto.slice(a, b + 1));
  for (const t of intentos) {
    try { const v = JSON.parse(t.trim()); if (v && typeof v === "object") return v; } catch (e) {}
  }
  return null;
}

// Misma cuenta que puntuar() en index.html: parcial vale la mitad del peso, y si falta un
// criterio crítico el total queda topeado. Se repite acá para que lo que se guarda en el
// registro no dependa de lo que calculó el navegador.
function normEstado(v) {
  const st = String(v || "falto").toLowerCase().replace(/ó/g, "o").trim();
  return ["logrado", "parcial", "falto"].indexOf(st) === -1 ? "falto" : st;
}
function puntuar(datos, rubrica, tope) {
  const byId = {};
  (Array.isArray(datos.items) ? datos.items : []).forEach(i => { if (i && i.id) byId[String(i.id)] = i; });
  let suma = 0, total = 0, faltoCritico = false;
  rubrica.forEach(c => {
    if (!c || !c.id) return;
    const st = normEstado((byId[c.id] || {}).estado);
    const p = Math.max(0, Number(c.peso) || 0);
    suma += p * (st === "logrado" ? 1 : st === "parcial" ? 0.5 : 0);
    total += p;
    if (c.critico && st === "falto") faltoCritico = true;
  });
  const pts = total ? Math.round(suma / total * 100) : 0;
  const t = Number(tope) > 0 ? Number(tope) : 40;
  return { puntaje: faltoCritico ? Math.min(pts, t) : pts, topeado: faltoCritico && pts > t };
}

/* ======================================================================
   Base de datos (Upstash Redis por REST) — repetido en api/datos.js
   ====================================================================== */

const P = "s107:";
const RETENCION_DIAS = 400;   // ~13 meses; lo dice la política de privacidad

function kvConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

async function kvPipe(cmds) {
  const c = kvConfig();
  if (!c) throw new Error("sin base de datos");
  // Con tope de tiempo: si la base no contesta, mejor un error que se lea ("base") que una
  // función colgada hasta que la corta Vercel.
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { authorization: "Bearer " + c.token, "content-type": "application/json" },
    body: JSON.stringify(cmds.map(x => x.map(v => String(v)))),
    signal: AbortSignal.timeout(10000)
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(d)) throw new Error("base de datos: " + ((d && d.error) || r.status));
  return d.map(x => (x && Object.prototype.hasOwnProperty.call(x, "result")) ? x.result : null);
}
async function kv(...cmd) { return (await kvPipe([cmd]))[0]; }

function normCodigo(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function hoyAR() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); }
function nuevoId() { return Date.now().toString(36) + randomBytes(4).toString("hex"); }
function json(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }

function requiereCodigo() {
  return Boolean((process.env.CODIGO_ACCESO || "").trim() || (process.env.CODIGO_ADMIN || "").trim() || kvConfig());
}

function cuentaPrincipal() {
  return { id: "principal", nombre: (process.env.NOMBRE_PRINCIPAL || "Kalu Lab").trim(), tipo: "institucion", plan: "cortesia", cupoMensual: 0, activa: true, vence: null };
}
async function leerCuenta(id) {
  const c = json(await kv("GET", P + "cuenta:" + id));
  if (c) return c;
  return id === "principal" ? cuentaPrincipal() : null;
}
function bloqueoDeCuenta(c) {
  if (!c) return "codigo_invalido";
  if (c.activa === false) return "cuenta_inactiva";
  if (c.vence && hoyAR() > c.vence) return "cuenta_vencida";
  return null;
}
function textoBloqueo(b) {
  return {
    cuenta_inactiva: "La cuenta de tu institución está pausada. Consultalo con tu instructor.",
    cuenta_vencida: "La suscripción de tu institución venció. Consultalo con tu instructor.",
    sala_cerrada: "Esa clase ya terminó. Pedile a tu instructor el código de la clase nueva."
  }[b] || "No tenés acceso.";
}

// Un código puede ser: el del administrador, el de la cuenta principal (CODIGO_ACCESO),
// el de los alumnos o el del instructor de una cuenta, o el de una clase abierta (sala).
const cacheAcceso = new Map();
async function resolverCodigo(bruto) {
  const c = normCodigo(bruto);
  if (!c || c.length < 3) return null;
  const admin = normCodigo(process.env.CODIGO_ADMIN), acceso = normCodigo(process.env.CODIGO_ACCESO);
  if (admin && iguales(c, admin)) return { rol: "admin", cuentaId: "principal" };
  if (acceso && iguales(c, acceso)) return { rol: "alumno", cuentaId: "principal" };
  if (!kvConfig()) return null;
  const hit = cacheAcceso.get(c);
  if (hit && hit.hasta > Date.now()) return hit.v;

  // salainfo: dura 90 días. Si la clase terminó hace más de 6 h (sala: ya no está), el
  // código se sigue reconociendo como una clase que terminó: si no, los celulares que lo
  // tienen guardado lo mandan al abrir la app, leen "código equivocado" y cada uno suma un
  // intento fallido al freno de la IP del aula.
  const [cAl, cIn, salaTxt, infoTxt] = await kvPipe([["GET", P + "cod:" + c], ["GET", P + "codi:" + c], ["GET", P + "sala:" + c], ["GET", P + "salainfo:" + c]]);
  let v = null;
  const sala = json(salaTxt) || json(infoTxt);
  if (sala) {
    v = { rol: "alumno", cuentaId: sala.cuentaId, sala };
    // Cerrada por el instructor o vencida por tiempo: para el alumno es lo mismo, "esa
    // clase terminó", y no un "código equivocado" que cuenta como intento fallido.
    if (sala.cerrada || Number(sala.vence) <= Date.now()) v.bloqueo = "sala_cerrada";
  } else if (cIn) v = { rol: "instructor", cuentaId: cIn };
  else if (cAl) v = { rol: "alumno", cuentaId: cAl };
  if (v) {
    const cuenta = await leerCuenta(v.cuentaId);
    if (!cuenta) v = null;
    else { v.cuenta = cuenta; v.bloqueo = v.bloqueo || bloqueoDeCuenta(cuenta); }
  }
  cacheAcceso.set(c, { v, hasta: Date.now() + 30000 });
  if (cacheAcceso.size > 500) cacheAcceso.delete(cacheAcceso.keys().next().value);
  return v;
}

async function datosPublicos(acceso) {
  const salida = { rol: acceso.rol, registro: Boolean(kvConfig()) };
  let cuenta = acceso.cuenta || null;
  if (!cuenta && kvConfig()) { try { cuenta = await leerCuenta(acceso.cuentaId); } catch (e) {} }
  if (!cuenta && acceso.cuentaId === "principal") cuenta = cuentaPrincipal();
  if (cuenta) salida.cuenta = { nombre: cuenta.nombre, tipo: cuenta.tipo };
  if (acceso.sala) salida.sala = { codigo: acceso.sala.codigo, nombre: acceso.sala.nombre, perfil: acceso.sala.perfil || null, escenarios: acceso.sala.escenarios || null };
  // Escenarios que la institución cargó desde el panel: los ven todos sus alumnos.
  if (kvConfig() && acceso.cuentaId) {
    try {
      const h = await kv("HGETALL", P + "esc:" + acceso.cuentaId);
      const lista = [];
      if (Array.isArray(h)) for (let i = 1; i < h.length; i += 2) { const e = json(h[i]); if (e) lista.push(e); }
      salida.escenarios = lista;
    } catch (e) { salida.escenarios = []; }
  }
  return salida;
}

async function cupoDisponible(acceso) {
  if (!kvConfig() || !acceso.cuentaId) return { ok: true };
  const cuenta = acceso.cuenta || await leerCuenta(acceso.cuentaId);
  const cupo = Number(cuenta && cuenta.cupoMensual) || 0;
  if (!cupo) return { ok: true };
  const usadas = Number(await kv("HGET", P + "uso:" + acceso.cuentaId + ":" + hoyAR().slice(0, 7), "practicas")) || 0;
  if (usadas < cupo) return { ok: true };
  return { ok: false, detalle: "Tu institución ya usó las " + cupo + " prácticas de este mes. Consultalo con tu instructor." };
}

async function contarUso(acceso, campo, modelo, cuotas) {
  if (!kvConfig()) return;
  const hoy = hoyAR(), mes = hoy.slice(0, 7);
  const g = P + "usog:" + hoy;
  const cmds = [["HINCRBY", g, campo, 1], ["EXPIRE", g, RETENCION_DIAS * 86400]];
  if (modelo) cmds.push(["HINCRBY", g, "m:" + modelo, 1]);
  if (cuotas) cmds.push(["HINCRBY", g, "cuota429", cuotas]);
  if (acceso && acceso.cuentaId) {
    const u = P + "uso:" + acceso.cuentaId + ":" + mes;
    cmds.push(["HINCRBY", u, campo, 1], ["EXPIRE", u, 800 * 86400]);
  }
  try { await kvPipe(cmds); } catch (e) {}
}

// Los pedidos que se quedaron sin respuesta del modelo (cuota agotada en todos, errores,
// tiempo). contarUso sólo cuenta los que anduvieron, así que sin esto el día más saturado
// quedaba en «Uso y costos» vacío y sin marca. `sinRespuesta` los cuenta todos y
// `sinCuota` los que fueron por cuota: es la señal para pasar al plan pago.
async function contarFalla(e) {
  if (!kvConfig()) return;
  const g = P + "usog:" + hoyAR();
  const cmds = [["HINCRBY", g, "sinRespuesta", 1], ["EXPIRE", g, RETENCION_DIAS * 86400]];
  if (e && e.cuota) cmds.push(["HINCRBY", g, "sinCuota", 1]);
  try { await kvPipe(cmds); } catch (x) {}
}

// ---- intentos fallidos de código: freno contra el que prueba al azar ----
// Se cuentan códigos DISTINTOS por conexión, no pedidos. En un aula todos los celulares
// salen por la misma IP: contando pedidos, un celular que reintentaba solo con un código
// viejo (cada frase, cada sondeo) llegaba a 30 en un par de minutos y dejaba afuera a la
// clase entera. El que prueba al azar usa códigos distintos, así que lo frena igual.
// `freno` separa contadores: "alumnos" (acá y en sala-estado) y "panel" (api/datos.js), así
// los errores de los alumnos no dejan afuera al instructor. Claves nuevas (rl:alumnos:,
// rl:panel:) porque las viejas rl:cod: eran de otro tipo.
const intentosMem = new Map();
function huellaDeCodigo(codigo) { return createHash("sha256").update(normCodigo(codigo)).digest("hex").slice(0, 12); }
async function demasiadosIntentos(ip, freno) {
  if (!ip) return false;
  if (kvConfig()) {
    try { return (Number(await kv("SCARD", P + "rl:" + freno + ":" + ip)) || 0) >= 30; } catch (e) { return false; }
  }
  const m = intentosMem.get(freno + ":" + ip);
  return Boolean(m && m.hasta > Date.now() && m.codigos.size >= 30);
}
async function anotarIntento(ip, codigo, freno) {
  if (!ip) return;
  const h = huellaDeCodigo(codigo);
  if (kvConfig()) {
    const k = P + "rl:" + freno + ":" + ip;
    try { await kvPipe([["SADD", k, h], ["EXPIRE", k, 600]]); } catch (e) {}
    return;
  }
  const m = intentosMem.get(freno + ":" + ip);
  if (m && m.hasta > Date.now()) { m.codigos.add(h); m.hasta = Date.now() + 600000; }
  else intentosMem.set(freno + ":" + ip, { codigos: new Set([h]), hasta: Date.now() + 600000 });
  if (intentosMem.size > 1000) intentosMem.delete(intentosMem.keys().next().value);
}
function ipDe(req) {
  const h = req.headers || {};
  const f = String(h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim();
  return f ? createHash("sha256").update(f).digest("hex").slice(0, 16) : "";
}

/* ======================================================================
   Registro de prácticas
   ====================================================================== */

function corto(v, n) { return String(v == null ? "" : v).slice(0, n); }
// El nombre del grupo en el tablero de la clase. Lo usan guardarPractica y el aviso de
// "evaluando": tiene que ser la misma cuenta, o cada uno escribe en otra tarjeta.
function grupoDe(r) { return corto(r.grupo || r.alias || "Sin nombre", 40).trim() || "Sin nombre"; }
const FORMA_ID_PRACTICA = /^[a-z0-9]{8,40}$/;   // la de nuevoId() y la que arma la app

async function guardarPractica(acceso, cuerpo, { datos, modelo, calc, error }) {
  const r = cuerpo.registro;
  const ahora = Date.now();
  // El id lo puede traer el pedido: la app lo arma al empezar la llamada. Así, si la
  // práctica se guardó pero la respuesta no llegó al celular (cambio de wifi a datos,
  // pantalla bloqueada), el reintento encuentra la misma práctica en vez de crear otra y
  // contarla dos veces en el cupo, el tablero y el índice. Un id que ya es de otra cuenta
  // no se pisa: esa práctica recibe uno nuevo.
  let previa = null;
  let idPedido = FORMA_ID_PRACTICA.test(String(cuerpo.practicaId || "")) ? String(cuerpo.practicaId) : null;
  if (idPedido) {
    const p = json(await kv("GET", P + "p:" + idPedido));
    if (p && p.cuentaId === acceso.cuentaId) previa = p;
    else if (p) idPedido = null;
  }
  const id = previa ? previa.id : (idPedido || nuevoId());
  const sala = acceso.sala ? acceso.sala.codigo : null;
  const grupo = grupoDe(r);
  const transcripcion = (Array.isArray(r.transcripcion) ? r.transcripcion : []).slice(0, 80)
    .map(l => ({ w: l && l.w === "op" ? "op" : "yo", t: Math.max(0, Number(l && l.t) || 0), x: corto(l && l.x, 900) }));

  const reg = {
    id, cuentaId: acceso.cuentaId, sala, grupo,
    alias: corto(r.alias || grupo, 40),
    rol: acceso.rol,
    fecha: previa ? previa.fecha : ahora,
    perfil: r.perfil === "lego" ? "lego" : "guardavidas",
    dificultad: corto(r.dificultad, 12),
    escenario: {
      id: corto(r.escenario && r.escenario.id, 60), titulo: corto(r.escenario && r.escenario.titulo, 140),
      fam: corto(r.escenario && r.escenario.fam, 40), guia: corto(r.escenario && r.escenario.guia, 30)
    },
    duracionMs: Math.max(0, Number(r.duracionMs) || 0),
    // "tiempo": la terminó la app (lego sin ubicación, con el operador todavía en línea).
    cortoPor: r.cortoPor === "operador" || r.cortoPor === "tiempo" ? r.cortoPor : "alumno",
    turnosOperador: Number(r.turnosOperador) || 0,
    grado: r.grado == null ? null : Number(r.grado),
    esenciales: corto(r.esenciales, 12),
    // Modo lego: a qué altura de la llamada dijo que empezó a comprimir.
    tRcpMs: r.tRcpMs == null ? null : Math.max(0, Number(r.tRcpMs) || 0),
    rubrica: (Array.isArray(cuerpo.rubrica) ? cuerpo.rubrica : []).slice(0, 30)
      .map(c => ({ id: corto(c.id, 30), label: corto(c.label, 90), peso: Number(c.peso) || 0, critico: Boolean(c.critico) })),
    topeCritico: Number(cuerpo.topeCritico) || 40,
    transcripcion,
    evaluacion: datos || (previa && previa.evaluacion) || null,
    puntaje: calc ? calc.puntaje : (previa ? previa.puntaje : null),
    topeado: calc ? calc.topeado : Boolean(previa && previa.topeado),
    modeloEvaluador: modelo || (previa && previa.modeloEvaluador) || null,
    error: datos ? null : (error ? corto(error.codigo, 40) : null),
    revision: previa ? previa.revision || null : null
  };

  const cmds = [
    ["SET", P + "p:" + id, JSON.stringify(reg), "EX", RETENCION_DIAS * 86400],
    ["ZADD", P + "idx:" + acceso.cuentaId, reg.fecha, id],
    ["ZREMRANGEBYSCORE", P + "idx:" + acceso.cuentaId, "-inf", ahora - RETENCION_DIAS * 86400000]
  ];
  if (!previa) {
    const u = P + "uso:" + acceso.cuentaId + ":" + hoyAR().slice(0, 7);
    cmds.push(["HINCRBY", u, "practicas", 1], ["EXPIRE", u, 800 * 86400]);
  }
  if (sala) {
    if (!previa) cmds.push(["RPUSH", P + "salaprac:" + sala, id], ["EXPIRE", P + "salaprac:" + sala, 90 * 86400]);
    cmds.push(["HSET", P + "salaest:" + sala, grupo.toLowerCase(), JSON.stringify({
      grupo, estado: datos ? "terminada" : "sin devolución", escenario: reg.escenario.titulo,
      perfil: reg.perfil, puntaje: reg.puntaje, practicaId: id, t: ahora
    })]);
    cmds.push(["EXPIRE", P + "salaest:" + sala, 3 * 86400]);
  }
  await kvPipe(cmds);
  return id;
}
