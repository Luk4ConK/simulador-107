// La rúbrica y los escenarios, sin navegador: node --test pruebas/rubrica.test.mjs
// Se extraen de index.html las constantes y funciones puras y se evalúan aparte.
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

const fuente = [
  bloque("const SCENARIOS = ["), bloque("const CHECKS = ["), "const TOPE_CRITICO = 40;",
  bloque("const CHECKS_LEGO = ["), bloque("const GUIAS = {"),
  "const S = { rub:null };",
  bloque("function rubrica(scn){"), bloque("function normEstado(v){"), bloque("function puntuar(d){"),
  "return { SCENARIOS, CHECKS, CHECKS_LEGO, GUIAS, S, rubrica, puntuar };"
].join("\n");
const M = new Function(fuente)();

const todos = (rub, estado) => ({ items: rub.map(c => ({ id: c.id, estado })) });

test("guardavidas: nada da 0, todo da 100, sin ubicación queda topeado en 40", () => {
  const scn = M.SCENARIOS.find(s => s.id === "ahogamiento-puro");
  M.S.rub = M.rubrica(scn);
  assert.equal(M.puntuar(todos(M.S.rub, "falto")), 0);
  assert.equal(M.puntuar(todos(M.S.rub, "logrado")), 100);
  const d = todos(M.S.rub, "logrado"); d.items.find(i => i.id === "ubicacion").estado = "falto";
  assert.equal(M.puntuar(d), 40);
  assert.equal(d.topeado, true);
});

test("lego: su propia rúbrica; si dice que respira cuando no, no pasa de 40", () => {
  const scn = M.SCENARIOS.find(s => s.id === "lego-gimnasio");
  M.S.rub = M.rubrica(scn);
  assert.ok(M.S.rub.some(c => c.id === "rcp"));
  assert.ok(!M.S.rub.some(c => c.id === "material"), "no mezcla criterios del guardavidas");
  assert.equal(M.puntuar(todos(M.S.rub, "logrado")), 100);
  const d = todos(M.S.rub, "logrado"); d.items.find(i => i.id === "respiracion").estado = "falto";
  assert.equal(M.puntuar(d), 40);
  // Parcial vale la mitad.
  assert.equal(M.puntuar(todos(M.S.rub, "parcial")), 50);
});

test("los pesos de la rúbrica lego suman 100", () => {
  assert.equal(M.CHECKS_LEGO.reduce((a, c) => a + c.peso, 0), 100);
});

test("cada escenario está completo y usa una guía que existe", () => {
  const ids = new Set();
  for (const s of M.SCENARIOS) {
    assert.ok(!ids.has(s.id), "id repetido: " + s.id); ids.add(s.id);
    for (const campo of ["title", "card", "scene", "addr", "zona", "fam"]) assert.ok(s[campo], s.id + " sin " + campo);
    assert.ok(["guardavidas", "lego"].includes(s.perfil), s.id + " sin perfil");
    if (s.guia) assert.ok(M.GUIAS[s.guia], s.id + ": la guía " + s.guia + " no existe");
    if (s.perfil === "lego") assert.match(s.guia || "", /^lego-/, s.id + ": un escenario lego usa una guía lego");
    assert.ok(Array.isArray(s.notasInstructor) && s.notasInstructor.length, s.id + " sin guion para el instructor");
  }
  assert.ok(M.SCENARIOS.filter(s => s.perfil === "lego").length >= 3);
});

test("los criterios propios de cada guía no pisan a los globales sin querer", () => {
  for (const [nombre, g] of Object.entries(M.GUIAS)) {
    const base = nombre.startsWith("lego-") ? M.CHECKS_LEGO : M.CHECKS;
    for (const c of g.checks || []) {
      assert.ok(!base.some(b => b.id === c.id), nombre + ": el criterio " + c.id + " ya existe en la rúbrica base (usá `cambia`)");
      assert.ok(c.logrado && c.parcial && c.peso > 0, nombre + "/" + c.id + " incompleto");
    }
  }
});

test("el oxígeno no se le pide al guardavidas (corrección del instructor)", () => {
  const material = M.CHECKS.find(c => c.id === "material");
  assert.match(material.logrado, /oxígeno no se le pide/);
});
