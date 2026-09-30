// Pruebas del servidor sin red: node --test pruebas/api.test.mjs
// Cada prueba importa una copia nueva de los handlers (?v=n) para que la memoria de
// modelos enfriados y la caché de códigos no se contagien de una prueba a otra.
import test from "node:test";
import assert from "node:assert/strict";
import { crearRedis, crearGemini, instalarFetch, reqRes, URL_BASE } from "./falsos.mjs";

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
    assert.equal(ok.cuerpo.cuenta.nombre, "Sumar Salud");
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
    await llamar(datos, { accion: "sala-estado", grupo: "Grupo 3", estado: "en llamada", escenario: "Gimnasio" }, alumno);
    let vivo = await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, inst);
    assert.equal(vivo.cuerpo.grupos[0].estado, "en llamada");

    // Primera práctica: pasa el cupo, se evalúa y queda guardada.
    const op = await llamar(chat, { modo: "operador", inicio: true, instrucciones: "x ESTADO DE LA LLAMADA", turnos: turnosDeEjemplo }, alumno);
    assert.equal(op.statusCode, 200, JSON.stringify(op.cuerpo));
    const rub = [{ id: "ubicacion", label: "U", peso: 20, critico: true }, { id: "respiracion", label: "R", peso: 15, critico: true }, { id: "rcp", label: "RCP", peso: 20 }];
    const ev = await llamar(chat, {
      modo: "evaluar", prompt: "- ubicacion (U)\n- respiracion (R)\n- rcp (RCP)", rubrica: rub, topeCritico: 40,
      registro: { alias: "Grupo 3", grupo: "Grupo 3", perfil: "lego", escenario: { id: "lego-gimnasio", titulo: "Gimnasio" }, duracionMs: 300000, tRcpMs: 95000,
        transcripcion: [{ w: "op", t: 0, x: "107" }, { w: "yo", t: 4000, x: "Estoy en San Martín 2850" }, { w: "yo", t: 20000, x: "no respira, ronca" }] }
    }, alumno);
    assert.equal(ev.statusCode, 200, JSON.stringify(ev.cuerpo));
    assert.ok(ev.cuerpo.practicaId);
    assert.equal(ev.cuerpo.guardado, true);
    assert.equal(ev.cuerpo.puntaje, 100);

    vivo = await llamar(datos, { accion: "sala-vivo", codigo: sala.codigo }, inst);
    assert.equal(vivo.cuerpo.grupos[0].estado, "terminada");
    assert.equal(vivo.cuerpo.practicas.length, 1);
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

test("escenarios de la institución: se guardan y los reciben sus alumnos", async () => {
  entorno({ ...conBase, CODIGO_ADMIN: "ADMIN-SECRETO-1234" });
  const quitar = instalarFetch({ redis: crearRedis(), gemini: crearGemini() });
  try {
    const { chat, datos } = await cargar();
    const c = (await llamar(datos, { accion: "cuenta-guardar", cuenta: { nombre: "Club Río" } }, { "x-panel": "ADMIN-SECRETO-1234" })).cuerpo.cuenta;
    const inst = { "x-panel": c.codigoInstructor };
    const falta = await llamar(datos, { accion: "escenario-guardar", escenario: { title: "Sin ubicación" } }, inst);
    assert.equal(falta.statusCode, 400);
    const g = await llamar(datos, { accion: "escenario-guardar", escenario: { title: "Río · calambre", scene: "Un bañista...", addr: "Playa X", perfil: "lego", guia: "inventada" } }, inst);
    assert.equal(g.statusCode, 200, JSON.stringify(g.cuerpo));
    assert.equal(g.cuerpo.escenario.guia, "", "una guía que no existe no se guarda");
    const v = await llamar(chat, { modo: "verificar" }, { "x-codigo": c.codigoAlumnos });
    assert.equal(v.cuerpo.escenarios.length, 1);
    assert.equal(v.cuerpo.escenarios[0].institucion, true);
    await llamar(datos, { accion: "escenario-borrar", id: g.cuerpo.escenario.id }, inst);
    assert.equal((await llamar(datos, { accion: "escenarios" }, inst)).cuerpo.escenarios.length, 0);
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
