// Pruebas del servidor sin red: node --test pruebas/api.test.mjs
// Cada prueba importa una copia nueva de los handlers (?v=n) para que la memoria de
// modelos enfriados y la caché de códigos no se contagien de una prueba a otra.
import test from "node:test";
import assert from "node:assert/strict";
import { crearRedis, crearGemini, instalarFetch, reqRes, URL_BASE, evaluadorPorDefecto } from "./falsos.mjs";

let n = 0;
async function cargar() {
  n++;
  const chat = (await import("../api/chat.js?v=" + n)).default;
  const datos = (await import("../api/datos.js?v=" + n)).default;
  return { chat, datos };
}

function entorno(vars) {
  const claves = ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "CODIGO_ACCESO", "CODIGO_ADMIN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL", "KV_REST_API_TOKEN", "MODELO_OPERADOR", "MODELO_EVALUADOR", "NOMBRE_PRINCIPAL", "MOSTRAR_PRECIOS", "TITULAR_NOMBRE", "CODIGO_DEMO", "CONTACTO_EMAIL"];
  claves.forEach(k => delete process.env[k]);
  Object.assign(process.env, { GEMINI_API_KEY: "clave-falsa" }, vars || {});
}
const conBase = { UPSTASH_REDIS_REST_URL: URL_BASE, UPSTASH_REDIS_REST_TOKEN: "t" };

async function llamar(h, body, headers = {}, method = "POST", query = {}) {
  const { req, res } = reqRes({ method, body, headers: { "x-forwarded-for": "10.0.0.1", ...headers }, query });
  await h(req, res);
  return res;
}

const turnosDeEjemplo = [
  { role: "assistant", content: "107, emergencias. ¿Cuál es su emergencia?" },
  { role: "user", content: "Estoy en la Costanera Este, puesto 2" }
];

test("sin base y sin códigos: anda como antes", async () => {
  entorno();
  const redis = crearRedis(), gemini = crearGemini();
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { chat } = await cargar();
    const g = await llamar(chat, null, {}, "GET");
    assert.equal(g.cuerpo.requiereCodigo, false);
    assert.equal(g.cuerpo.registro, false);
    // Lo que la entrada y /activar muestran como pendiente: nunca el valor, sólo si está.
    assert.equal(g.cuerpo.admin, false);
    assert.equal(g.cuerpo.clave, true);
    assert.ok(!JSON.stringify(g.cuerpo).includes(process.env.GEMINI_API_KEY));
    const r = await llamar(chat, { modo: "operador", fijo: "Sos operador.", variable: "ESTADO DE LA LLAMADA\n- TODAVÍA TE FALTA LO ESENCIAL", turnos: turnosDeEjemplo });
    assert.equal(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.match(r.cuerpo.texto, /Entendido/);
    // Lo fijo va primero en el prompt y el estado al final.
    const sistema = gemini.registro.at(-1).cuerpo.systemInstruction.parts[0].text;
    assert.ok(sistema.indexOf("Sos operador.") < sistema.indexOf("ESTADO DE LA LLAMADA"));
    const e = await llamar(chat, { modo: "evaluar", prompt: "- ubicacion (Ubicación)\n- estado (Estado)", rubrica: [{ id: "ubicacion", peso: 20, critico: true }, { id: "estado", peso: 15, critico: true }], registro: { alias: "x" } });
    assert.equal(e.statusCode, 200, JSON.stringify(e.cuerpo));
    assert.equal(e.cuerpo.puntaje, 100);
    assert.equal(e.cuerpo.practicaId, null);
    assert.equal(redis.llamadas, 0, "sin base no tiene que tocar Redis");
  } finally { quitar(); }
});

test("cuota agotada: pasa al modelo siguiente y enfría al agotado", async () => {
  entorno();
  const redis = crearRedis();
  const gemini = crearGemini({ cuota: { "gemini-3.1-flash-lite": { restantes: 1 } } });
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { chat } = await cargar();
    const r = await llamar(chat, { modo: "operador", instrucciones: "Sos operador. ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo });
    assert.equal(r.statusCode, 200, JSON.stringify(r.cuerpo));
    const orden = gemini.registro.map(x => x.modelo);
    // 3.1 flash-lite da 429, 3.5-flash-lite no existe (404), 2.5-flash-lite contesta.
    assert.deepEqual(orden, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]);
    assert.equal(r.cuerpo.modelo, "gemini-2.5-flash-lite");
    // El siguiente pedido no vuelve a probar los enfriados: va directo al que anduvo.
    gemini.registro.length = 0;
    await llamar(chat, { modo: "operador", instrucciones: "Sos operador. ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo });
    assert.deepEqual(gemini.registro.map(x => x.modelo), ["gemini-2.5-flash-lite"]);
  } finally { quitar(); }
});

test("cuota diaria del evaluador: sigue con otro modelo y no pierde la devolución", async () => {
  entorno();
  const redis = crearRedis();
  const gemini = crearGemini({ cuota: { "gemini-3.5-flash": { restantes: 5, diaria: true } } });
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { chat } = await cargar();
    const e = await llamar(chat, { modo: "evaluar", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1 }] });
    assert.equal(e.statusCode, 200, JSON.stringify(e.cuerpo));
    assert.equal(e.cuerpo.modelo, "gemini-2.5-flash");
    // El evaluador pide apagar el razonamiento.
    const pedido = gemini.registro.find(x => x.modelo === "gemini-2.5-flash").cuerpo;
    assert.deepEqual(pedido.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  } finally { quitar(); }
});

test("todos sin cuota: 429 claro, no un error genérico", async () => {
  entorno();
  const cuota = {};
  ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"].forEach(m => cuota[m] = { restantes: 9 });
  const redis = crearRedis(), gemini = crearGemini({ cuota });
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { chat } = await cargar();
    const r = await llamar(chat, { modo: "operador", instrucciones: "x", turnos: turnosDeEjemplo });
    assert.equal(r.statusCode, 429);
  } finally { quitar(); }
});

test("prompt demasiado largo: se rechaza a la vista, no se recorta", async () => {
  entorno();
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat } = await cargar();
    const r = await llamar(chat, { modo: "operador", fijo: "x".repeat(40001), variable: "", turnos: turnosDeEjemplo });
    assert.equal(r.statusCode, 413);
    assert.equal(r.cuerpo.error, "prompt_largo");
  } finally { quitar(); }
});

test("códigos: CODIGO_ACCESO sin base sigue funcionando; uno equivocado da 401", async () => {
  entorno({ CODIGO_ACCESO: "GV2027" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat } = await cargar();
    assert.equal((await llamar(chat, null, {}, "GET")).cuerpo.requiereCodigo, true);
    const ok = await llamar(chat, { modo: "verificar" }, { "x-codigo": "gv2027" });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.cuerpo.cuenta.nombre, "Kalu Lab");
    const mal = await llamar(chat, { modo: "verificar" }, { "x-codigo": "OTRO" });
    assert.equal(mal.statusCode, 401);
  } finally { quitar(); }
});

test("circuito completo con base: cuenta, sala, práctica, revisión, cupo y vencimiento", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-SECRETO-1234", CODIGO_ACCESO: "GV2027" });
  const redis = crearRedis(), gemini = crearGemini();
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-SECRETO-1234" };

    // Alta de un instructor externo con cupo de 1 práctica por mes.
    const alta = await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Instructora Pérez", tipo: "instructor", plan: "instructor", cupoMensual: 1 } }, admin);
    assert.equal(alta.statusCode, 200, JSON.stringify(alta.cuerpo));
    const cuenta = alta.cuerpo.cuenta;
    assert.match(cuenta.codigoAlumnos, /^INS-[2-9A-Z]{5}$/);
    assert.match(cuenta.codigoInstructor, /^INS-[2-9A-Z]{10}$/);

    // El instructor abre una clase; el alumno entra con el código de la clase.
    const inst = { "x-panel": cuenta.codigoInstructor };
    const panel = await llamar(datos, { accion: "panel" }, inst);
    assert.equal(panel.cuerpo.cuenta.nombre, "Instructora Pérez");
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Pre-curso 16/11", horas: 3, perfil: "lego" }, inst)).cuerpo.sala;
    assert.match(sala.codigo, /^[2-9A-Z]{6}$/);
    const alumno = { "x-codigo": sala.codigo.toLowerCase() };
    const v = await llamar(chat, { modo: "verificar" }, alumno);
    assert.equal(v.statusCode, 200, JSON.stringify(v.cuerpo));
    assert.equal(v.cuerpo.sala.nombre, "Pre-curso 16/11");
    assert.equal(v.cuerpo.sala.perfil, "lego");
    assert.equal(v.cuerpo.registro, true);

    // El grupo avisa que está en llamada, y el tablero lo ve.
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 3", estado: "en llamada", caso: "" }, alumno);
    let vivo = await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, inst);
    assert.equal(vivo.cuerpo.grupos[0].estado, "en llamada");

    // Primera práctica: pasa el cupo, se evalúa y queda guardada.
    const op = await llamar(chat, { modo: "operador", inicio: true, instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo }, alumno);
    assert.equal(op.statusCode, 200, JSON.stringify(op.cuerpo));
    const rub = [{ id: "ubicacion", label: "U", peso: 20, critico: true }, { id: "respiracion", label: "R", peso: 15, critico: true }, { id: "rcp", label: "RCP", peso: 20 }];
    const ev = await llamar(chat, {
      modo: "evaluar", prompt: "- ubicacion (U)\n- respiracion (R)\n- rcp (RCP)", rubrica: rub, topeCritico: 40,
      registro: { alias: "Grupo 3", grupo: "Grupo 3", perfil: "lego", caso: { id: "paro", nombre: "Paro cardíaco", fam: "Paro", paro: true, victima: "adulto" }, duracionMs: 300000, tRcpMs: 95000,
        transcripcion: [{ w: "op", t: 0, x: "107" }, { w: "yo", t: 4000, x: "Estoy en San Martín 2850" }, { w: "yo", t: 20000, x: "no respira, ronca" }] }
    }, alumno);
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    assert.ok(ev.cuerpo.practicaId);
    assert.equal(ev.cuerpo.guardado, true);
    assert.equal(ev.cuerpo.puntaje, 100);

    vivo = await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, inst);
    assert.equal(vivo.cuerpo.grupos[0].estado, "terminada");
    assert.equal(vivo.cuerpo.grupos[0].caso, "Paro cardíaco");
    assert.equal(vivo.cuerpo.practicas.length, 1);
    assert.equal(vivo.cuerpo.practicas[0].casoId, "paro");
    assert.equal(vivo.cuerpo.practicas[0].tUbicacionMs, 4000);
    assert.equal(vivo.cuerpo.practicas[0].tRcpMs, 95000);

    // La revisión del instructor: baja la ubicación a parcial y la respiración a falto.
    const rev = await llamar(datos, { accion: "revisar", id: ev.cuerpo.practicaId, items: { ubicacion: "parcial", respiracion: "falto", rcp: "logrado" }, nota: "Tardó en dar la dirección" }, inst);
    assert.equal(rev.statusCode, 200, JSON.stringify(rev.cuerpo));
    assert.equal(rev.cuerpo.revision.puntaje, 40, "falta un crítico: queda topeado en 40");

    // Cupo de 1 agotado: la práctica siguiente no arranca.
    const sinCupo = await llamar(chat, { modo: "operador", inicio: true, instrucciones: "x", turnos: turnosDeEjemplo }, alumno);
    assert.equal(sinCupo.statusCode, 403);
    assert.equal(sinCupo.cuerpo.error, "cupo_agotado");

    // Otra cuenta no ve esta práctica.
    const otra = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Otra escuela" } }, admin)).cuerpo.cuenta;
    const ajena = await llamar(datos, { accion: "practica", id: ev.cuerpo.practicaId }, { "x-panel": otra.codigoInstructor });
    assert.equal(ajena.statusCode, 404);
    // El alumno no puede entrar al panel con su código.
    const alumnoEnPanel = await llamar(datos, { accion: "panel" }, { "x-panel": otra.codigoAlumnos });
    assert.equal(alumnoEnPanel.statusCode, 401);
    // Un instructor no puede usar acciones de administrador.
    const noAdmin = await llamar(datos, { accion: "cuentas" }, inst);
    assert.equal(noAdmin.statusCode, 403);

    // Cerrar la clase: el que entra tarde recibe un mensaje claro.
    await llamar(datos, { accion: "sala-cerrar", codigo: sala.codigo }, inst);
    const { chat: chat2 } = await cargar();   // sin la caché de 30 s de la instancia anterior
    const tarde = await llamar(chat2, { modo: "verificar" }, alumno);
    assert.equal(tarde.statusCode, 403);
    assert.equal(tarde.cuerpo.error, "sala_cerrada");

    // Cuenta vencida.
    await llamar(datos, { accion: "cuenta-guardar", cuenta: { ...otra, vence: "2020-01-01" } }, admin);
    const { chat: chat3 } = await cargar();
    const vencida = await llamar(chat3, { modo: "verificar" }, { "x-codigo": otra.codigoAlumnos });
    assert.equal(vencida.statusCode, 403);
    assert.equal(vencida.cuerpo.error, "cuenta_vencida");

    // El administrador ve las cuentas con su uso del mes, y el uso global por día.
    const cuentas = (await llamar(datos, { accion: "cuentas" }, admin)).cuerpo.cuentas;
    const perez = cuentas.find(c => c.id === cuenta.id);
    assert.equal(perez.usoMes.practicas, 1);
    assert.ok(cuentas.some(c => c.id === "principal"));
    const uso = (await llamar(datos, { accion: "uso", dias: 2 }, admin)).cuerpo.dias;
    assert.ok(Number(uso[0].turnos) >= 1);
    assert.ok(Number(uso[0]["m:gemini-3.1-flash-lite"]) >= 1);

    // Borrar una práctica (derecho de supresión).
    const borr = await llamar(datos, { accion: "practica-borrar", id: ev.cuerpo.practicaId }, inst);
    assert.equal(borr.statusCode, 200);
    const lista = await llamar(datos, { accion: "practicas" }, inst);
    assert.equal(lista.cuerpo.practicas.length, 0);
  } finally { quitar(); }
});

test("regenerar el código de alumnos invalida el anterior", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-SECRETO-1234" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const c = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Norte" } }, { "x-panel": "ADMIN-SECRETO-1234" })).cuerpo.cuenta;
    assert.match(c.codigoAlumnos, /^ESC-/);
    const r = await llamar(datos, { accion: "codigo-regenerar", tipo: "alumnos" }, { "x-panel": c.codigoInstructor });
    assert.notEqual(r.cuerpo.cuenta.codigoAlumnos, c.codigoAlumnos);
    const { chat } = await cargar();
    const viejo = await llamar(chat, { modo: "verificar" }, { "x-codigo": c.codigoAlumnos });
    assert.equal(viejo.statusCode, 401);
    const nuevo = await llamar(chat, { modo: "verificar" }, { "x-codigo": r.cuerpo.cuenta.codigoAlumnos });
    assert.equal(nuevo.statusCode, 200);
  } finally { quitar(); }
});

test("escenarios retirados: un panel viejo recibe la lista vacía y, al guardar o borrar, que recargue", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-SECRETO-1234" });
  const redis = crearRedis();
  const quitar = instalarFetch({ redis, gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const c = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Club Río" } }, { "x-panel": "ADMIN-SECRETO-1234" })).cuerpo.cuenta;
    // Un escenario que la cuenta había cargado antes: queda en la base, pero nadie lo lee.
    redis.ejecutar(["HSET", "s107:esc:" + c.id, "inst-viejo", JSON.stringify({ id: "inst-viejo", title: "Río · calambre" })]);
    const inst = { "x-panel": c.codigoInstructor };
    const lista = await llamar(datos, { accion: "escenarios" }, inst);
    assert.equal(lista.statusCode, 200);
    assert.deepEqual(lista.cuerpo, { escenarios: [] });
    for (const accion of ["escenario-guardar", "escenario-borrar"]) {
      const r = await llamar(datos, { accion, escenario: { title: "x", scene: "y", addr: "z" }, id: "inst-viejo" }, inst);
      assert.equal(r.statusCode, 410, accion);
      assert.equal(r.cuerpo.error, "funcion_retirada");
      assert.match(r.cuerpo.detalle, /Recargá la página/);
    }
    assert.ok(redis.datos.has("s107:esc:" + c.id), "las claves esc: no se borran");
    // Los alumnos ya no reciben escenarios al entrar.
    const v = await llamar(chat, { modo: "verificar" }, { "x-codigo": c.codigoAlumnos });
    assert.equal(v.statusCode, 200);
    assert.equal(v.cuerpo.escenarios, undefined);
  } finally { quitar(); }
});

test("caso: se guarda en la práctica, sale en el resumen y suma a los contadores por tipo", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Sur", zona: "Rosario" } }, admin)).cuerpo.cuenta;
    assert.equal(cuenta.zona, "Rosario");
    const alumno = { "x-codigo": cuenta.codigoAlumnos };
    // Una rúbrica larga (diez de base más los del caso): se guarda hasta 40 filas.
    const rub = Array.from({ length: 45 }, (_, i) => ({ id: "c" + i, label: "C" + i, peso: 1 }));
    const evaluar = (id, caso) => ({ modo: "evaluar", practicaId: id, prompt: rub.map(c => "- " + c.id + " (x)").join("\n"), rubrica: rub,
      registro: { grupo: "Grupo A", perfil: "lego", caso, esenciales: "4/4", transcripcion: [],
        // Lo que manda el navegador sobre la clase no se cree: sale de la sala o de la cuenta.
        clase: { consigna: "inventada por el cliente" } } });
    const caso = { id: "ahogamiento", nombre: "Ahogamiento", fam: "Agua", origen: "desmayo", paro: true, victima: "nino",
      historia: [{ id: "desmayo", t: 1000 }, { id: "inventado", t: 2000 }, { id: "ahogamiento", t: 30000 }], extra: "no se guarda" };
    const ev = await llamar(chat, evaluar("casoguardado01", caso), alumno);
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    await llamar(chat, evaluar("casoguardado01", caso), alumno);   // reintento: no vuelve a contar
    await llamar(chat, evaluar("casoguardado02", { id: "quemadura", nombre: "Quemadura", fam: "Trauma" }), alumno);
    // Un id que no está en la lista cerrada se guarda vacío y no abre un contador.
    await llamar(chat, evaluar("casoguardado03", { id: "marciano", nombre: "Algo raro" }), alumno);
    // Una llamada que nunca llegó a clasificarse.
    await llamar(chat, evaluar("casoguardado04", { id: null, nombre: "" }), alumno);

    const inst = { "x-panel": cuenta.codigoInstructor };
    const p = (await llamar(datos, { accion: "practica", id: "casoguardado01" }, inst)).cuerpo.practica;
    assert.deepEqual(p.caso, { id: "ahogamiento", nombre: "Ahogamiento", fam: "Agua", origen: "desmayo", paro: true, victima: "nino",
      historia: [{ id: "desmayo", t: 1000 }, { id: "ahogamiento", t: 30000 }] });
    assert.equal(p.escenario, undefined, "las prácticas nuevas ya no llevan escenario");
    assert.deepEqual(p.clase, { zona: "Rosario" }, "sin clase, sólo la localidad de la cuenta");
    assert.equal(p.rubrica.length, 40);
    assert.equal(p.esenciales, "4/4");
    const raro = (await llamar(datos, { accion: "practica", id: "casoguardado03" }, inst)).cuerpo.practica;
    assert.equal(raro.caso.id, "");
    assert.equal(raro.caso.nombre, "Algo raro");

    const lista = (await llamar(datos, { accion: "practicas" }, inst)).cuerpo.practicas;
    assert.equal(lista.length, 4);
    const r1 = lista.find(x => x.id === "casoguardado01");
    assert.equal(r1.caso, "Ahogamiento");
    assert.equal(r1.casoId, "ahogamiento");
    assert.equal(r1.paro, true);
    assert.equal(r1.escenario, null);
    assert.equal(lista.find(x => x.id === "casoguardado04").casoId, "");

    // Los contadores por tipo, en la pestaña Instructores y en «Mi cuenta».
    const c = (await llamar(datos, { accion: "cuentas", detalle: true }, admin)).cuerpo.cuentas.find(x => x.id === cuenta.id);
    assert.deepEqual(c.casos, { ahogamiento: 1, quemadura: 1 });
    assert.equal(c.zona, "Rosario");
    const panel = (await llamar(datos, { accion: "panel" }, inst)).cuerpo;
    assert.deepEqual(panel.estadisticas.casos, { ahogamiento: 1, quemadura: 1 });
    assert.equal(panel.cuenta.zona, "Rosario");
    // Un panel viejo que guarda la cuenta sin el campo no le borra la localidad.
    const { zona, ...sinZona } = cuenta;
    await llamar(datos, { accion: "cuenta-guardar", cuenta: { ...sinZona, notas: "editada" } }, admin);
    assert.equal((await llamar(datos, { accion: "panel" }, inst)).cuerpo.cuenta.zona, "Rosario");
  } finally { quitar(); }
});

test("clase con consigna, lugar y localidad: llegan a verificar y se copian a la práctica", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Club Náutico", zona: "Santa Fe" } }, admin)).cuerpo.cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const consigna = "Un nene se cayó a la pileta y lo sacaron. " + "x".repeat(500);
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Sábado", perfil: "lego", consigna, lugar: "Club Náutico, Av. Almirante Brown 5200", zona: "Santo Tomé",
      escenarios: ["ahogamiento-puro"] }, inst)).cuerpo.sala;
    assert.equal(sala.consigna.length, 400);
    assert.equal(sala.lugar, "Club Náutico, Av. Almirante Brown 5200");
    assert.equal(sala.zona, "Santo Tomé");
    assert.equal(sala.escenarios, undefined, "un panel viejo que manda escenarios: se ignora");
    const alumno = { "x-codigo": sala.codigo };
    const v = (await llamar(chat, { modo: "verificar" }, alumno)).cuerpo;
    assert.equal(v.zona, "Santo Tomé");
    assert.deepEqual(v.sala, { codigo: sala.codigo, nombre: "Sábado", perfil: "lego", consigna: sala.consigna, lugar: "Club Náutico, Av. Almirante Brown 5200" });
    assert.equal(v.escenarios, undefined);

    const ev = await llamar(chat, { modo: "evaluar", practicaId: "conconsigna01", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1 }],
      registro: { grupo: "Grupo 1", caso: { id: "ahogamiento", nombre: "Ahogamiento" }, transcripcion: [], clase: { consigna: "trucha", lugar: "trucho" } } }, alumno);
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    const p = (await llamar(datos, { accion: "practica", id: "conconsigna01" }, inst)).cuerpo.practica;
    assert.deepEqual(p.clase, { consigna: sala.consigna, lugar: "Club Náutico, Av. Almirante Brown 5200", zona: "Santo Tomé" });

    // Sin localidad propia, la clase usa la de la cuenta; sin ninguna de las dos, vacía.
    const sala2 = (await llamar(datos, { accion: "sala-crear", nombre: "Domingo" }, inst)).cuerpo.sala;
    const v2 = (await llamar(chat, { modo: "verificar" }, { "x-codigo": sala2.codigo })).cuerpo;
    assert.equal(v2.zona, "Santa Fe");
    assert.deepEqual([v2.sala.consigna, v2.sala.lugar], ["", ""]);
    const sinZona = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Sin localidad" } }, admin)).cuerpo.cuenta;
    assert.equal((await llamar(chat, { modo: "verificar" }, { "x-codigo": sinZona.codigoAlumnos })).cuerpo.zona, "");
  } finally { quitar(); }
});

test("panel con requiere admin: el administrador pasa, el instructor recibe solo_admin", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const redis = crearRedis();
  const quitar = instalarFetch({ redis, gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const ok = await llamar(datos, { accion: "panel", requiere: "admin" }, admin);
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.cuerpo));
    assert.equal(ok.cuerpo.esAdmin, true);
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Instructor Ruiz" } }, admin)).cuerpo.cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const no = await llamar(datos, { accion: "panel", requiere: "admin" }, inst);
    assert.equal(no.statusCode, 403);
    assert.equal(no.cuerpo.error, "solo_admin");
    // Cuenta en el freno del panel, como un código equivocado.
    const freno = [...redis.datos.keys()].find(k => k.startsWith("s107:rl:panel:"));
    assert.ok(freno, "anotó el intento");
    assert.equal(redis.ejecutar(["SCARD", freno]).result, 1);
    // Por la puerta de Instructores (sin requiere), el mismo código entra.
    assert.equal((await llamar(datos, { accion: "panel" }, inst)).statusCode, 200);
    // Un código de alumnos sigue siendo 401, pida lo que pida.
    assert.equal((await llamar(datos, { accion: "panel", requiere: "admin" }, { "x-panel": cuenta.codigoAlumnos })).statusCode, 401);
  } finally { quitar(); }
});

test("sala-estado con caso, y una pestaña vieja que todavía manda escenario", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Clase" }, admin)).cuerpo.sala;
    const alumno = { "x-codigo": sala.codigo };
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 1", estado: "en llamada", caso: "Hemorragia grave", perfil: "lego" }, alumno);
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 2", estado: "en llamada", escenario: "Gimnasio" }, alumno);
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 3", estado: "conectado" }, alumno);
    const grupos = (await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, admin)).cuerpo.grupos;
    const g = n => grupos.find(x => x.grupo === n);
    assert.equal(g("Grupo 1").caso, "Hemorragia grave");
    assert.equal(g("Grupo 1").perfil, "lego");
    assert.equal(g("Grupo 2").caso, "Gimnasio");
    assert.equal(g("Grupo 3").caso, "");
    assert.ok(grupos.every(x => !("escenario" in x)));
  } finally { quitar(); }
});

test("práctica de un cliente viejo (con escenario, sin caso): se guarda como antes y se resume bien", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const redis = crearRedis();
  const quitar = instalarFetch({ redis, gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Vieja" } }, admin)).cuerpo.cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Clase vieja" }, inst)).cuerpo.sala;
    const ev = await llamar(chat, { modo: "evaluar", practicaId: "clienteviejo01", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1 }],
      registro: { grupo: "Grupo V", perfil: "guardavidas", escenario: { id: "ahogamiento-puro", titulo: "Balneario · ahogado", fam: "Agua", guia: "ahogamiento" }, transcripcion: [] } },
      { "x-codigo": sala.codigo });
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    const p = (await llamar(datos, { accion: "practica", id: "clienteviejo01" }, inst)).cuerpo.practica;
    assert.deepEqual(p.escenario, { id: "ahogamiento-puro", titulo: "Balneario · ahogado", fam: "Agua", guia: "ahogamiento" });
    assert.equal(p.caso, undefined);
    assert.deepEqual(p.clase, { consigna: "", lugar: "", zona: "" });
    const r = (await llamar(datos, { accion: "practicas" }, inst)).cuerpo.practicas[0];
    assert.equal(r.caso, "Balneario · ahogado");
    assert.equal(r.casoId, "");
    assert.equal(r.paro, false);
    assert.equal(r.escenario.titulo, "Balneario · ahogado");
    // En el tablero de la clase, el título va en el campo caso.
    const vivo = (await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, inst)).cuerpo;
    assert.equal(vivo.grupos[0].caso, "Balneario · ahogado");
    assert.equal(vivo.practicas[0].caso, "Balneario · ahogado");
    // No suma a los contadores por tipo de caso.
    const c = (await llamar(datos, { accion: "cuentas", detalle: true }, admin)).cuerpo.cuentas.find(x => x.id === cuenta.id);
    assert.deepEqual(c.casos, {});
    assert.equal(c.usoMes.practicas, 1);

    // Una práctica guardada antes del cambio, escrita tal cual en la base (sin caso ni clase).
    const vieja = { id: "antesdelcambio1", cuentaId: cuenta.id, sala: null, fecha: Date.now() - 86400000, grupo: "G", alias: "G", perfil: "lego",
      escenario: { id: "lego-gimnasio", titulo: "Gimnasio", fam: "Paro", guia: "lego-rcp" }, rubrica: [{ id: "rcp", label: "RCP", peso: 20, critico: false }],
      transcripcion: [], evaluacion: { items: [{ id: "rcp", estado: "logrado" }] }, puntaje: 100 };
    redis.ejecutar(["SET", "s107:p:" + vieja.id, JSON.stringify(vieja)]);
    redis.ejecutar(["ZADD", "s107:idx:" + cuenta.id, String(vieja.fecha), vieja.id]);
    const r2 = (await llamar(datos, { accion: "practicas" }, inst)).cuerpo.practicas.find(x => x.id === vieja.id);
    assert.deepEqual([r2.caso, r2.casoId, r2.paro, r2.puntaje], ["Gimnasio", "", false, 100]);
    // Y la revisión sigue funcionando con su rúbrica guardada.
    const rev = await llamar(datos, { accion: "revisar", id: vieja.id, items: { rcp: "parcial" } }, inst);
    assert.equal(rev.cuerpo.revision.puntaje, 50);
  } finally { quitar(); }
});

test("contacto desde la página: se guarda, frena el spam y lo ve el administrador", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-SECRETO-1234" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const robot = await llamar(datos, { accion: "contacto", nombre: "x", email: "x@x", web: "http://spam" });
    assert.equal(robot.cuerpo.ok, true);
    const sinDatos = await llamar(datos, { accion: "contacto", nombre: "Ana" });
    assert.equal(sinDatos.statusCode, 400);
    const ok = await llamar(datos, { accion: "contacto", nombre: "Ana", email: "ana@ejemplo.com", institucion: "Escuela", mensaje: "Quiero probarlo" });
    assert.equal(ok.statusCode, 200);
    for (let i = 0; i < 4; i++) await llamar(datos, { accion: "contacto", nombre: "Ana", email: "ana@ejemplo.com" });
    const demasiado = await llamar(datos, { accion: "contacto", nombre: "Ana", email: "ana@ejemplo.com" });
    assert.equal(demasiado.statusCode, 429);
    const lista = await llamar(datos, { accion: "contactos" }, { "x-panel": "ADMIN-SECRETO-1234" });
    assert.ok(lista.cuerpo.contactos.length >= 1);
    const id = lista.cuerpo.contactos.find(c => c.mensaje === "Quiero probarlo").id;
    const est = await llamar(datos, { accion: "contacto-estado", id, estado: "demo", nota: "Demo el jueves" }, { "x-panel": "ADMIN-SECRETO-1234" });
    assert.equal(est.cuerpo.contacto.estado, "demo");
    // Pedido de supresión: sólo el administrador lo borra, y se borra del todo.
    const alta = await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Instructor Gómez", tipo: "instructor", plan: "prueba", cupoMensual: 30 } }, { "x-panel": "ADMIN-SECRETO-1234" });
    const ajeno = await llamar(datos, { accion: "contacto-borrar", id }, { "x-panel": alta.cuerpo.cuenta.codigoInstructor });
    assert.equal(ajeno.statusCode, 403, "un instructor no borra contactos");
    const borrado = await llamar(datos, { accion: "contacto-borrar", id }, { "x-panel": "ADMIN-SECRETO-1234" });
    assert.equal(borrado.statusCode, 200);
    const despues = await llamar(datos, { accion: "contactos" }, { "x-panel": "ADMIN-SECRETO-1234" });
    assert.ok(!despues.cuerpo.contactos.some(c => c.id === id), "ya no aparece en la lista");
    const otraVez = await llamar(datos, { accion: "contacto-borrar", id }, { "x-panel": "ADMIN-SECRETO-1234" });
    assert.equal(otraVez.statusCode, 404);
  } finally { quitar(); }
});

test("códigos al azar: después de 30 fallos se frena esa conexión", async () => {
  entorno({ ...conBase, CODIGO_ACCESO: "GV2027" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat } = await cargar();
    for (let i = 0; i < 30; i++) {
      const r = await llamar(chat, { modo: "verificar" }, { "x-codigo": "PRUEBA" + i });
      assert.equal(r.statusCode, 401);
    }
    const frenado = await llamar(chat, { modo: "verificar" }, { "x-codigo": "GV2027" });
    assert.equal(frenado.statusCode, 429);
    // Desde otra conexión, el código bueno anda.
    const otra = await llamar(chat, { modo: "verificar" }, { "x-codigo": "GV2027", "x-forwarded-for": "10.0.0.2" });
    assert.equal(otra.statusCode, 200);
  } finally { quitar(); }
});

test("freno por IP: cuenta códigos distintos, y el del panel va aparte", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99", CODIGO_ACCESO: "GV2027" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    // Un celular que reintenta solo con un código viejo: muchos pedidos, un solo código.
    for (let i = 0; i < 40; i++) assert.equal((await llamar(chat, { modo: "verificar" }, { "x-codigo": "VIEJO1" })).statusCode, 401);
    assert.equal((await llamar(chat, { modo: "verificar" }, { "x-codigo": "GV2027" })).statusCode, 200, "un código repetido no frena el aula");
    // Alguien probando al azar desde el aula frena a los alumnos de esa conexión...
    for (let i = 0; i < 30; i++) await llamar(chat, { modo: "verificar" }, { "x-codigo": "AZAR" + i });
    assert.equal((await llamar(chat, { modo: "verificar" }, { "x-codigo": "GV2027" })).statusCode, 429);
    // ...pero no al instructor, que sigue pudiendo entrar al panel desde la misma red.
    assert.equal((await llamar(datos, { accion: "panel" }, { "x-panel": "ADMIN-99" })).statusCode, 200);
  } finally { quitar(); }
});

test("clase cerrada: las llamadas en curso terminan y se guardan; nadie más entra ni empieza otra", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Pre-curso", horas: 3 }, admin)).cuerpo.sala;
    const alumno = { "x-codigo": sala.codigo };
    const evaluar = grupo => ({ modo: "evaluar", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1, critico: true }],
      registro: { grupo, caso: { id: "ahogamiento", nombre: "Ahogamiento" }, transcripcion: [] } });

    // Un grupo termina antes del cierre. El aviso "evaluando" que manda la app puede llegar
    // después de que se guardó: no tiene que pisar el "terminada" con su puntaje.
    assert.equal((await llamar(chat, evaluar("Grupo 1"), alumno)).statusCode, 200);
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 1", estado: "evaluando", caso: "Ahogamiento" }, alumno);
    let vivo = (await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, admin)).cuerpo;
    assert.equal(vivo.grupos.find(g => g.grupo === "Grupo 1").estado, "terminada");

    // Otro grupo está en plena llamada cuando el instructor cierra la clase.
    assert.equal((await llamar(chat, { modo: "operador", inicio: true, instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo }, alumno)).statusCode, 200);
    await llamar(datos, { accion: "sala-cerrar", codigo: sala.codigo }, admin);
    const { chat: chat2 } = await cargar();   // sin la caché de 30 s de la instancia anterior
    // Nadie más entra ni empieza otra práctica...
    assert.equal((await llamar(chat2, { modo: "verificar" }, alumno)).cuerpo.error, "sala_cerrada");
    assert.equal((await llamar(chat2, { modo: "operador", inicio: true, instrucciones: "x", turnos: turnosDeEjemplo }, alumno)).statusCode, 403);
    // ...pero la llamada que estaba en curso sigue y recibe su devolución.
    const turno = await llamar(chat2, { modo: "operador", instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo }, alumno);
    assert.equal(turno.statusCode, 200, JSON.stringify(turno.cuerpo));
    const ev = await llamar(chat2, evaluar("Grupo 2"), alumno);
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    assert.equal(ev.cuerpo.guardado, true);
    vivo = (await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, admin)).cuerpo;
    assert.equal(vivo.practicas.length, 2);
    assert.equal(vivo.grupos.find(g => g.grupo === "Grupo 2").estado, "terminada");
  } finally { quitar(); }
});

test("clase vencida: los celulares que reintentan con el código viejo no frenan la red del aula", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99", CODIGO_ACCESO: "GV2027" });
  const redis = crearRedis();
  const quitar = instalarFetch({ redis, gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const sala = (await llamar(datos, { accion: "sala-crear", nombre: "Clase corta", horas: 1 }, { "x-panel": "ADMIN-99" })).cuerpo.sala;
    // Se cumple la hora: se adelanta el vencimiento en lo guardado.
    for (const k of ["sala:", "salainfo:"]) {
      const v = JSON.parse(redis.ejecutar(["GET", "s107:" + k + sala.codigo]).result);
      redis.ejecutar(["SET", "s107:" + k + sala.codigo, JSON.stringify({ ...v, vence: Date.now() - 1000 }), "EX", "3600"]);
    }
    const { chat } = await cargar();
    for (let i = 0; i < 40; i++) {
      const r = await llamar(chat, { modo: "verificar" }, { "x-codigo": sala.codigo });
      assert.equal(r.cuerpo.error, "sala_cerrada", "una clase vencida dice que terminó, no 'código equivocado'");
    }
    assert.equal((await llamar(chat, { modo: "verificar" }, { "x-codigo": "GV2027" })).statusCode, 200);
    assert.equal((await llamar(datos, { accion: "panel" }, { "x-panel": "ADMIN-99" })).statusCode, 200);
  } finally { quitar(); }
});

test("un 500, un 504 o la red caída pasan al modelo siguiente", async () => {
  for (const falla of [500, 504, "red"]) {
    entorno();
    const base = crearGemini();
    const gemini = {
      registro: base.registro, operador: null,
      async responder(url, init) {
        if (!url.includes("gemini-3.1-flash-lite:")) return base.responder(url, init);
        base.registro.push({ modelo: "gemini-3.1-flash-lite" });
        if (falla === "red") throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ error: { code: falla, status: falla === 500 ? "INTERNAL" : "DEADLINE_EXCEEDED" } }), { status: falla });
      }
    };
    const quitar = instalarFetch({ redis: crearRedis(), gemini });
    try {
      const { chat } = await cargar();
      const r = await llamar(chat, { modo: "operador", instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo });
      assert.equal(r.statusCode, 200, falla + ": " + JSON.stringify(r.cuerpo));
      assert.equal(base.registro[0].modelo, "gemini-3.1-flash-lite");
      assert.notEqual(r.cuerpo.modelo, "gemini-3.1-flash-lite");
    } finally { quitar(); }
  }
});

test("devolución con el JSON cortado: prueba el modelo siguiente en vez de rendirse", async () => {
  entorno();
  const gemini = crearGemini({ evaluador: (prompt, modelo) => modelo === "gemini-3.5-flash" ? '{"items":[{"id":"ubicacion","estado":"logr' : evaluadorPorDefecto(prompt) });
  const quitar = instalarFetch({ redis: crearRedis(), gemini });
  try {
    const { chat } = await cargar();
    const e = await llamar(chat, { modo: "evaluar", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1 }] });
    assert.equal(e.statusCode, 200, JSON.stringify(e.cuerpo));
    assert.equal(e.cuerpo.modelo, "gemini-2.5-flash");
  } finally { quitar(); }
});

test("MODELO_OPERADOR acepta varios modelos separados por comas, en ese orden", async () => {
  entorno({ MODELO_OPERADOR: "gemini-3.5-flash, gemini-2.5-flash" });
  const gemini = crearGemini();
  const quitar = instalarFetch({ redis: crearRedis(), gemini });
  try {
    const { chat } = await cargar();
    const r = await llamar(chat, { modo: "operador", instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo });
    assert.equal(r.cuerpo.modelo, "gemini-3.5-flash");
  } finally { quitar(); }
});

test("reintento de la devolución con el id que armó la app: no duplica la práctica ni el cupo", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Escuela", plan: "prueba", cupoMensual: 30 } }, admin)).cuerpo.cuenta;
    const pedido = { modo: "evaluar", practicaId: "k3x9practica01", prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", peso: 1 }], registro: { grupo: "Grupo 1", transcripcion: [] } };
    const a = await llamar(chat, pedido, { "x-codigo": cuenta.codigoAlumnos });
    // La respuesta de la primera no llegó al celular: la app reintenta con el mismo id.
    const b = await llamar(chat, pedido, { "x-codigo": cuenta.codigoAlumnos });
    assert.equal(a.cuerpo.practicaId, "k3x9practica01");
    assert.equal(b.cuerpo.practicaId, "k3x9practica01");
    assert.equal((await llamar(datos, { accion: "practicas" }, { "x-panel": cuenta.codigoInstructor })).cuerpo.practicas.length, 1);
    const usoMes = (await llamar(datos, { accion: "cuentas" }, admin)).cuerpo.cuentas.find(c => c.id === cuenta.id).usoMes;
    assert.equal(usoMes.practicas, 1);
    // Un id que ya es de otra cuenta no se pisa: esa práctica recibe uno nuevo.
    const otra = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Otra" } }, admin)).cuerpo.cuenta;
    const c = await llamar(chat, pedido, { "x-codigo": otra.codigoAlumnos });
    assert.notEqual(c.cuerpo.practicaId, "k3x9practica01");
  } finally { quitar(); }
});

test("estadísticas de cada cuenta: días de clase, promedios, última práctica y códigos desde la ficha", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const cuenta = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Este", plan: "instructor", cupoMensual: 150 } }, admin)).cuerpo.cuenta;
    const alumno = { "x-codigo": cuenta.codigoAlumnos };
    const practica = (id, t) => ({ modo: "evaluar", practicaId: id, prompt: "- ubicacion (U)", rubrica: [{ id: "ubicacion", label: "U", peso: 1, critico: true }],
      registro: { grupo: "Grupo " + id.slice(-1), transcripcion: [{ w: "op", t: 0, x: "107" }, { w: "yo", t, x: "Estoy en San Martín 2850" }] } });
    // Tres prácticas el mismo día: un día de clase. Dieron la ubicación a los 4, 6 y 8 s.
    for (const [id, t] of [["estadistica01", 4000], ["estadistica02", 6000], ["estadistica03", 8000]]) {
      const ev = await llamar(chat, practica(id, t), alumno);
      assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    }
    // El reintento de una devolución que ya se había guardado no vuelve a sumar.
    await llamar(chat, practica("estadistica01", 4000), alumno);
    await llamar(datos, { accion: "sala-crear", nombre: "Martes" }, { "x-panel": cuenta.codigoInstructor });

    const c = (await llamar(datos, { accion: "cuentas", detalle: true }, admin)).cuerpo.cuentas.find(x => x.id === cuenta.id);
    assert.equal(c.usoMes.practicas, 3);
    assert.equal(c.practicas90, 3);
    assert.equal(c.clases90, 1);
    assert.deepEqual(c.dias, { conPracticas: 1, deClase: 1, deClase90: 1, minimo: 3 });
    assert.ok(Date.now() - c.ultimaPractica < 60000);
    assert.equal(c.meses.length, 6);
    const mes = c.meses.at(-1);
    assert.equal(mes.mes, new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7));
    assert.deepEqual([mes.practicas, mes.puntajeSuma, mes.puntajeN, mes.ubicSumaMs, mes.ubicN], [3, 300, 3, 18000, 3]);
    assert.equal(c.esDemo, false);
    // Una cuenta sin prácticas, en cero y sin errores.
    const vacia = (await llamar(datos, { accion: "cuentas", detalle: true }, admin)).cuerpo.cuentas.find(x => x.id === "principal");
    assert.deepEqual([vacia.practicas90, vacia.dias.deClase, vacia.ultimaPractica], [0, 0, null]);
    // El selector de cuentas pide la lista sin detalle: no viajan las estadísticas.
    assert.equal((await llamar(datos, { accion: "cuentas" }, admin)).cuerpo.cuentas.find(x => x.id === cuenta.id).meses, undefined);
    // El instructor ve las mismas en «Mi cuenta».
    const panel = (await llamar(datos, { accion: "panel" }, { "x-panel": cuenta.codigoInstructor })).cuerpo;
    assert.equal(panel.estadisticas.dias.deClase, 1);
    assert.equal(panel.estadisticas.meses.at(-1).ubicN, 3);

    // El administrador le cambia el código de instructor desde la ficha: el viejo deja de
    // andar en el momento y el nuevo abre el panel de esa cuenta.
    const r = await llamar(datos, { accion: "codigo-regenerar", tipo: "instructor", cuentaId: cuenta.id }, admin);
    assert.equal(r.statusCode, 200, JSON.stringify(r.cuerpo));
    assert.notEqual(r.cuerpo.cuenta.codigoInstructor, cuenta.codigoInstructor);
    assert.equal((await llamar(datos, { accion: "panel" }, { "x-panel": cuenta.codigoInstructor })).statusCode, 401);
    const nuevo = await llamar(datos, { accion: "panel" }, { "x-panel": r.cuerpo.cuenta.codigoInstructor });
    assert.equal(nuevo.cuerpo.cuenta.nombre, "Escuela Este");
  } finally { quitar(); }
});

test("vercel.json: los dos proyectos se leen bien y el simulador manda /kalulab a la página de la empresa", async () => {
  const fs = await import("node:fs");
  const simulador = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const empresa = JSON.parse(fs.readFileSync(new URL("../kalulab/vercel.json", import.meta.url), "utf8"));
  const r = simulador.redirects.find(x => x.source.startsWith("/kalulab"));
  assert.equal(r.destination, "https://www.kalulab.store/:ruta*");
  // La página de la empresa no tiene funciones ni cron: es sólo HTML.
  assert.equal(empresa.functions, undefined);
  assert.equal(empresa.crons, undefined);
  assert.ok(fs.existsSync(new URL("../kalulab/index.html", import.meta.url)));
  // Los links de clase viejos (www.kalulab.store/?c=… y ?sala=…), las páginas del simulador y
  // su API siguen llegando al simulador, ahora en simulador.kalulab.store.
  const destino = (fuente, clave) => empresa.redirects.find(x => x.source === fuente && (!clave || x.has?.[0]?.key === clave))?.destination;
  assert.equal(destino("/", "c"), "https://simulador.kalulab.store/?c=:c");
  assert.equal(destino("/", "sala"), "https://simulador.kalulab.store/?sala=:sala");
  assert.ok(empresa.redirects.every(x => x.permanent === false), "nada permanente: el navegador no se lo guarda");
  const paginas = empresa.redirects.find(x => x.source.startsWith("/:pagina"));
  for (const p of ["panel", "instructores", "fundamentos", "terminos", "privacidad", "activar"]) assert.match(p, new RegExp("^" + paginas.source.match(/\((.*)\)/)[1] + "$"));
  assert.equal(destino("/api/:ruta*"), "https://simulador.kalulab.store/api/:ruta*");
  // El sw.js de la página de Kalu Lab sólo da de baja al del simulador que quedó instalado acá.
  const sw = fs.readFileSync(new URL("../kalulab/sw.js", import.meta.url), "utf8");
  assert.match(sw, /unregister\(\)/);
  assert.doesNotMatch(sw, /addEventListener\(["']fetch/);
});

test("la cuenta de la demo pública se marca y no cuenta para la meta del piloto", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const admin = { "x-panel": "ADMIN-99" };
    const demo = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Demo pública", plan: "prueba", cupoMensual: 50 } }, admin)).cuerpo.cuenta;
    process.env.CODIGO_DEMO = demo.codigoAlumnos.toLowerCase();
    const cuentas = (await llamar(datos, { accion: "cuentas", detalle: true }, admin)).cuerpo.cuentas;
    assert.equal(cuentas.find(c => c.id === demo.id).esDemo, true);
    assert.equal(cuentas.find(c => c.id === "principal").esDemo, false);
  } finally { quitar(); }
});

test("uso: los pedidos que se quedaron sin respuesta también se cuentan", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99", CODIGO_ACCESO: "GV2027" });
  const cuota = {};
  ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"].forEach(m => cuota[m] = { restantes: 9 });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini({ cuota }) });
  try {
    const { chat, datos } = await cargar();
    const r = await llamar(chat, { modo: "operador", instrucciones: "x", turnos: turnosDeEjemplo }, { "x-codigo": "GV2027" });
    assert.equal(r.statusCode, 429);
    const hoy = (await llamar(datos, { accion: "uso", dias: 1 }, { "x-panel": "ADMIN-99" })).cuerpo.dias[0];
    assert.equal(Number(hoy.sinRespuesta), 1);
    assert.equal(Number(hoy.sinCuota), 1);
  } finally { quitar(); }
});

test("cron diario: una escritura real en la base, para que Upstash no la archive", async () => {
  entorno({ ...conBase });
  const redis = crearRedis();
  const quitar = instalarFetch({ redis, gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const r = await llamar(datos, null, { "user-agent": "vercel-cron/1.0" }, "GET", { vivo: "1" });
    assert.equal(r.statusCode, 200);
    assert.equal(r.cuerpo.ok, true);
    assert.ok(redis.datos.has("s107:vivo"));
  } finally { quitar(); }
});

test("información pública para las páginas", async () => {
  entorno({ ...conBase, MOSTRAR_PRECIOS: "1", TITULAR_NOMBRE: "Nombre de prueba" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { datos } = await cargar();
    const r = await llamar(datos, null, {}, "GET", { info: "1" });
    assert.equal(r.cuerpo.precios, true);
    assert.equal(r.cuerpo.titular.nombre, "Nombre de prueba");
  } finally { quitar(); }
});

test("página pública: datos del titular y demo sólo si es un código de alumnos", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99", TITULAR_NOMBRE: "Titular de Prueba", CONTACTO_EMAIL: "hola@ejemplo.com", MOSTRAR_PRECIOS: "1" });
  const redis = crearRedis(), gemini = crearGemini();
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { datos } = await cargar();
    const demo = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Demo pública", plan: "prueba", cupoMensual: 50 } }, { "x-panel": "ADMIN-99" })).cuerpo.cuenta;
    const info = async () => (await llamar(datos, null, {}, "GET", { info: "1" })).cuerpo;
    let i = await info();
    assert.equal(i.titular.nombre, "Titular de Prueba");
    assert.equal(i.contacto.email, "hola@ejemplo.com");
    assert.equal(i.precios, true);
    assert.equal(i.demo, null, "sin CODIGO_DEMO no hay demo");
    process.env.CODIGO_DEMO = demo.codigoAlumnos;
    assert.equal((await info()).demo, demo.codigoAlumnos);
    // Si por error cargan el de administración o uno de instructor, no se publica.
    process.env.CODIGO_DEMO = "ADMIN-99";
    assert.equal((await info()).demo, null);
    process.env.CODIGO_DEMO = demo.codigoInstructor;
    assert.equal((await info()).demo, null);
  } finally { quitar(); }
});

test("contacto: pide nombre y un medio, frena robots y abusos, y el administrador lo ve", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-99" });
  const redis = crearRedis(), gemini = crearGemini();
  const quitar = instalarFetch({ redis, gemini });
  try {
    const { datos } = await cargar();
    let r = await llamar(datos, { accion: "contacto", nombre: "Ana" });
    assert.equal(r.statusCode, 400);
    assert.equal(r.cuerpo.error, "faltan_datos");
    r = await llamar(datos, { accion: "contacto", nombre: "Robot", email: "x@y.z", web: "http://spam" });
    assert.equal(r.statusCode, 200);
    r = await llamar(datos, { accion: "contacto", nombre: "Ana Pérez", telefono: "342 555 0000", rol: "Instructor/a de RCP", mensaje: "Hola" });
    assert.equal(r.statusCode, 200);
    const lista = (await llamar(datos, { accion: "contactos" }, { "x-panel": "ADMIN-99" })).cuerpo.contactos;
    assert.equal(lista.length, 1, "el del robot no se guarda");
    assert.equal(lista[0].nombre, "Ana Pérez");
    assert.equal(lista[0].estado, "nuevo");
    for (let k = 0; k < 4; k++) await llamar(datos, { accion: "contacto", nombre: "Ana", email: "a@b.c" });
    r = await llamar(datos, { accion: "contacto", nombre: "Ana", email: "a@b.c" });
    assert.equal(r.statusCode, 429, "más de 5 por hora desde la misma conexión");
  } finally { quitar(); }
});
