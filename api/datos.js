// Simulador 107 — función del servidor: registro, salas de clase, panel y contactos.
//
// Necesita la base de datos (Upstash Redis, se conecta desde Vercel → Storage). Sin
// base, responde "sin_base" y la app sigue andando como antes, sin registro.
//
// Quién puede qué:
//   - Cualquiera: GET ?info=1 (datos públicos para las páginas) y dejar un contacto.
//   - Alumno (código de alumnos, de sala, o CODIGO_ACCESO): avisar en qué estado está su
//     grupo dentro de una clase abierta.
//   - Instructor (código de instructor de su cuenta): el panel de SU cuenta.
//   - Administrador (CODIGO_ADMIN): todo, incluidas las cuentas de los clientes.
//
// Variables de entorno que lee además de la base: CODIGO_ADMIN, CODIGO_ACCESO,
// NOMBRE_PRINCIPAL, MOSTRAR_PRECIOS, TITULAR_NOMBRE, TITULAR_CUIT, TITULAR_DOMICILIO,
// CONTACTO_EMAIL, CONTACTO_WHATSAPP, CODIGO_DEMO.
//
// No importa nada de otros archivos del proyecto a propósito (ver api/chat.js).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (req.query && req.query.info) return res.status(200).json(await infoPublica());
    return res.status(200).json({ registro: Boolean(kvConfig()) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "metodo_no_permitido" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { return res.status(400).json({ error: "json_invalido" }); } }
  if (!b || typeof b !== "object") return res.status(400).json({ error: "cuerpo_vacio" });
  const accion = String(b.accion || "");
  const ip = ipDe(req);

  if (!kvConfig()) {
    return res.status(503).json({ error: "sin_base", detalle: "Falta conectar la base de datos (Vercel → Storage → Upstash for Redis) y volver a desplegar." });
  }

  try {
    // ---------------- público ----------------
    if (accion === "contacto") return res.status(200).json(await guardarContacto(b, ip));

    // ---------------- alumno dentro de una clase ----------------
    if (accion === "sala-estado") {
      const acc = await resolverCodigo(req.headers["x-codigo"]);
      if (!acc) return res.status(401).json({ error: "codigo_invalido" });
      if (!acc.sala || acc.bloqueo) return res.status(200).json({ ok: false });
      const grupo = corto(b.grupo, 40).trim() || "Sin nombre";
      const estado = ["conectado", "en llamada", "evaluando"].includes(b.estado) ? b.estado : "conectado";
      const k = P + "salaest:" + acc.sala.codigo;
      await kvPipe([
        ["HSET", k, grupo.toLowerCase(), JSON.stringify({ grupo, estado, escenario: corto(b.escenario, 140), perfil: b.perfil === "lego" ? "lego" : "guardavidas", t: Date.now() })],
        ["EXPIRE", k, 3 * 86400]
      ]);
      return res.status(200).json({ ok: true });
    }

    // ---------------- panel: instructor o administrador ----------------
    if (await demasiadosIntentos(ip)) return res.status(429).json({ error: "demasiados_intentos", detalle: "Muchos códigos equivocados seguidos. Esperá diez minutos." });
    const codigoPanel = String(req.headers["x-panel"] || "");
    const acc = await resolverCodigo(codigoPanel);
    if (!acc || (acc.rol !== "instructor" && acc.rol !== "admin")) {
      if (codigoPanel.trim()) await anotarIntento(ip);
      return res.status(401).json({ error: "codigo_invalido", detalle: "Ese no es un código de instructor." });
    }
    const esAdmin = acc.rol === "admin";
    // El administrador puede mirar cualquier cuenta; el instructor, sólo la suya.
    const cuentaId = esAdmin && b.cuentaId ? corto(b.cuentaId, 40) : acc.cuentaId;
    if (!esAdmin && acc.bloqueo) return res.status(403).json({ error: acc.bloqueo });

    const acciones = {
      "panel": () => datosPanel(cuentaId, acc, esAdmin),
      "salas": () => listarSalas(cuentaId),
      "sala-crear": () => crearSala(cuentaId, b),
      "sala-cerrar": () => cerrarSala(cuentaId, b.codigo),
      "sala-vivo": () => salaEnVivo(cuentaId, b.codigo),
      "practicas": () => listarPracticas(cuentaId, b),
      "practica": () => leerPractica(cuentaId, b.id),
      "revisar": () => revisarPractica(cuentaId, b),
      "practica-borrar": () => borrarPractica(cuentaId, b.id),
      "escenarios": () => listarEscenarios(cuentaId),
      "escenario-guardar": () => guardarEscenario(cuentaId, b.escenario),
      "escenario-borrar": () => borrarEscenario(cuentaId, b.id),
      "codigo-regenerar": () => regenerarCodigo(cuentaId, b.tipo)
    };
    const soloAdmin = {
      "cuentas": () => listarCuentas(),
      "cuenta-guardar": () => guardarCuenta(b.cuenta),
      "contactos": () => listarContactos(),
      "contacto-estado": () => estadoContacto(b.id, b.estado, b.nota),
      "uso": () => usoGlobal(b.dias)
    };
    if (acciones[accion]) return res.status(200).json(await acciones[accion]());
    if (soloAdmin[accion]) {
      if (!esAdmin) return res.status(403).json({ error: "solo_admin" });
      return res.status(200).json(await soloAdmin[accion]());
    }
    return res.status(400).json({ error: "accion_desconocida" });
  } catch (e) {
    const estado = e && e.estado ? e.estado : 500;
    return res.status(estado).json({ error: e.codigo || "error", detalle: String((e && e.message) || e).slice(0, 300) });
  }
}

function problema(codigo, detalle, estado) { const e = new Error(detalle); e.codigo = codigo; e.estado = estado || 400; return e; }

/* ======================================================================
   Público
   ====================================================================== */

async function infoPublica() {
  const env = k => (process.env[k] || "").trim();
  return {
    registro: Boolean(kvConfig()),
    precios: env("MOSTRAR_PRECIOS") === "1",
    titular: { nombre: env("TITULAR_NOMBRE"), cuit: env("TITULAR_CUIT"), domicilio: env("TITULAR_DOMICILIO") },
    contacto: { email: env("CONTACTO_EMAIL"), whatsapp: env("CONTACTO_WHATSAPP") },
    demo: await codigoDemo(env("CODIGO_DEMO"))
  };
}

// El código de la demo pública sale en la página para instructores. Sólo se publica si
// es un código de ALUMNOS de alguna cuenta (la cuenta "Demo", con su cupo mensual como
// freno): si por error se cargó el de administración o uno de instructor, no se muestra.
async function codigoDemo(bruto) {
  const c = normCodigo(bruto);
  if (!c || !kvConfig()) return null;
  if (iguales(c, normCodigo(process.env.CODIGO_ADMIN))) return null;
  try {
    const [alumnos, instructor] = await kvPipe([["GET", P + "cod:" + c], ["GET", P + "codi:" + c]]);
    return alumnos && !instructor ? String(bruto).trim() : null;
  } catch (e) { return null; }
}

async function guardarContacto(b, ip) {
  // El campo "web" está escondido en el formulario: sólo lo completa un robot.
  if (b.web) return { ok: true };
  const k = P + "rl:contacto:" + (ip || "x");
  const [n] = await kvPipe([["INCR", k], ["EXPIRE", k, 3600]]);
  if (Number(n) > 5) throw problema("demasiados", "Ya recibimos varios mensajes desde esta conexión. Probá más tarde.", 429);
  const nombre = corto(b.nombre, 80).trim(), email = corto(b.email, 120).trim(), telefono = corto(b.telefono, 40).trim();
  if (!nombre || (!email && !telefono)) throw problema("faltan_datos", "Dejanos tu nombre y un mail o un teléfono para responderte.");
  const id = nuevoId();
  const lead = {
    id, fecha: Date.now(), nombre, email, telefono,
    institucion: corto(b.institucion, 120).trim(), rol: corto(b.rol, 60).trim(),
    mensaje: corto(b.mensaje, 1200).trim(), origen: corto(b.origen, 60), estado: "nuevo", nota: ""
  };
  await kvPipe([["SET", P + "lead:" + id, JSON.stringify(lead), "EX", RETENCION_DIAS * 86400], ["ZADD", P + "leads", lead.fecha, id]]);
  return { ok: true };
}

/* ======================================================================
   Panel
   ====================================================================== */

async function datosPanel(cuentaId, acc, esAdmin) {
  const cuenta = await leerCuenta(cuentaId);
  if (!cuenta) throw problema("sin_cuenta", "Esa cuenta no existe.", 404);
  const mes = hoyAR().slice(0, 7);
  const uso = hashAObjeto(await kv("HGETALL", P + "uso:" + cuentaId + ":" + mes));
  return {
    rol: acc.rol, esAdmin,
    cuenta: publicaCuenta(cuenta),
    usoMes: { mes, practicas: Number(uso.practicas) || 0, turnos: Number(uso.turnos) || 0, evaluaciones: Number(uso.evaluaciones) || 0 },
    codigoEnv: cuentaId === "principal" && Boolean((process.env.CODIGO_ACCESO || "").trim())
  };
}

function publicaCuenta(c) {
  return {
    id: c.id, nombre: c.nombre, tipo: c.tipo || "instructor", plan: c.plan || "prueba",
    cupoMensual: Number(c.cupoMensual) || 0, vence: c.vence || null, activa: c.activa !== false,
    codigoAlumnos: c.codigoAlumnos || null, codigoInstructor: c.codigoInstructor || null,
    contacto: c.contacto || "", notas: c.notas || "", creada: c.creada || null
  };
}

// ---------------- salas (clases en vivo) ----------------

async function crearSala(cuentaId, b) {
  const horas = Math.min(12, Math.max(1, Number(b.horas) || 3));
  const ahora = Date.now();
  const sala = {
    codigo: null, cuentaId, nombre: corto(b.nombre, 80).trim() || ("Clase del " + hoyAR()),
    creada: ahora, vence: ahora + horas * 3600000, cerrada: false,
    perfil: b.perfil === "lego" || b.perfil === "guardavidas" ? b.perfil : null,
    escenarios: Array.isArray(b.escenarios) ? b.escenarios.slice(0, 30).map(x => corto(x, 60)) : null
  };
  for (let i = 0; i < 6 && !sala.codigo; i++) {
    const cod = generarCodigo(6);
    const ok = await kv("SET", P + "sala:" + cod, JSON.stringify({ ...sala, codigo: cod }), "EX", horas * 3600, "NX");
    if (ok === "OK") sala.codigo = cod;
  }
  if (!sala.codigo) throw problema("sin_codigo", "No se pudo generar el código de la clase. Probá de nuevo.", 500);
  await kvPipe([
    ["SET", P + "salainfo:" + sala.codigo, JSON.stringify(sala), "EX", 90 * 86400],
    ["ZADD", P + "salas:" + cuentaId, ahora, sala.codigo],
    ["ZREMRANGEBYSCORE", P + "salas:" + cuentaId, "-inf", ahora - 90 * 86400000]
  ]);
  return { sala };
}

async function cerrarSala(cuentaId, codigo) {
  const cod = normCodigo(codigo);
  const info = json(await kv("GET", P + "salainfo:" + cod));
  if (!info || info.cuentaId !== cuentaId) throw problema("sin_sala", "Esa clase no es de esta cuenta.", 404);
  info.cerrada = true; info.vence = Math.min(info.vence, Date.now());
  // La sala sigue existiendo un rato, cerrada, para que el alumno que entra tarde vea
  // un mensaje claro ("esa clase terminó") y no "código equivocado".
  await kvPipe([
    ["SET", P + "salainfo:" + cod, JSON.stringify(info), "EX", 90 * 86400],
    ["SET", P + "sala:" + cod, JSON.stringify(info), "EX", 6 * 3600]
  ]);
  return { sala: info };
}

async function listarSalas(cuentaId) {
  const cods = await kv("ZREVRANGE", P + "salas:" + cuentaId, 0, 39);
  if (!Array.isArray(cods) || !cods.length) return { salas: [] };
  const infos = await kv("MGET", ...cods.map(c => P + "salainfo:" + c));
  const ahora = Date.now();
  const salas = (infos || []).map(json).filter(Boolean).map(s => ({ ...s, abierta: !s.cerrada && s.vence > ahora }));
  return { salas };
}

async function salaEnVivo(cuentaId, codigo) {
  const cod = normCodigo(codigo);
  const [infoTxt, est, ids] = await kvPipe([
    ["GET", P + "salainfo:" + cod], ["HGETALL", P + "salaest:" + cod], ["LRANGE", P + "salaprac:" + cod, 0, 199]
  ]);
  const info = json(infoTxt);
  if (!info || info.cuentaId !== cuentaId) throw problema("sin_sala", "Esa clase no es de esta cuenta.", 404);
  const grupos = [];
  if (Array.isArray(est)) for (let i = 1; i < est.length; i += 2) { const g = json(est[i]); if (g) grupos.push(g); }
  let practicas = [];
  if (Array.isArray(ids) && ids.length) {
    const regs = await kv("MGET", ...ids.map(id => P + "p:" + id));
    practicas = (regs || []).map(json).filter(Boolean).map(resumen);
  }
  return { sala: { ...info, abierta: !info.cerrada && info.vence > Date.now() }, grupos, practicas };
}

// ---------------- prácticas ----------------

function resumen(p) {
  const ev = p.evaluacion || {};
  const items = {};
  (Array.isArray(ev.items) ? ev.items : []).forEach(i => { if (i && i.id) items[String(i.id)] = String(i.estado || "falto").toLowerCase().replace(/ó/g, "o"); });
  const rev = p.revision && p.revision.items ? p.revision.items : null;
  let tUbic = null;
  const tu = Number(ev.turno_ubicacion);
  if (tu && Array.isArray(p.transcripcion)) {
    const mios = p.transcripcion.filter(l => l.w === "yo");
    if (mios[tu - 1]) tUbic = mios[tu - 1].t;
  }
  return {
    id: p.id, fecha: p.fecha, grupo: p.grupo, alias: p.alias, sala: p.sala, perfil: p.perfil,
    dificultad: p.dificultad, escenario: p.escenario, duracionMs: p.duracionMs, cortoPor: p.cortoPor,
    puntaje: p.puntaje, topeado: p.topeado, titular: ev.titular || "", error: p.error || null,
    items, revision: rev, puntajeInstructor: p.revision ? p.revision.puntaje : null, revisionCiega: p.revision && p.revision.itemsCiegos ? p.revision.itemsCiegos : null,
    tUbicacionMs: tUbic, tRcpMs: p.tRcpMs == null ? null : p.tRcpMs, modeloEvaluador: p.modeloEvaluador || null,
    rubrica: (p.rubrica || []).map(c => ({ id: c.id, label: c.label, peso: c.peso, critico: c.critico }))
  };
}

async function listarPracticas(cuentaId, b) {
  const hasta = Number(b.hasta) || Date.now();
  const desde = Number(b.desde) || 0;
  const limite = Math.min(500, Math.max(1, Number(b.limite) || 200));
  const ids = await kv("ZREVRANGEBYSCORE", P + "idx:" + cuentaId, hasta, desde, "LIMIT", 0, limite);
  if (!Array.isArray(ids) || !ids.length) return { practicas: [] };
  const regs = await kv("MGET", ...ids.map(id => P + "p:" + id));
  let lista = (regs || []).map(json).filter(Boolean).map(resumen);
  const alias = normTexto(b.alias);
  if (alias) lista = lista.filter(p => normTexto(p.alias).includes(alias) || normTexto(p.grupo).includes(alias));
  if (b.sala) lista = lista.filter(p => p.sala === normCodigo(b.sala));
  return { practicas: lista };
}

async function leerPractica(cuentaId, id) {
  const p = json(await kv("GET", P + "p:" + corto(id, 40)));
  if (!p || p.cuentaId !== cuentaId) throw problema("sin_practica", "No se encontró esa práctica (puede haber vencido).", 404);
  return { practica: p };
}

async function revisarPractica(cuentaId, b) {
  const { practica: p } = await leerPractica(cuentaId, b.id);
  const items = {};
  const permitidos = new Set((p.rubrica || []).map(c => c.id));
  Object.entries(b.items || {}).forEach(([k, v]) => {
    if (permitidos.has(k) && ["logrado", "parcial", "falto"].includes(v)) items[k] = v;
  });
  const calc = puntuar({ items: Object.entries(items).map(([id, estado]) => ({ id, estado })) }, p.rubrica || [], p.topeCritico);
  // La primera revisión hecha a ciegas (sin ver antes lo que dijo la IA) se guarda aparte
  // y no se pisa: es la única que sirve para medir el acuerdo. Si después el instructor
  // corrige su revisión mirando la de la IA, cambia su puntaje pero no esa medición.
  const ciegos = p.revision && p.revision.itemsCiegos ? p.revision.itemsCiegos : (b.ciega ? items : null);
  p.revision = { items, nota: corto(b.nota, 1500), puntaje: calc.puntaje, topeado: calc.topeado, fecha: Date.now(), itemsCiegos: ciegos };
  const ttl = Number(await kv("TTL", P + "p:" + p.id));
  await kv("SET", P + "p:" + p.id, JSON.stringify(p), "EX", ttl > 0 ? ttl : RETENCION_DIAS * 86400);
  return { revision: p.revision };
}

async function borrarPractica(cuentaId, id) {
  const { practica: p } = await leerPractica(cuentaId, id);
  const cmds = [["DEL", P + "p:" + p.id], ["ZREM", P + "idx:" + cuentaId, p.id]];
  if (p.sala) cmds.push(["LREM", P + "salaprac:" + p.sala, 0, p.id]);
  await kvPipe(cmds);
  return { ok: true };
}

// ---------------- escenarios compartidos ----------------

async function listarEscenarios(cuentaId) {
  const h = await kv("HGETALL", P + "esc:" + cuentaId);
  const lista = [];
  if (Array.isArray(h)) for (let i = 1; i < h.length; i += 2) { const e = json(h[i]); if (e) lista.push(e); }
  lista.sort((a, b) => (a.creado || 0) - (b.creado || 0));
  return { escenarios: lista };
}

const GUIAS_VALIDAS = ["", "ahogamiento", "pcr", "trauma", "lego-rcp", "lego-ahogamiento"];

async function guardarEscenario(cuentaId, e) {
  if (!e || typeof e !== "object") throw problema("faltan_datos", "Falta el escenario.");
  const esc = {
    id: e.id && /^inst-[a-z0-9]+$/.test(String(e.id)) ? String(e.id) : "inst-" + nuevoId(),
    title: corto(e.title, 120).trim(), fam: corto(e.fam, 40).trim() || "Propio",
    card: corto(e.card, 200).trim(), scene: corto(e.scene, 2500).trim(),
    addr: corto(e.addr, 400).trim(), zona: corto(e.zona, 80).trim() || "Santa Fe capital",
    perfil: e.perfil === "lego" ? "lego" : "guardavidas",
    guia: GUIAS_VALIDAS.includes(e.guia) ? e.guia : "",
    victima: ["adulto", "nino", "lactante"].includes(e.victima) ? e.victima : "adulto",
    notasInstructor: (Array.isArray(e.notasInstructor) ? e.notasInstructor : String(e.notasInstructor || "").split("\n"))
      .map(x => corto(x, 400).trim()).filter(Boolean).slice(0, 12),
    institucion: true, creado: Number(e.creado) || Date.now(), editado: Date.now()
  };
  if (!esc.title || !esc.scene || !esc.addr) throw problema("faltan_datos", "Faltan el nombre, la situación o la ubicación.");
  if (!esc.card) esc.card = esc.scene.slice(0, 110);
  // El tope es para los nuevos: editar uno que ya existe siempre se puede.
  const [n, existe] = await kvPipe([["HLEN", P + "esc:" + cuentaId], ["HEXISTS", P + "esc:" + cuentaId, esc.id]]);
  if ((Number(n) || 0) >= 60 && !Number(existe)) throw problema("demasiados", "Ya hay 60 escenarios propios en esta cuenta. Borrá alguno antes de cargar otro.");
  await kv("HSET", P + "esc:" + cuentaId, esc.id, JSON.stringify(esc));
  return { escenario: esc };
}

async function borrarEscenario(cuentaId, id) {
  await kv("HDEL", P + "esc:" + cuentaId, corto(id, 60));
  return { ok: true };
}

// ---------------- códigos ----------------

async function regenerarCodigo(cuentaId, tipo) {
  const cuenta = await leerCuenta(cuentaId);
  if (!cuenta) throw problema("sin_cuenta", "Esa cuenta no existe.", 404);
  const esInst = tipo === "instructor";
  const campo = esInst ? "codigoInstructor" : "codigoAlumnos";
  const clave = esInst ? "codi:" : "cod:";
  const viejo = cuenta[campo];
  const nuevo = await reservarCodigo(clave, cuentaId, esInst ? "INS" : prefijoDe(cuenta.nombre), esInst ? 10 : 5);
  if (viejo) await kv("DEL", P + clave + normCodigo(viejo));
  cuenta[campo] = nuevo;
  await guardarCuentaCruda(cuenta);
  return { cuenta: publicaCuenta(cuenta) };
}

async function reservarCodigo(tipoClave, cuentaId, prefijo, largo) {
  for (let i = 0; i < 8; i++) {
    const cod = prefijo + "-" + generarCodigo(largo);
    const ok = await kv("SET", P + tipoClave + normCodigo(cod), cuentaId, "NX");
    if (ok === "OK") return cod;
  }
  throw problema("sin_codigo", "No se pudo generar un código nuevo. Probá de nuevo.", 500);
}

function prefijoDe(nombre) {
  const letras = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return (letras.slice(0, 3) || "ALU").padEnd(3, "X");
}

// ---------------- cuentas (sólo administrador) ----------------

async function listarCuentas() {
  let ids = await kv("SMEMBERS", P + "cuentas");
  ids = Array.isArray(ids) ? ids : [];
  if (!ids.includes("principal")) ids.unshift("principal");
  const mes = hoyAR().slice(0, 7);
  const cmds = ids.map(id => ["GET", P + "cuenta:" + id]).concat(ids.map(id => ["HGETALL", P + "uso:" + id + ":" + mes]));
  const r = await kvPipe(cmds);
  const cuentas = ids.map((id, i) => {
    const c = json(r[i]) || (id === "principal" ? cuentaPrincipal() : null);
    if (!c) return null;
    const u = hashAObjeto(r[ids.length + i]);
    return { ...publicaCuenta(c), usoMes: { practicas: Number(u.practicas) || 0, turnos: Number(u.turnos) || 0 } };
  }).filter(Boolean);
  return { cuentas, mes };
}

async function guardarCuenta(datos) {
  if (!datos || typeof datos !== "object") throw problema("faltan_datos", "Faltan los datos de la cuenta.");
  const id = datos.id ? corto(datos.id, 40) : nuevoId();
  const previa = datos.id ? await leerCuenta(id) : null;
  if (datos.id && !previa) throw problema("sin_cuenta", "Esa cuenta no existe.", 404);
  const nombre = corto(datos.nombre, 100).trim();
  if (!nombre) throw problema("faltan_datos", "La cuenta necesita un nombre.");
  const vence = /^\d{4}-\d{2}-\d{2}$/.test(String(datos.vence || "")) ? datos.vence : null;
  const cuenta = {
    ...(previa || {}), id, nombre,
    tipo: ["instructor", "institucion", "ong"].includes(datos.tipo) ? datos.tipo : "instructor",
    plan: ["prueba", "instructor", "institucion", "cortesia"].includes(datos.plan) ? datos.plan : "prueba",
    cupoMensual: Math.max(0, Math.min(100000, Number(datos.cupoMensual) || 0)),
    vence, activa: datos.activa !== false,
    contacto: corto(datos.contacto, 200), notas: corto(datos.notas, 1500),
    creada: previa && previa.creada ? previa.creada : Date.now()
  };
  if (!cuenta.codigoAlumnos) cuenta.codigoAlumnos = await reservarCodigo("cod:", id, prefijoDe(nombre), 5);
  if (!cuenta.codigoInstructor) cuenta.codigoInstructor = await reservarCodigo("codi:", id, "INS", 10);
  await guardarCuentaCruda(cuenta);
  return { cuenta: publicaCuenta(cuenta) };
}

async function guardarCuentaCruda(cuenta) {
  await kvPipe([["SET", P + "cuenta:" + cuenta.id, JSON.stringify(cuenta)], ["SADD", P + "cuentas", cuenta.id]]);
}

// ---------------- contactos que llegan de la página (sólo administrador) ----------------

async function listarContactos() {
  const ids = await kv("ZREVRANGE", P + "leads", 0, 299);
  if (!Array.isArray(ids) || !ids.length) return { contactos: [] };
  const regs = await kv("MGET", ...ids.map(id => P + "lead:" + id));
  return { contactos: (regs || []).map(json).filter(Boolean) };
}

async function estadoContacto(id, estado, nota) {
  const k = P + "lead:" + corto(id, 40);
  const lead = json(await kv("GET", k));
  if (!lead) throw problema("sin_contacto", "No se encontró ese contacto.", 404);
  if (["nuevo", "contactado", "demo", "prueba", "cliente", "descartado"].includes(estado)) lead.estado = estado;
  if (nota != null) lead.nota = corto(nota, 1500);
  await kv("SET", k, JSON.stringify(lead), "EX", RETENCION_DIAS * 86400);
  return { contacto: lead };
}

// ---------------- uso global (sólo administrador) ----------------

async function usoGlobal(dias) {
  const n = Math.min(90, Math.max(1, Number(dias) || 30));
  const fechas = [];
  const base = Date.now() - 3 * 3600000;
  for (let i = 0; i < n; i++) fechas.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  const r = await kvPipe(fechas.map(f => ["HGETALL", P + "usog:" + f]));
  return { dias: fechas.map((f, i) => ({ fecha: f, ...hashAObjeto(r[i]) })) };
}

/* ======================================================================
   Base de datos y códigos — repetido de api/chat.js (mantener iguales)
   ====================================================================== */

const P = "s107:";
const RETENCION_DIAS = 400;
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";   // sin 0/O ni 1/I, que se confunden al dictarlos

function kvConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

async function kvPipe(cmds) {
  const c = kvConfig();
  if (!c) throw new Error("sin base de datos");
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { authorization: "Bearer " + c.token, "content-type": "application/json" },
    body: JSON.stringify(cmds.map(x => x.map(v => String(v))))
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(d)) throw new Error("base de datos: " + ((d && d.error) || r.status));
  return d.map(x => (x && Object.prototype.hasOwnProperty.call(x, "result")) ? x.result : null);
}
async function kv(...cmd) { return (await kvPipe([cmd]))[0]; }

function normCodigo(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normTexto(v) { return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function hoyAR() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); }
function nuevoId() { return Date.now().toString(36) + randomBytes(4).toString("hex"); }
function json(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function corto(v, n) { return String(v == null ? "" : v).slice(0, n); }
function generarCodigo(n) {
  const bytes = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
function hashAObjeto(h) {
  const o = {};
  if (Array.isArray(h)) for (let i = 0; i + 1 < h.length; i += 2) o[h[i]] = h[i + 1];
  else if (h && typeof h === "object") Object.assign(o, h);
  return o;
}

function cuentaPrincipal() {
  return { id: "principal", nombre: (process.env.NOMBRE_PRINCIPAL || "Sumar Salud").trim(), tipo: "ong", plan: "cortesia", cupoMensual: 0, activa: true, vence: null };
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

async function resolverCodigo(bruto) {
  const c = normCodigo(bruto);
  if (!c || c.length < 3) return null;
  const admin = normCodigo(process.env.CODIGO_ADMIN), acceso = normCodigo(process.env.CODIGO_ACCESO);
  if (admin && iguales(c, admin)) return { rol: "admin", cuentaId: "principal" };
  if (acceso && iguales(c, acceso)) return { rol: "alumno", cuentaId: "principal" };
  const [cAl, cIn, salaTxt] = await kvPipe([["GET", P + "cod:" + c], ["GET", P + "codi:" + c], ["GET", P + "sala:" + c]]);
  let v = null;
  const sala = json(salaTxt);
  if (sala) {
    v = { rol: "alumno", cuentaId: sala.cuentaId, sala };
    if (sala.cerrada) v.bloqueo = "sala_cerrada";
  } else if (cIn) v = { rol: "instructor", cuentaId: cIn };
  else if (cAl) v = { rol: "alumno", cuentaId: cAl };
  if (v) {
    const cuenta = await leerCuenta(v.cuentaId);
    if (!cuenta) return null;
    v.cuenta = cuenta;
    v.bloqueo = v.bloqueo || bloqueoDeCuenta(cuenta);
  }
  return v;
}

async function demasiadosIntentos(ip) {
  if (!ip) return false;
  try { return (Number(await kv("GET", P + "rl:cod:" + ip)) || 0) >= 30; } catch (e) { return false; }
}
async function anotarIntento(ip) {
  if (!ip) return;
  try { await kvPipe([["INCR", P + "rl:cod:" + ip], ["EXPIRE", P + "rl:cod:" + ip, 600]]); } catch (e) {}
}
function ipDe(req) {
  const h = req.headers || {};
  const f = String(h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim();
  return f ? createHash("sha256").update(f).digest("hex").slice(0, 16) : "";
}

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
