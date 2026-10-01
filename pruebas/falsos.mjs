// Dobles de prueba: una base Upstash en memoria y un Gemini de mentira.
// Se enganchan reemplazando global.fetch, así las funciones de api/ corren tal cual,
// sin red y sin gastar cuota. No se despliegan (ver .vercelignore).

export const URL_BASE = "https://base-falsa.upstash.io";

/* ---------------- Upstash Redis en memoria ---------------- */

export function crearRedis() {
  const datos = new Map();   // clave -> { tipo, v, vence }
  const ahora = () => Date.now();
  const vivo = k => {
    const e = datos.get(k);
    if (!e) return null;
    if (e.vence && e.vence <= ahora()) { datos.delete(k); return null; }
    return e;
  };
  const de = (k, tipo, crear) => {
    let e = vivo(k);
    if (!e && crear) { e = { tipo, v: tipo === "hash" ? new Map() : tipo === "set" ? new Set() : tipo === "zset" ? new Map() : tipo === "list" ? [] : null, vence: 0 }; datos.set(k, e); }
    if (e && e.tipo !== tipo) throw new Error("WRONGTYPE " + k);
    return e;
  };
  const num = v => Number(v);
  const ordenZ = z => [...z.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const rango = (min, max) => {
    const p = x => x === "-inf" ? -Infinity : x === "+inf" ? Infinity : Number(x);
    return [p(min), p(max)];
  };

  const cmds = {
    PING: () => "PONG",
    GET: k => { const e = de(k, "str"); return e ? e.v : null; },
    SET: (k, v, ...op) => {
      let ex = 0, nx = false, keep = false;
      for (let i = 0; i < op.length; i++) {
        const o = String(op[i]).toUpperCase();
        if (o === "EX") ex = num(op[++i]); else if (o === "NX") nx = true; else if (o === "KEEPTTL") keep = true;
      }
      const previo = vivo(k);
      if (nx && previo) return null;
      datos.set(k, { tipo: "str", v: String(v), vence: ex ? ahora() + ex * 1000 : (keep && previo ? previo.vence : 0) });
      return "OK";
    },
    DEL: (...ks) => ks.reduce((n, k) => n + (datos.delete(k) ? 1 : 0), 0),
    EXPIRE: (k, s) => { const e = vivo(k); if (!e) return 0; e.vence = ahora() + num(s) * 1000; return 1; },
    TTL: k => { const e = vivo(k); if (!e) return -2; return e.vence ? Math.ceil((e.vence - ahora()) / 1000) : -1; },
    INCR: k => { const e = de(k, "str", true); e.v = String((num(e.v) || 0) + 1); return num(e.v); },
    MGET: (...ks) => ks.map(k => { const e = vivo(k); return e && e.tipo === "str" ? e.v : null; }),
    HSET: (k, ...fv) => { const e = de(k, "hash", true); let n = 0; for (let i = 0; i < fv.length; i += 2) { if (!e.v.has(fv[i])) n++; e.v.set(fv[i], String(fv[i + 1])); } return n; },
    HGET: (k, f) => { const e = de(k, "hash"); return e && e.v.has(f) ? e.v.get(f) : null; },
    HGETALL: k => { const e = de(k, "hash"); return e ? [...e.v.entries()].flat() : []; },
    HDEL: (k, ...fs) => { const e = de(k, "hash"); if (!e) return 0; return fs.reduce((n, f) => n + (e.v.delete(f) ? 1 : 0), 0); },
    HLEN: k => { const e = de(k, "hash"); return e ? e.v.size : 0; },
    HEXISTS: (k, f) => { const e = de(k, "hash"); return e && e.v.has(f) ? 1 : 0; },
    HINCRBY: (k, f, n) => { const e = de(k, "hash", true); const v = (num(e.v.get(f)) || 0) + num(n); e.v.set(f, String(v)); return v; },
    SADD: (k, ...ms) => { const e = de(k, "set", true); let n = 0; ms.forEach(m => { if (!e.v.has(m)) { e.v.add(m); n++; } }); return n; },
    SMEMBERS: k => { const e = de(k, "set"); return e ? [...e.v] : []; },
    SCARD: k => { const e = de(k, "set"); return e ? e.v.size : 0; },
    ZADD: (k, ...sm) => { const e = de(k, "zset", true); let n = 0; for (let i = 0; i < sm.length; i += 2) { if (!e.v.has(sm[i + 1])) n++; e.v.set(sm[i + 1], num(sm[i])); } return n; },
    ZREM: (k, ...ms) => { const e = de(k, "zset"); if (!e) return 0; return ms.reduce((n, m) => n + (e.v.delete(m) ? 1 : 0), 0); },
    ZREVRANGE: (k, a, b) => {
      const e = de(k, "zset"); if (!e) return [];
      const l = ordenZ(e.v).reverse().map(x => x[0]);
      const fin = num(b) < 0 ? l.length + num(b) : num(b);
      return l.slice(num(a), fin + 1);
    },
    ZREVRANGEBYSCORE: (k, max, min, ...op) => {
      const e = de(k, "zset"); if (!e) return [];
      const [lo, hi] = rango(min, max);
      let l = ordenZ(e.v).reverse().filter(x => x[1] >= lo && x[1] <= hi).map(x => x[0]);
      const i = op.findIndex(o => String(o).toUpperCase() === "LIMIT");
      if (i >= 0) l = l.slice(num(op[i + 1]), num(op[i + 1]) + num(op[i + 2]));
      return l;
    },
    ZREMRANGEBYSCORE: (k, min, max) => {
      const e = de(k, "zset"); if (!e) return 0;
      const [lo, hi] = rango(min, max);
      let n = 0;
      for (const [m, sc] of [...e.v.entries()]) if (sc >= lo && sc <= hi) { e.v.delete(m); n++; }
      return n;
    },
    RPUSH: (k, ...vs) => { const e = de(k, "list", true); e.v.push(...vs.map(String)); return e.v.length; },
    LRANGE: (k, a, b) => { const e = de(k, "list"); if (!e) return []; const fin = num(b) < 0 ? e.v.length + num(b) : num(b); return e.v.slice(num(a), fin + 1); },
    LREM: (k, c, v) => { const e = de(k, "list"); if (!e) return 0; const antes = e.v.length; e.v = e.v.filter(x => x !== String(v)); return antes - e.v.length; }
  };

  let llamadas = 0;
  return {
    datos,
    get llamadas() { return llamadas; },
    ejecutar(cmd) {
      llamadas++;
      const [nombre, ...args] = cmd;
      const f = cmds[String(nombre).toUpperCase()];
      if (!f) return { error: "ERR comando no soportado por el doble: " + nombre };
      try { return { result: f(...args.map(String)) }; } catch (e) { return { error: String(e.message) }; }
    }
  };
}

/* ---------------- Gemini de mentira ----------------
   `modelos`: los que "existen" para la clave. Los demás devuelven 404.
   `cuota`: modelo -> cuántos pedidos seguidos contestar con 429 (y de qué tipo).
   `operador(sistema, contenidos, modelo)` y `evaluador(prompt, modelo)` arman la respuesta. */
export function crearGemini(opciones = {}) {
  const modelos = new Set(opciones.modelos || ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]);
  const cuota = opciones.cuota || {};
  const registro = [];
  return {
    registro,
    // Una prueba puede cambiar el operador en el medio (y volver a null al terminar).
    operador: null,
    async responder(url, init) {
      const m = url.match(/models\/([^:]+):generateContent/);
      if (!m) {
        if (/\/v1beta\/models\?/.test(url)) return json(200, { models: [...modelos].map(n => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) });
        return json(404, { error: { code: 404, status: "NOT_FOUND" } });
      }
      const modelo = decodeURIComponent(m[1]);
      const cuerpo = JSON.parse(init.body);
      registro.push({ modelo, cuerpo });
      if (!modelos.has(modelo)) return json(404, { error: { code: 404, message: "models/" + modelo + " is not found for API version v1beta", status: "NOT_FOUND" } });
      const c = cuota[modelo];
      if (c && c.restantes > 0) {
        c.restantes--;
        const quotaId = c.diaria ? "GenerateRequestsPerDayPerProjectPerModel-FreeTier" : "GenerateRequestsPerMinutePerProjectPerModel-FreeTier";
        return json(429, { error: { code: 429, message: "You exceeded your current quota", status: "RESOURCE_EXHAUSTED",
          details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaDimensions: { model: modelo } }] },
                    { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" }] } });
      }
      const sistema = (cuerpo.systemInstruction && cuerpo.systemInstruction.parts[0].text) || "";
      const esEvaluador = /Respondés únicamente con un objeto JSON/.test(sistema);
      const texto = esEvaluador
        ? (opciones.evaluador || evaluadorPorDefecto)(cuerpo.contents[0].parts[0].text, modelo)
        : (this.operador || opciones.operador || operadorPorDefecto)(sistema, cuerpo.contents, modelo);
      return json(200, { candidates: [{ content: { parts: [{ text: texto }], role: "model" }, finishReason: "STOP" }] });
    }
  };
}

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

// Da por logrados todos los criterios que aparecen en la vara del prompt.
export function evaluadorPorDefecto(prompt) {
  const ids = [...prompt.matchAll(/^- ([a-z_]+) \(/gm)].map(m => m[1]);
  return JSON.stringify({
    titular: "Llamada completa y ordenada",
    turno_ubicacion: 1, turno_respiracion: 2,
    items: ids.map(id => ({ id, estado: "logrado", comentario: "Lo dijo con claridad." })),
    bien: ["Dio la ubicación primero."], corregir: ["Seguí así."]
  });
}

// Un operador que sigue al pie de la letra el ESTADO DE LA LLAMADA que arma la app.
// Marca como datos las palabras clave que dijo el alumno; así se puede manejar la
// llamada entera desde una prueba.
const CLAVES = [
  ["ubicacion", /(costanera|calle|altura|bv\.|puesto|ruta|quinta|gimnasio|piso)/i],
  ["motivo", /(saqu|sac[oó]|desplom|cay[oó]|se tir[oó]|ahog)/i],
  ["victimas", /(años|hombre|mujer|nene|chico|dos )/i],
  ["estado", /(no responde|no respira|respira|inconsciente)/i],
  ["acciones", /(comprim|ventil|rcp)/i],
  ["material", /(dea|desfibrilador|bolso)/i],
  ["acceso", /(bajada|portón|port[oó]n|espera|esperando|entrada)/i],
  ["identificacion", /(soy |guardavidas|me llamo)/i],
  ["conciencia", /(no responde|no contesta|no reacciona)/i],
  ["respiracion", /(no respira|ronca|boquea|ruido)/i],
  ["dea", /(dea|desfibrilador)/i],
  ["telefono", /(\d{6,}|tel[eé]fono)/i]
];
export function operadorPorDefecto(sistema, contenidos) {
  const estado = sistema.slice(sistema.lastIndexOf("ESTADO DE LA LLAMADA"));
  const dichos = contenidos.filter(c => c.role === "user").map(c => c.parts[0].text).join(" ");
  const validos = (sistema.match(/Identificadores válidos: ([^.]+)\./) || [, ""])[1].split(",").map(x => x.trim().split(" ")[0]).filter(Boolean);
  const tengo = CLAVES.filter(([id, re]) => validos.includes(id) && re.test(dichos)).map(([id]) => id);
  const marcas = "\n[[DATOS:" + tengo.join(",") + "]]";
  if (/SE TERMINÓ/.test(estado)) return "Sin la dirección no puedo mandarte la ambulancia. Averiguala y volvé a llamar al 107." + marcas + "\n[[CERRAR]]";
  if (/LA AMBULANCIA ESTÁ LLEGANDO/.test(estado)) return "La ambulancia ya está ahí. Seguí comprimiendo hasta que los paramédicos se hagan cargo. Voy a cortar." + marcas + "\n[[CERRAR]]";
  if (/te toca CERRAR/.test(estado)) return "El móvil ya está en camino. Voy a cortar: si cambia la situación, volvé a llamar al 107." + marcas + "\n[[CERRAR]]";
  if (/decile en una frase corta que la ambulancia ya sale/.test(estado)) return "La ambulancia ya sale. Seguí así, fuerte y rápido." + marcas;
  if (/YA ESTÁ HACIENDO LA RCP/.test(estado)) return "Muy bien, seguí así, fuerte y rápido." + marcas;
  if (/YA TENÉS LO ESENCIAL/.test(estado)) return "La ambulancia ya sale. Poné el teléfono en altavoz y empezá a empujar fuerte en el medio del pecho." + marcas;
  if (/YA TENÉS TODO LO ESENCIAL/.test(estado)) return "El SEM ya está en camino, llega en unos 6 minutos. ¿Quién sos?" + marcas + "\n[[GRADO:6]]";
  if (/TODAVÍA TE FALTA LO ESENCIAL/.test(estado)) return "Entendido. ¿Qué más me podés decir?" + marcas + "\n[[GRADO:0]]";
  return "Recibido." + marcas;
}

/* ---------------- enchufar los dobles en fetch ---------------- */
export function instalarFetch({ redis, gemini, realFetch }) {
  const original = realFetch || globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith(URL_BASE)) {
      const cuerpo = JSON.parse(init.body || "[]");
      if (u.endsWith("/pipeline")) return json(200, cuerpo.map(c => redis.ejecutar(c)));
      return json(200, redis.ejecutar(cuerpo));
    }
    if (u.startsWith("https://generativelanguage.googleapis.com/")) return gemini.responder(u, init);
    if (u.startsWith("https://api.anthropic.com/")) return json(500, { error: "sin red en las pruebas" });
    return original(url, init);
  };
  return () => { globalThis.fetch = original; };
}

// Un req/res al estilo Vercel, para llamar a los handlers sin servidor.
export function reqRes({ method = "POST", body = null, headers = {}, query = {} } = {}) {
  const req = { method, body, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), query };
  const res = {
    statusCode: 200, cuerpo: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.cuerpo = o; return this; }
  };
  return { req, res };
}
