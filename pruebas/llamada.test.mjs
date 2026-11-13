// La lógica de la llamada, sin navegador: node --test pruebas/llamada.test.mjs
// protocolos.js se carga entero (como en las páginas). Las funciones de la llamada siguen
// en index.html y se recortan de ahí con el recorte de llaves de siempre, con un S de
// mentira y la red, la voz y la pantalla reemplazadas por falsos. Así se maneja una
// llamada entera turno a turno: sendTurn() con lo que dice el alumno y ask() con lo que
// contesta el operador (marcas incluidas), en el mismo orden que en la app.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const protocolos = fs.readFileSync(new URL("../protocolos.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Recorta desde `inicio` hasta el cierre balanceado del primer bloque que abre ahí.
// No entiende expresiones regulares con un corchete o una llave sin cerrar (ver CLAUDE.md).
function bloque(inicio) {
  const i = js.indexOf(inicio);
  assert.ok(i >= 0, "no encontré " + inicio);
  let j = i, prof = 0, empezo = false, cad = null;
  for (; j < js.length; j++) {
    const c = js[j];
    if (cad) { if (c === "\\") { j++; continue; } if (c === cad) cad = null; continue; }
    if (c === '"' || c === "'" || c === "`") { cad = c; continue; }
    if (c === "/" && js[j + 1] === "*") { j = js.indexOf("*/", j) + 1; continue; }
    if (c === "/" && js[j + 1] === "/") { j = js.indexOf("\n", j); continue; }
    if (c === "{" || c === "[") { prof++; empezo = true; }
    if (c === "}" || c === "]") { prof--; if (empezo && prof === 0) break; }
  }
  return js.slice(i, j + 1) + ";";
}
// Una declaración de una sola línea.
function linea(inicio) {
  const l = js.split("\n").find(x => x.trim().startsWith(inicio));
  assert.ok(l, "no encontré " + inicio);
  return l;
}

// El estado de una llamada recién atendida (los campos de la llamada de S en index.html).
const INICIAL = {
  turns: [], log: [], t0: 0, ended: false, busy: false, hablando: false, cerrando: false,
  grado: null, grados: [], sondeos: 0, ultimaOp: 0, fase: "interrogatorio", turnosOp: 0, turnosPost: 0,
  datos: {}, despachado: false, sinAvance: 0, anuncioSinUbicacion: false, reintento: 0,
  caso: null, casoOrigen: null, casos: [], marcaCaso: null, paro: false, inconsciente: false,
  victima: null, turnoParo: 0, indicadas: 0, listaRcpId: "", ubicDeclarada: false, sinPropio: 0,
  zona: "", consigna: "", lugar: "", perfil: "guardavidas", arribo: 10 * 60000, tDespacho: 0,
  tRcp: null, primerTurno: true, avisoArribo: false,
};

const fuente = [
  protocolos,
  "const S = {};",
  // Falsos de la red, la voz y la pantalla.
  "const RESPUESTAS = [], CORTES = [];",
  "let ultimo = Promise.resolve();",
  "const EL = { textContent:'', classList:{ add(){}, remove(){} }, querySelector(){ return EL; }, remove(){} };",
  "function $(){ return EL; }",
  "function addMsg(){ return EL; }",
  "function logIt(){} function updateControls(){} function detenerEscucha(){} function escuchar(){}",
  "async function speak(){}",
  "function endCall(quien){ CORTES.push(quien); S.ended = true; }",
  "function setTimeout(f){ f(); }",
  "function instrucciones(){ return { fijo:'', variable:'' }; }",
  "async function api(){ if(!RESPUESTAS.length) throw new Error('el operador falso se quedó sin respuestas'); return { texto: RESPUESTAS.shift() }; }",
  // Lo de la llamada, recortado de index.html.
  bloque("function esLego(){"), bloque("function guia(){"), bloque("function guiaEfectiva(){"),
  bloque("function textosDelAlumno(){"),
  linea("const MARCA_CASO ="), linea("const MARCAS_CASO ="), linea("const MARCA_GRADO ="), linea("const MARCAS_GRADO ="),
  linea("const MARCA_DATOS ="), linea("const MARCAS_DATOS ="), linea("const MARCA_ESPERA ="), linea("const MARCAS_ESPERA ="),
  linea("const MARCA_CERRAR ="), linea("const MARCAS_CERRAR ="), linea("const MARCAS_SUELTAS ="),
  bloque("function leerMarcaCaso(txt){"), bloque("function clasificar(marca){"),
  bloque("function enLineaLego(){"), bloque("function esRamaDeVictima(x){"), bloque("function indicacionesDe(){"),
  bloque("function textoIndicacion(x){"), bloque("function alarmaDe(){"),
  bloque("function propiosDelCaso(){"), bloque("function esencialesDe(soloBase){"), bloque("function extrasDe(){"),
  bloque("function faltan(lista){"), bloque("function grillaDeDatos(){"),
  bloque("function rcpConVentilaciones(){"), bloque("function idListaRcp(){"), bloque("function listaRcp(){"),
  bloque("function mandaListaRcp(){"), bloque("function yaIndicoRcp(){"), bloque("function sinEmpeoramiento(){"),
  bloque("function llegoMovil(){"), bloque("function anuncioDeDespacho(txt){"),
  linea("const AFIRMA_RCP ="), linea("const ACUSE_RCP ="), bloque("function empezoRCP(txt){"),
  linea("const GENERICAS_DIRECCION ="), linea("function palabras(txt)"), linea("const INTERSECCION ="),
  bloque("function dijoUbicacion(){"),
  bloque("function abandona(){"), bloque("function terminoDeIndicar(){"), bloque("function enEspera(){"),
  bloque("function tocaCerrarAhora(){"), bloque("function confirmaRcp(){"),
  bloque("async function ask(sondeo){"), bloque("function textoDeCierre(){"), bloque("function cadencia(){"),
  bloque("function sendTurn(text){"),
  // sendTurn() no espera a ask(): se guarda la promesa para que la prueba sí la espere.
  "ask = (function(real){ return function(s){ ultimo = real(s); return ultimo; }; })(ask);",
  "return { S, RESPUESTAS, CORTES, P: PROTOCOLOS, esperar: () => ultimo, sendTurn, ask, clasificar, leerMarcaCaso,",
  "  guia, guiaEfectiva, enLineaLego, indicacionesDe, textoIndicacion, alarmaDe, esencialesDe, extrasDe, faltan, grillaDeDatos,",
  "  rcpConVentilaciones, listaRcp, mandaListaRcp, sinEmpeoramiento, llegoMovil, anuncioDeDespacho, empezoRCP,",
  "  dijoUbicacion, abandona, enEspera, tocaCerrarAhora, confirmaRcp, textoDeCierre, cadencia };",
].join("\n");
const M = new Function(fuente)();
const { S, P } = M;

// Una llamada nueva, recién atendida.
function nueva(cambios) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, structuredClone(INICIAL), { t0: Date.now() }, cambios || {});
  M.RESPUESTAS.length = 0; M.CORTES.length = 0;
}
const op = content => ({ role: "assistant", content });
const yo = content => ({ role: "user", content });
const conTurnos = (...turnos) => { S.turns = turnos; };
// Un turno entero: lo que dice el alumno y lo que contesta el operador (con sus marcas).
async function turno(alumno, operador) {
  M.RESPUESTAS.push(operador);
  M.sendTurn(alumno);
  await M.esperar();
  assert.equal(M.RESPUESTAS.length, 0, "el turno no llegó a pedirle respuesta al operador");
  return dijo();
}
// Lo último que dijo el operador, tal como lo ve y lo oye el alumno.
const dijo = () => S.turns.filter(t => t.role === "assistant").at(-1).content;

/* ======================= lo que ya cubría ======================= */

test("empezoRCP: lo que afirma cuenta; las preguntas y las negaciones no, con o sin signos", () => {
  nueva({ perfil: "lego" });
  conTurnos(op("107, emergencias. ¿Cuál es su emergencia?"));
  for (const t of ["Estoy comprimiendo", "ya estoy comprimiendo", "no respira ya estoy comprimiendo", "No respira, ya estoy comprimiendo",
    "le estoy haciendo RCP", "estamos haciendo rcp", "le estoy haciendo masaje cardíaco", "empecé a comprimir",
    "ya arranqué con la RCP", "sigo empujando", "estoy haciéndole RCP"]) {
    assert.equal(M.empezoRCP(t), true, t);
  }
  for (const t of ["¿Tengo que comprimir?", "tengo que comprimirle el pecho", "¿dónde comprimo?", "donde comprimo",
    "No sé cómo comprimir", "no le estoy haciendo RCP", "No, no estoy comprimiendo, no sé cómo", "nadie le está haciendo rcp",
    "¿Le hago masaje cardíaco?", "ya empecé a buscar la dirección", "ya empecé a soplarle", "ya arranqué a gritar",
    "cuánto tengo que comprimir"]) {
    assert.equal(M.empezoRCP(t), false, t);
  }
});

test("empezoRCP: un 'listo' o un 'ya empecé' cuenta sólo si el operador recién le dijo que empuje", () => {
  nueva({ perfil: "lego" });
  conTurnos(op("Con los brazos rectos, empujá fuerte y rápido: que el pecho baje unos cinco centímetros."));
  assert.equal(M.empezoRCP("listo"), true);
  assert.equal(M.empezoRCP("ya empecé"), true);
  assert.equal(M.empezoRCP("dale ahí voy"), true);
  conTurnos(op("Con los brazos rectos, empujá fuerte y rápido."), yo("listo"), op("¿Hay un DEA cerca?"));
  assert.equal(M.empezoRCP("sí"), false);
  assert.equal(M.empezoRCP("listo"), false, "lo último que le dijo fue otra cosa");
});

test("empezoRCP: contar en voz alta es comprimir, salvo cuando cuenta los 5 soplidos", () => {
  nueva({ perfil: "lego" });
  conTurnos(op("Después, poné el talón de una mano en el medio del pecho y empujá fuerte y rápido 30 veces."));
  assert.equal(M.empezoRCP("uno, dos, tres, cuatro, cinco"), true);
  conTurnos(op("Tapale la nariz, poné tu boca sobre la suya y soplá despacio, un segundo, hasta ver que el pecho sube. Cinco veces."));
  assert.equal(M.empezoRCP("uno, dos, tres, cuatro, cinco"), false, "son los soplidos");
  assert.equal(M.empezoRCP("uno dos tres cuatro cinco seis siete"), true, "pasó de cinco: ya comprime");
});

test("listaRcp: la técnica según el caso y la víctima", () => {
  const con = (caso, victima) => { nueva({ perfil: "lego", caso, victima, paro: true }); return M.listaRcp(); };
  assert.equal(con("paro", "adulto"), P.RCP_COMPRESIONES);
  assert.equal(con("paro", null), P.RCP_COMPRESIONES, "sin saber quién es, compresiones (no frena la RCP)");
  assert.equal(con("pecho", "adulto"), P.RCP_COMPRESIONES);
  assert.equal(con("ahogamiento", "adulto"), P.RCP_VENTILACIONES_ADULTO);
  assert.ok(!/tercio/.test(M.listaRcp().join(" ")), "a un adulto no se le indica un tercio del pecho: pasa los 6 cm");
  assert.match(M.listaRcp().join(" "), /talón de una mano/);
  assert.equal(con("ahogamiento", "nino"), P.RCP_VENTILACIONES);
  assert.equal(con("ahogamiento", null), P.RCP_VENTILACIONES, "ahogado sin saber la edad: la del chico, nunca la del adulto a un bebé");
  assert.equal(con("paro", "nino"), P.RCP_VENTILACIONES);
  assert.equal(con(null, "nino"), P.RCP_VENTILACIONES);
  assert.equal(con("paro", "lactante"), P.RCP_VENTILACIONES_LACTANTE, "un bebé siempre lleva ventilaciones");
  const bebe = M.listaRcp().join(" ");
  assert.match(bebe, /la boca y la nariz juntas/);
  assert.match(bebe, /sin tirarle la cabeza para atrás/);
  assert.match(bebe, /pulgares/);
  assert.ok(!/Tapale la nariz/.test(bebe), "al bebé no se le tapa la nariz");
});

test("dijoUbicacion: una dirección o una referencia sí; la localidad, la casa, una edad o un tiempo no", () => {
  const ubica = (t, cambios) => { nueva(Object.assign({ zona: "Santa Fe capital" }, cambios)); conTurnos(yo(t)); return M.dijoUbicacion(); };
  // Los de antes, ahora con el lugar de la consigna en vez de la dirección del escenario.
  const lugar = { lugar: "Balneario municipal, Costanera Este · Puesto 2" };
  for (const t of ["Estoy en la costanera", "San Martín 2850", "en el puesto dos", "frente al camping", "en el Balneario"]) {
    assert.equal(ubica(t, lugar), true, t);
  }
  for (const t of ["Hay un hombre de 40 años que no respira", "¿Qué hago?", "hace 5 minutos", "apurate por favor"]) {
    assert.equal(ubica(t, lugar), false, t);
  }
  // Los del contrato (§6).
  assert.equal(ubica("estoy en Santa Fe"), false, "la localidad sola no ubica: S.zona no se usa");
  assert.equal(ubica("estoy en mi casa"), false);
  assert.equal(ubica("en mi casa", { ubicDeclarada: true }), false);
  assert.equal(ubica("en San Martín y Belgrano", { ubicDeclarada: true }), true, "intersección con las dos señales");
  assert.equal(ubica("en San Martín y Belgrano"), false, "sin que el operador la declare, una sola señal no alcanza");
  assert.equal(ubica("está en el agua y no respira", { ubicDeclarada: true }), false, "no es una esquina");
  // Una palabra propia del lugar de la consigna (de 6 letras o más, no genérica).
  assert.equal(ubica("estamos en el Náutico", { lugar: "Club Náutico Sauce Viejo" }), true);
  assert.equal(ubica("estamos en el Náutico"), false, "sin consigna, esa palabra no dice nada");
  assert.equal(ubica("está abierta la puerta", { lugar: "Escuela 12, puerta abierta" }), false, "lo genérico del lugar no ubica");
  nueva(); conTurnos(yo("[silencio: el guardavidas no dice nada]"));
  assert.equal(M.dijoUbicacion(), false);
  nueva(); conTurnos(op("¿Es en San Martín 2850?"), yo("sí"));
  assert.equal(M.dijoUbicacion(), false, "lo que dice el operador no cuenta");
});

test("lego: el operador no le corta a quien reanima ni a quien está con un inconsciente", () => {
  const viejo = { perfil: "lego", t0: Date.now() - 20 * 60000, sinAvance: 9 };
  nueva(Object.assign({}, viejo, { datos: { rcp: true } }));
  assert.equal(M.abandona(), false, "con la RCP en marcha");
  nueva(Object.assign({}, viejo, { paro: true }));
  assert.equal(M.abandona(), false, "con el paro reconocido");
  nueva(Object.assign({}, viejo, { despachado: true }));
  assert.equal(M.abandona(), false, "con la ambulancia despachada");
  nueva(Object.assign({}, viejo, { datos: { conciencia: true, respiracion: true }, inconsciente: true }));
  assert.equal(M.abandona(), false, "con un inconsciente");
  nueva(Object.assign({}, viejo, { datos: { conciencia: true, respiracion: true }, caso: "hemorragia" }));
  assert.equal(M.abandona(), false, "con un cuadro que no puede esperar");
  nueva(Object.assign({}, viejo, { datos: { conciencia: true, respiracion: true }, caso: "pecho" }));
  assert.equal(M.abandona(), true, "un dolor de pecho sin dirección: cortar y pedir que vuelva a llamar es la lección");
  nueva(Object.assign({}, viejo, { datos: { conciencia: true, respiracion: true } }));
  assert.equal(M.abandona(), true, "el caso nulo abandona como otro");
  nueva({ perfil: "lego", sinAvance: 9 });
  assert.equal(M.abandona(), true, "por no avanzar");
  nueva({ perfil: "lego", sinAvance: 0, t0: Date.now() - 13 * 60000 });
  assert.equal(M.abandona(), true, "por el tope de minutos");
  nueva({ perfil: "lego", sinAvance: 2 });
  assert.equal(M.abandona(), false);
  nueva({ perfil: "guardavidas", datos: { rcp: true }, sinAvance: 9 });
  assert.equal(M.abandona(), true, "el guardavidas que no da la ubicación sigue aprendiendo la lección");
  nueva({ perfil: "guardavidas", sinAvance: 9, despachado: true });
  assert.equal(M.abandona(), false);
});

/* ======================= marcas y clasificación ======================= */

test("leerMarcaCaso: id, paro y víctima; el 0 y lo desconocido quedan en null", () => {
  assert.deepEqual(M.leerMarcaCaso("Bien. [[CASO:ahogamiento,paro,nino]]"), { id: "ahogamiento", paro: true, victima: "nino" });
  assert.deepEqual(M.leerMarcaCaso("[[CASO:0]]"), { id: null, paro: false, victima: null });
  assert.deepEqual(M.leerMarcaCaso("[[ caso : Quemadura ]]"), { id: "quemadura", paro: false, victima: null });
  assert.deepEqual(M.leerMarcaCaso("[[CASO:inventado,lactante]]"), { id: null, paro: false, victima: "lactante" });
  assert.deepEqual(M.leerMarcaCaso("[[CASO:pecho,niño]]"), { id: "pecho", paro: false, victima: "nino" });
  assert.deepEqual(M.leerMarcaCaso("[[CASO:toString]]"), { id: null, paro: false, victima: null });
  assert.equal(M.leerMarcaCaso("¿Dónde estás?"), null);
});

test("ninguna marca llega a la pantalla ni a la voz", async () => {
  nueva({ perfil: "guardavidas" });
  const t = await turno("se cayó de la escalera", "¿Responde? [[CASO:trauma,adulto]] [[GRADO:3]] [[DATOS:motivo]] [[ESPERA]] [[OTRA:cosa]]");
  assert.equal(t, "¿Responde?");
  assert.ok(!S.turns.some(x => String(x.content).includes("[[")));
});

test("clasificar: el texto de mayor prioridad le gana a la marca, y la marca de mayor prioridad al texto", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("se cayó de la escalera y sangra mucho", "¿Dónde estás? [[CASO:trauma]]");
  assert.equal(S.caso, "hemorragia");
  nueva({ perfil: "guardavidas" });
  await turno("se cayó de la escalera", "¿Sangra? [[CASO:hemorragia]]");
  assert.equal(S.caso, "hemorragia", "la marca de mayor prioridad se acepta (sólo la de paro pide indicio)");
  nueva({ perfil: "guardavidas" });
  await turno("hay una persona que se siente mal", "¿Qué le pasa? [[CASO:quemadura]]");
  assert.equal(S.caso, "quemadura", "sin señal en el texto vale la marca");
});

test("clasificar: el caso se clasifica ANTES de pedirle la respuesta, con lo que acaba de decir", async () => {
  nueva({ perfil: "lego" });
  M.RESPUESTAS.push("¿Dónde estás? [[CASO:0]]");
  M.sendTurn("le duele mucho el pecho");
  assert.equal(S.caso, "pecho", "ya en sendTurn, antes de la respuesta");
  await M.esperar();
  assert.equal(S.caso, "pecho", "un [[CASO:0]] no lo vuelve a nulo");
});

test("clasificar: el paro escala desde cualquier caso y guarda de dónde venía", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("le duele mucho el pecho", "¿Responde? [[CASO:pecho,adulto]]");
  assert.equal(S.caso, "pecho");
  assert.equal(S.paro, false);
  await turno("ahora no responde y no respira", "¿Ya están comprimiendo? [[CASO:paro]]");
  assert.equal(S.caso, "paro");
  assert.equal(S.paro, true);
  assert.equal(S.casoOrigen, "pecho");
  assert.deepEqual(S.casos.map(c => c.id), ["pecho", "paro"]);
  assert.ok(S.casos.every(c => typeof c.t === "number" && c.t >= 0));
  assert.equal(S.victima, "adulto", "la marca la dio y el texto no dijo nada");
});

test("clasificar: un provisorio se reemplaza y no cuenta como origen, salvo que lo que siga sea el paro", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("se desmayó", "¿Ya volvió en sí? [[CASO:desmayo]]");
  assert.equal(S.caso, "desmayo");
  await turno("es diabético", "¿Se puso insulina? [[CASO:glucemia]]");
  assert.equal(S.caso, "glucemia");
  assert.equal(S.casoOrigen, null, "desmayo era provisorio");
  nueva({ perfil: "guardavidas" });
  await turno("se desmayó", "¿Responde? [[CASO:desmayo]]");
  await turno("no responde y no respira", "¿Comprimen? [[CASO:paro]]");
  assert.equal(S.caso, "paro");
  assert.equal(S.casoOrigen, "desmayo", "un provisorio que termina en paro sí queda como origen");
  // Entre provisorios no hay ida y vuelta.
  nueva({ perfil: "guardavidas" });
  await turno("no reacciona pero respira", "¿Desde cuándo? [[CASO:inconsciente]]");
  await turno("antes se había desmayado", "¿Y ahora? [[CASO:desmayo]]");
  assert.equal(S.caso, "inconsciente");
});

test("clasificar: el caso nunca baja ni vuelve a nulo", async () => {
  nueva({ perfil: "lego" });
  await turno("sangra mucho del brazo", "Apretá fuerte. [[CASO:hemorragia]]");
  await turno("se había caído de una escalera", "Bien. [[CASO:trauma]]");
  assert.equal(S.caso, "hemorragia");
  await turno("ok", "Seguí apretando. [[CASO:0]]");
  assert.equal(S.caso, "hemorragia");
  await turno("ok", "Seguí apretando.");
  assert.equal(S.caso, "hemorragia", "sin marca tampoco");
  assert.deepEqual(S.casos.map(c => c.id), ["hemorragia"]);
});

test("clasificar: un ahogado, un atragantado o un parto en paro siguen siendo ese caso", async () => {
  nueva({ perfil: "lego" });
  await turno("lo sacamos del agua, no responde y no respira", "Empujá en el medio del pecho. [[CASO:ahogamiento,paro]]");
  assert.equal(S.caso, "ahogamiento");
  assert.equal(S.paro, true);
  nueva({ perfil: "lego" });
  await turno("se atragantó con un caramelo", "¿Puede toser? [[CASO:atragantamiento]]");
  await turno("ahora no responde y no respira", "Acostalo. [[CASO:atragantamiento,paro]]");
  assert.equal(S.caso, "atragantamiento");
  assert.equal(S.paro, true);
  nueva({ perfil: "lego" });
  await turno("mi mujer está pariendo", "¿Se ve la cabeza? [[CASO:parto,adulto]]");
  await turno("ya nació el bebé, no responde y no respira", "¿Quién no respira? [[CASO:parto,paro,lactante]]");
  assert.equal(S.caso, "parto", "el paro está más arriba en el orden, pero un parto en paro sigue siendo un parto");
  assert.equal(S.paro, true);
  assert.equal(S.casoOrigen, null);
  assert.equal(S.victima, "lactante");
});

test("clasificar: en un parto en paro la víctima de la marca pisa a la del texto", async () => {
  nueva({ perfil: "lego" });
  await turno("mi mujer está pariendo y está morada", "¿Respira? [[CASO:parto,paro,lactante]]");
  assert.equal(S.caso, "parto");
  assert.equal(S.paro, true, "la marca de paro con un indicio (morada)");
  assert.equal(S.victima, "lactante");
  // Fuera del parto, el texto gana.
  nueva({ perfil: "lego" });
  await turno("mi nene de 4 años no responde y no respira", "Acostalo boca arriba. [[CASO:paro,adulto]]");
  assert.equal(S.victima, "nino");
});

test("la marca de paro no se cree sola: hace falta algo que lo sostenga en lo que dijo el alumno", async () => {
  nueva({ perfil: "lego" });
  await turno("se desmayó en la fila del banco", "¿Responde? [[CASO:desmayo,paro]]");
  assert.equal(S.paro, false, "[[CASO:desmayo,paro]] sin indicio");
  assert.equal(S.caso, "desmayo");
  await turno("está sentado", "¿Respira normal? [[CASO:paro]]");
  assert.equal(S.paro, false, "[[CASO:paro]] sin indicio");
  assert.equal(S.caso, "desmayo", "y el id paro de la marca tampoco cuenta");
  await turno("está morado", "Acostalo boca arriba. [[CASO:desmayo,paro]]");
  assert.equal(S.paro, true, "con un indicio, sí");
  assert.equal(S.caso, "paro");
});

test("'estoy apretando' con una hemorragia no prende el paro ni la RCP", async () => {
  nueva({ perfil: "lego" });
  await turno("sangra mucho de la pierna", "Apretá fuerte sobre la herida con un trapo. [[CASO:hemorragia]] [[DATOS:motivo]]");
  await turno("listo, estoy apretando", "Muy bien, no sueltes. [[CASO:hemorragia]] [[DATOS:rcp]]");
  await turno("sigo apretando fuerte", "Bien.");
  assert.equal(S.caso, "hemorragia");
  assert.equal(S.paro, false);
  assert.ok(!S.datos.rcp, "ni por el texto ni por la marca rcp");
  assert.equal(S.tRcp, null);
});

test("[[GRADO]] sólo vale en un ahogamiento", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("se cayó de la escalera", "¿Responde? [[CASO:trauma]] [[GRADO:3]]");
  assert.equal(S.grado, null, "trauma");
  nueva({ perfil: "guardavidas" });
  await turno("hay una persona tirada", "¿Qué pasó? [[CASO:0]] [[GRADO:4]]");
  assert.equal(S.grado, null, "caso nulo");
  nueva({ perfil: "guardavidas" });
  await turno("hay una persona tirada", "¿Qué pasó? [[GRADO:2]] [[CASO:ahogamiento]]");
  assert.equal(S.grado, 2, "vale en el mismo mensaje que dice que es un ahogamiento");
  await turno("tose y respira", "Bien. [[GRADO:3]]");
  assert.equal(S.grado, 3);
  assert.deepEqual(S.grados.map(g => g.g), [2, 3]);
  // Un grado 6 es un paro (contrato 3.3).
  nueva({ perfil: "guardavidas" });
  await turno("lo sacamos del agua", "¿Respira? [[CASO:ahogamiento]] [[GRADO:6]]");
  assert.equal(S.paro, true);
  assert.equal(S.caso, "ahogamiento");
});

/* ======================= grillas ======================= */

test("esenciales y extras: la base, los reemplazos de `pide` y el dato propio del caso", () => {
  nueva({ perfil: "guardavidas" });
  assert.deepEqual(M.esencialesDe().map(x => x.id), P.ESENCIALES.map(x => x.id), "sin caso: la base");
  assert.equal(M.guia(), null);
  assert.equal(M.guiaEfectiva(), P.CASOS.otro.guardavidas);
  S.caso = "hemorragia";
  const es = M.esencialesDe();
  assert.deepEqual(es.map(x => x.id), P.ESENCIALES.map(x => x.id).concat(["sangrado"]));
  assert.equal(es.find(x => x.id === "acciones").pide, P.CASOS.hemorragia.guardavidas.pide.acciones);
  assert.deepEqual(M.esencialesDe(true).map(x => x.id), P.ESENCIALES.map(x => x.id), "la base, para el prompt fijo y el conteo");
  assert.deepEqual(M.extrasDe().map(x => x.id), ["identificacion"]);
  // Lego.
  nueva({ perfil: "lego", caso: "hemorragia" });
  assert.deepEqual(M.esencialesDe().map(x => x.id), ["ubicacion", "motivo", "conciencia", "respiracion", "sangrado"]);
  assert.deepEqual(M.extrasDe().map(x => x.id), ["acceso", "telefono"], "sin paro, sin DEA");
  S.paro = true;
  assert.deepEqual(M.esencialesDe().map(x => x.id), ["ubicacion", "motivo", "conciencia", "respiracion"], "con paro, la RCP no espera el dato del cuadro");
  assert.deepEqual(M.extrasDe().map(x => x.id), ["dea", "acceso", "telefono"]);
  // El dato propio que no sale deja de exigirse.
  nueva({ perfil: "lego", caso: "hemorragia", sinPropio: P.AVISAR_SIN_AVANCE });
  assert.ok(!M.esencialesDe().some(x => x.id === "sangrado"));
});

test("un esencial del caso que aparece después del despacho no lo deshace: pasa a extra", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("hay una persona tirada en la plaza San Martín, una sola, consciente, nadie le hace nada, no tenemos nada, los espero en la entrada",
    "El móvil ya sale para allá. ¿Cómo te llamás? [[CASO:0]] [[DATOS:ubicacion,motivo,victimas,estado,acciones,material,acceso]]");
  assert.equal(S.caso, null);
  assert.equal(S.despachado, true);
  await turno("ahora veo que sangra mucho de la pierna", "Entendido. [[CASO:hemorragia]]");
  assert.equal(S.caso, "hemorragia");
  assert.equal(S.despachado, true, "no se deshace");
  assert.ok(!M.esencialesDe().some(x => x.id === "sangrado"), "no vuelve a los esenciales");
  assert.ok(M.extrasDe().some(x => x.id === "sangrado"), "se pregunta como extra");
  assert.ok(M.grillaDeDatos().some(x => x.id === "sangrado"), "y se puede declarar");
});

test("indicaciones de un lego sin paro: ramas por víctima, el inconsciente primero, la alarma", () => {
  nueva({ perfil: "lego", caso: "atragantamiento" });
  const todas = M.indicacionesDe();
  assert.equal(todas.length, P.CASOS.atragantamiento.lego.indicaciones.length, "sin víctima viajan todas las ramas");
  const bebe = todas.find(x => x && x.si === "lactante");
  assert.ok(bebe, "el atragantamiento tiene la rama del bebé");
  assert.match(M.textoIndicacion(bebe), /^SÓLO SI es un bebé: /);
  S.victima = "adulto";
  assert.ok(!M.indicacionesDe().some(x => x && x.si === "lactante"), "con un adulto se saca la del bebé");
  assert.equal(M.textoIndicacion(bebe), bebe.di, "con la víctima dicha, la rama va sin la condición");
  S.victima = "lactante";
  assert.ok(M.indicacionesDe().some(x => x && x.si === "lactante"));
  const clinica = M.indicacionesDe().find(x => x && typeof x === "object" && x.si !== "lactante");
  if (clinica) assert.equal(M.textoIndicacion(clinica), "SÓLO SI " + clinica.si + ": " + clinica.di);
  // Con un inconsciente en otro caso, primero las del inconsciente; y su alarma.
  nueva({ perfil: "lego", caso: "glucemia" });
  assert.equal(M.alarmaDe(), P.CASOS.glucemia.lego.alarma);
  S.inconsciente = true;
  const lista = M.indicacionesDe();
  assert.deepEqual(lista.slice(0, P.CASOS.inconsciente.lego.indicaciones.length), P.CASOS.inconsciente.lego.indicaciones);
  assert.equal(M.alarmaDe(), P.CASOS.inconsciente.lego.alarma);
  assert.equal(M.enLineaLego(), true, "a un inconsciente no se le corta");
  // Sin caso, las de otro.
  nueva({ perfil: "lego" });
  assert.deepEqual(M.indicacionesDe(), P.CASOS.otro.lego.indicaciones);
  assert.equal(M.enLineaLego(), false);
});

/* ======================= cierres ======================= */

test("lego sin paro en un caso que no es en línea: cierra al terminar las indicaciones, no antes", async () => {
  nueva({ perfil: "lego" });
  await turno("le duele mucho el pecho, estamos en San Martín 2850", "¿Responde y respira normal? [[CASO:pecho,adulto]] [[DATOS:ubicacion,motivo]]");
  assert.equal(S.caso, "pecho");
  assert.equal(M.enLineaLego(), false);
  await turno("sí, responde y respira", "Ya te mando la ambulancia, sale para allá. Que se siente y no haga fuerza. [[DATOS:conciencia,respiracion]]");
  assert.equal(S.despachado, true);
  assert.equal(S.indicadas, 1, "el anuncio cuenta como la primera indicación");
  const n = M.indicacionesDe().length;
  await turno("ok", "Aflojale la ropa. ¿Alguien puede esperar la ambulancia en la puerta y me pasás un teléfono? [[DATOS:acceso,telefono]]");
  for (let i = S.indicadas; i < n; i++) {
    assert.equal(M.tocaCerrarAhora(), false, "todavía le quedan indicaciones");
    await turno("listo", "Muy bien. Quedate con él.");
  }
  assert.equal(M.CORTES.length, 0, "no cortó antes de tiempo");
  assert.equal(S.indicadas, n);
  assert.equal(M.tocaCerrarAhora(), true);
  // Le toca cerrar y contesta con una pregunta: la app la reemplaza por la despedida.
  const t = await turno("ya está sentado", "¿Cómo respira ahora?");
  assert.equal(t, "La ambulancia ya está en camino. Voy a cortar: volvé a llamar al 107 " + P.CASOS.pecho.lego.alarma + ".");
  assert.deepEqual(M.CORTES, ["operador"]);
});

test("lego sin paro en un caso en línea: no corta al terminar las indicaciones; corta cuando llega la ambulancia", async () => {
  nueva({ perfil: "lego" });
  await turno("sangra mucho de la pierna, estamos en el club Unión", "¿Responde? [[CASO:hemorragia]] [[DATOS:ubicacion,motivo]]");
  await turno("sí responde y respira, sangra de la pierna", "Ya sale la ambulancia. Apretá fuerte sobre la herida. [[DATOS:conciencia,respiracion,sangrado,acceso,telefono]]");
  assert.equal(S.despachado, true);
  for (let i = 0; i < 10; i++) await turno("sigo apretando", "Muy bien, no sueltes. [[CERRAR]]");
  assert.equal(M.CORTES.length, 0, "en un cuadro en línea el [[CERRAR]] se ignora");
  assert.equal(M.tocaCerrarAhora(), false);
  assert.ok(S.indicadas >= M.indicacionesDe().length);
  // Llega la ambulancia.
  S.tDespacho = Date.now() - S.arribo - 1000;
  assert.equal(M.tocaCerrarAhora(), true);
  const t = await turno("ya veo las luces", "¿Sigue sangrando?");
  assert.equal(t, "La ambulancia ya está ahí. Seguí con lo que estás haciendo hasta que los paramédicos se hagan cargo. Voy a cortar.");
  assert.ok(!/comprim/i.test(t), "al que aprieta una herida no se le dice que siga comprimiendo");
  assert.deepEqual(M.CORTES, ["operador"]);
});

test("lego que pasa a paro a mitad de la llamada: deja las indicaciones y guía la RCP hasta el arribo", async () => {
  nueva({ perfil: "lego" });
  await turno("le duele mucho el pecho, estamos en San Martín 2850", "¿Responde y respira normal? [[CASO:pecho,adulto]] [[DATOS:ubicacion,motivo]]");
  await turno("sí, responde y respira", "Ya te mando la ambulancia, sale para allá. Que se siente. [[DATOS:conciencia,respiracion,acceso,telefono]]");
  await turno("ok", "Aflojale la ropa.");
  const indicadas = S.indicadas;
  await turno("se desplomó, no responde y no respira", "Acostalo boca arriba y empujá fuerte y rápido en el medio del pecho. [[CASO:paro]]");
  assert.equal(S.paro, true);
  assert.equal(S.caso, "paro");
  assert.equal(S.casoOrigen, "pecho");
  assert.equal(S.turnosPost, 0, "los turnos para los extras se cuentan desde el paro");
  assert.equal(S.indicadas, 0, "el caso cambió: las indicaciones se cuentan de cero");
  assert.ok(indicadas > 0);
  assert.equal(M.tocaCerrarAhora(), false);
  assert.equal(M.abandona(), false);
  assert.equal(M.mandaListaRcp(), true);
  assert.equal(M.cadencia(), P.CADENCIA.rcp);
  await turno("listo, ya estoy comprimiendo", "Muy bien, seguí así. [[DATOS:rcp]]");
  assert.equal(S.datos.rcp, true);
  assert.ok(S.tRcp != null);
  for (let i = 0; i < 8; i++) await turno("sigo", "Muy bien, no pares. [[CERRAR]]");
  assert.equal(M.CORTES.length, 0, "a quien reanima no se le corta");
  assert.equal(S.indicadas, 0, "con paro no se cuentan indicaciones");
  S.tDespacho = Date.now() - S.arribo - 1000;
  const t = await turno("sigo comprimiendo", "¿Cómo va?");
  assert.match(t, /^La ambulancia ya está ahí\. Seguí comprimiendo/);
  assert.deepEqual(M.CORTES, ["operador"]);
  assert.deepEqual(P.rubrica("lego", S.caso, { paro: S.paro, victima: S.victima, enLinea: M.enLineaLego() }).map(c => c.id), P.CHECKS_LEGO.map(c => c.id));
});

test("si con la respuesta se reconoce un paro, el cierre que tocaba ya no se fuerza", async () => {
  nueva({ perfil: "lego" });
  await turno("le duele mucho el pecho, estamos en San Martín 2850", "¿Responde y respira normal? [[CASO:pecho]] [[DATOS:ubicacion,motivo]]");
  await turno("sí, responde y respira", "Ya te mando la ambulancia. Que se siente. [[DATOS:conciencia,respiracion,acceso,telefono]]");
  while (S.indicadas < M.indicacionesDe().length) await turno("listo", "Muy bien.");
  assert.equal(M.tocaCerrarAhora(), true);
  // "Está morado" es sólo un indicio: el paro lo prende la marca que llega con la respuesta.
  const t = await turno("está morado", "¿Respira normal? [[CASO:pecho,paro]]");
  assert.equal(S.paro, true);
  assert.equal(t, "¿Respira normal?", "no se reemplazó por la despedida");
  assert.equal(M.CORTES.length, 0);
});

test("guardavidas con el caso sin clasificar: interroga con la base, despacha y cierra", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("hay una persona tirada en la plaza San Martín", "¿Cuántas personas son y cómo está? [[CASO:0]] [[DATOS:ubicacion]]");
  assert.equal(S.caso, null);
  assert.equal(M.guia(), null);
  assert.deepEqual(M.faltan(M.esencialesDe()).map(x => x.id), ["motivo", "victimas", "estado", "acciones", "material", "acceso"]);
  await turno("una sola, está consciente pero muy pálida", "¿Le están haciendo algo y con qué cuentan? [[DATOS:motivo,victimas,estado]]");
  assert.equal(S.despachado, false);
  await turno("nada, no tenemos nada, la espero en la entrada de la plaza", "El móvil ya sale para allá. ¿Cómo te llamás? [[DATOS:acciones,material,acceso]] [[GRADO:3]]");
  assert.equal(S.despachado, true);
  assert.equal(S.grado, null, "sin ahogamiento el grado se ignora");
  assert.equal(S.caso, null);
  await turno("Juan", "Gracias Juan. [[DATOS:identificacion]]");
  assert.equal(M.tocaCerrarAhora(), true);
  const t = await turno("ok", "¿Algo más?");
  assert.equal(t, "El móvil ya está en camino. Voy a cortar la comunicación: si la víctima empeora, volvé a llamar al 107.");
  assert.deepEqual(M.CORTES, ["operador"]);
  assert.deepEqual(P.rubrica("guardavidas", S.caso), P.rubrica("guardavidas", "otro"));
});

test("guardavidas: sin ubicación el anuncio no cuenta, y el [[CERRAR]] antes del despacho se ignora", async () => {
  nueva({ perfil: "guardavidas" });
  await turno("se cayó de una moto, está consciente", "Ya te mando el móvil. [[CASO:trauma]] [[DATOS:ubicacion,motivo,estado]] [[CERRAR]]");
  assert.equal(S.despachado, false);
  assert.equal(S.anuncioSinUbicacion, true);
  assert.ok(!S.datos.ubicacion, "la ubicación declarada sin sostén no se acepta");
  assert.equal(S.ubicDeclarada, true);
  assert.equal(M.CORTES.length, 0);
});

test("textoDeCierre y cadencia: las ramas", () => {
  nueva({ perfil: "lego" });
  assert.match(M.textoDeCierre(), /^Sin la dirección no puedo mandarte la ambulancia/);
  Object.assign(S, { despachado: true, tDespacho: Date.now(), paro: true });
  assert.match(M.textoDeCierre(), /Seguí comprimiendo/);
  S.paro = false; S.caso = "quemadura";
  assert.equal(M.textoDeCierre(), "La ambulancia ya está en camino. Voy a cortar: volvé a llamar al 107 " + P.CASOS.quemadura.lego.alarma + ".");
  S.tDespacho = Date.now() - S.arribo - 1;
  assert.match(M.textoDeCierre(), /^La ambulancia ya está ahí\. Seguí con lo que estás haciendo/);
  nueva({ perfil: "guardavidas" });
  assert.match(M.textoDeCierre(), /^Sin saber dónde estás/);
  S.despachado = true;
  assert.match(M.textoDeCierre(), /si la víctima empeora/);
  S.paro = true;
  assert.match(M.textoDeCierre(), /si cambia la situación/, "en paro no hay empeoramiento posible");
  nueva({ perfil: "guardavidas", grado: 6 });
  assert.equal(M.sinEmpeoramiento(), true);
  // Cadencia (contrato 3.4).
  nueva({ perfil: "lego" });
  assert.equal(M.cadencia(), P.CADENCIA.estable);
  S.despachado = true; S.caso = "hemorragia";
  assert.equal(M.cadencia(), P.CADENCIA.critico);
  S.caso = "pecho";
  assert.equal(M.cadencia(), P.CADENCIA.estable);
  S.paro = true;
  assert.equal(M.cadencia(), P.CADENCIA.rcp);
  nueva({ perfil: "guardavidas" });
  assert.equal(M.cadencia(), P.CADENCIA.estable);
  S.grado = 5;
  assert.equal(M.cadencia(), P.CADENCIA.critico);
  S.grado = 2; S.paro = true;
  assert.equal(M.cadencia(), P.CADENCIA.critico);
});

test("anuncioDeDespacho: lo que dice, no lo que niega", () => {
  for (const t of ["Ya te mando la ambulancia", "El móvil está en camino", "La ambulancia sale ya", "Despaché una unidad, llega en 8 minutos"]) {
    assert.equal(M.anuncioDeDespacho(t), true, t);
  }
  for (const t of ["Sin la dirección no puedo mandarte la ambulancia", "No te puedo mandar el móvil si no sé dónde estás", "¿Dónde estás?", "Ya sale, tranquilo"]) {
    assert.equal(M.anuncioDeDespacho(t), false, t);
  }
});
