// Funciones de la llamada, sin navegador: node --test pruebas/llamada.test.mjs
// Igual que rubrica.test.mjs: se recortan de index.html y se evalúan aparte, con un S de
// mentira. Sirve para los casos borde de lo que la app lee de lo que dice el alumno.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Recorta desde `inicio` hasta el cierre balanceado del primer bloque que abre ahí.
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

const fuente = [
  "const S = { turns: [], scn: null, datos: {}, despachado: false, sinAvance: 0, t0: Date.now(), perfil: 'lego' };",
  linea("const AFIRMA_RCP ="), linea("const ACUSE_RCP ="), bloque("function empezoRCP(txt){"),
  linea("const PISTAS_UBICACION ="), linea("const NUMEROS_QUE_NO_UBICAN ="), linea("const GENERICAS_DIRECCION ="),
  linea("function palabras(txt)"), bloque("function dijoUbicacion(){"),
  bloque("const RCP_COMPRESIONES = ["), bloque("const RCP_VENTILACIONES = ["),
  bloque("const RCP_VENTILACIONES_ADULTO = ["), bloque("const RCP_VENTILACIONES_LACTANTE = ["),
  bloque("const GUIAS = {"),
  "function guia(){ return (S.scn && S.scn.guia && GUIAS[S.scn.guia]) || null; }",
  "function esLego(){ return S.perfil === 'lego'; }",
  bloque("function rcpConVentilaciones(){"), bloque("function listaRcp(){"),
  linea("const TOPE_SIN_AVANCE ="), linea("const TOPE_SIN_AVANCE_LEGO ="), linea("const TOPE_MINUTOS_LEGO ="),
  bloque("function abandona(){"),
  "return { S, empezoRCP, dijoUbicacion, listaRcp, abandona, RCP_COMPRESIONES, RCP_VENTILACIONES, RCP_VENTILACIONES_ADULTO, RCP_VENTILACIONES_LACTANTE };"
].join("\n");
const M = new Function(fuente)();

const op = content => ({ role: "assistant", content });
const yo = content => ({ role: "user", content });
const conTurnos = (...turnos) => { M.S.turns = turnos; };

test("empezoRCP: lo que afirma cuenta; las preguntas y las negaciones no, con o sin signos", () => {
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
  conTurnos(op("Con los brazos rectos, empujá fuerte y rápido: que el pecho baje unos cinco centímetros."));
  assert.equal(M.empezoRCP("listo"), true);
  assert.equal(M.empezoRCP("ya empecé"), true);
  assert.equal(M.empezoRCP("dale ahí voy"), true);
  conTurnos(op("Con los brazos rectos, empujá fuerte y rápido."), yo("listo"), op("¿Hay un DEA cerca?"));
  assert.equal(M.empezoRCP("sí"), false);
  assert.equal(M.empezoRCP("listo"), false, "lo último que le dijo fue otra cosa");
});

test("empezoRCP: contar en voz alta es comprimir, salvo cuando cuenta los 5 soplidos", () => {
  conTurnos(op("Después, poné el talón de una mano en el medio del pecho y empujá fuerte y rápido 30 veces."));
  assert.equal(M.empezoRCP("uno, dos, tres, cuatro, cinco"), true);
  conTurnos(op("Tapale la nariz, poné tu boca sobre la suya y soplá despacio, un segundo, hasta ver que el pecho sube. Cinco veces."));
  assert.equal(M.empezoRCP("uno, dos, tres, cuatro, cinco"), false, "son los soplidos");
  assert.equal(M.empezoRCP("uno dos tres cuatro cinco seis siete"), true, "pasó de cinco: ya comprime");
});

test("listaRcp: la técnica según la víctima", () => {
  M.S.scn = { guia: "lego-rcp", victima: "adulto" };
  assert.equal(M.listaRcp(), M.RCP_COMPRESIONES);
  M.S.scn = { guia: "lego-ahogamiento", victima: "adulto" };
  assert.equal(M.listaRcp(), M.RCP_VENTILACIONES_ADULTO);
  assert.ok(!/tercio/.test(M.listaRcp().join(" ")), "a un adulto no se le indica un tercio del pecho: pasa los 6 cm");
  assert.match(M.listaRcp().join(" "), /talón de una mano/);
  M.S.scn = { guia: "lego-ahogamiento", victima: "nino" };
  assert.equal(M.listaRcp(), M.RCP_VENTILACIONES);
  M.S.scn = { guia: "lego-rcp", victima: "lactante" };
  assert.equal(M.listaRcp(), M.RCP_VENTILACIONES_LACTANTE, "un bebé siempre lleva ventilaciones");
  const bebe = M.listaRcp().join(" ");
  assert.match(bebe, /la boca y la nariz juntas/);
  assert.match(bebe, /sin tirarle la cabeza para atrás/);
  assert.match(bebe, /pulgares/);
  assert.ok(!/Tapale la nariz/.test(bebe), "al bebé no se le tapa la nariz");
});

test("dijoUbicacion: una dirección o una referencia sí; una edad o un tiempo no", () => {
  M.S.scn = { addr: "Balneario municipal, Costanera Este · Puesto 2", zona: "Santa Fe capital" };
  for (const t of ["Estoy en la costanera", "San Martín 2850", "en el puesto dos", "frente al camping", "en el Balneario"]) {
    conTurnos(yo(t)); assert.equal(M.dijoUbicacion(), true, t);
  }
  for (const t of ["Hay un hombre de 40 años que no respira", "¿Qué hago?", "hace 5 minutos", "apurate por favor"]) {
    conTurnos(yo(t)); assert.equal(M.dijoUbicacion(), false, t);
  }
  conTurnos(yo("[silencio: el guardavidas no dice nada]"));
  assert.equal(M.dijoUbicacion(), false);
});

test("lego: el operador no le corta nunca a quien está reanimando, aunque falte la dirección", () => {
  M.S.perfil = "lego"; M.S.despachado = false; M.S.t0 = Date.now() - 20 * 60000; M.S.sinAvance = 9;
  M.S.datos = { rcp: true };
  assert.equal(M.abandona(), false, "con la RCP en marcha");
  M.S.datos = { conciencia: true, respiracion: true };
  assert.equal(M.abandona(), false, "con el paro ya reconocido");
  M.S.datos = {};
  assert.equal(M.abandona(), true, "sin nada: puede cerrar explicando que sin dirección no sale nada");
  M.S.perfil = "guardavidas"; M.S.datos = { rcp: true };
  assert.equal(M.abandona(), true, "el guardavidas que no da la ubicación sigue aprendiendo la lección");
});
