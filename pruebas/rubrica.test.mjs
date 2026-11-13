// La rúbrica y el puntaje, sin navegador: node --test pruebas/rubrica.test.mjs
// Carga protocolos.js como lo cargan las páginas (un script clásico, sin import) y prueba
// rubrica() y puntuar() con los 18 tipos de caso, los dos perfiles y con y sin paro.
// La regresión compara contra pruebas/regresion-original.json: una copia de la rúbrica y
// de las guías de index.html de ANTES de sacar los escenarios (noviembre de 2026). Si un
// cambio de la rúbrica heredada es a propósito, se regenera esa copia; si no, es un error.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fuente = fs.readFileSync(new URL("../protocolos.js", import.meta.url), "utf8");
const P = new Function(fuente + "\nreturn PROTOCOLOS;")();
const ORIGINAL = JSON.parse(fs.readFileSync(new URL("./regresion-original.json", import.meta.url), "utf8"));

const todos = (rub, estado) => ({ items: rub.map(c => ({ id: c.id, estado })) });
const campos = c => ({ id: c.id, label: c.label, peso: c.peso, critico: !!c.critico, logrado: c.logrado, parcial: c.parcial });
const ids = R => R.map(c => c.id);
// Todas las líneas de `viejas` están en `nuevas`, en el mismo orden (se pueden sumar otras).
function contieneEnOrden(nuevas, viejas, nombre) {
  let k = 0;
  for (const linea of viejas) {
    const i = nuevas.indexOf(linea, k);
    assert.ok(i >= 0, nombre + ": se perdió o se movió la línea «" + String(linea).slice(0, 80) + "…»");
    k = i + 1;
  }
}

/* ---------------- archivo ---------------- */
test("protocolos.js: script clásico, sin marcas sin ensamblar y con todo lo que se usa", () => {
  assert.ok(!fuente.includes("@@CASOS@@"), "los casos todavía no están ensamblados");
  assert.ok(!/^\s*(import|export)\s/m.test(fuente), "sin import ni export: lo carga un <script> clásico");
  assert.ok(!fuente.includes("Date.now("), "sin reloj: son datos y funciones puras");
  for (const n of ["CASOS", "ORDEN_CASOS", "CHECKS", "CHECKS_LEGO", "CHECK_INDICACIONES_LEGO", "CHECK_VENTILACIONES",
    "TOPE_CRITICO", "ESENCIALES", "EXTRAS", "ESENCIALES_LEGO", "EXTRAS_LEGO", "TOPE_INDICACIONES_LEGO",
    "rubrica", "puntuar", "normEstado", "normalizar", "detectarCaso", "detectarParo", "indicioDeParo",
    "detectarInconsciente", "detectarVictima", "resolverCaso", "casoDe", "tablaDeCasos"]) {
    assert.ok(P[n] !== undefined, "PROTOCOLOS no exporta " + n);
  }
  assert.equal(P.TOPE_CRITICO, 40);
  assert.equal(P.TOPE_INDICACIONES_LEGO, 4);
});

test("las grillas base tienen los ids del contrato", () => {
  assert.deepEqual(ids(P.ESENCIALES), ["ubicacion", "motivo", "victimas", "estado", "acciones", "material", "acceso"]);
  assert.deepEqual(ids(P.EXTRAS), ["identificacion"]);
  assert.deepEqual(ids(P.ESENCIALES_LEGO), ["ubicacion", "motivo", "conciencia", "respiracion"]);
  assert.deepEqual(ids(P.EXTRAS_LEGO), ["dea", "acceso", "telefono"]);
});

test("los 18 casos, en el orden de prioridad, y la tabla del prompt los nombra a todos", () => {
  assert.deepEqual(P.ORDEN_CASOS, ["ahogamiento", "atragantamiento", "paro", "hemorragia", "alergia", "parto", "acv",
    "pecho", "respiratorio", "convulsion", "glucemia", "intoxicacion", "temperatura", "trauma", "quemadura",
    "inconsciente", "desmayo", "otro"]);
  assert.deepEqual(Object.keys(P.CASOS).sort(), P.ORDEN_CASOS.slice().sort());
  const tabla = P.tablaDeCasos().split("\n");
  assert.equal(tabla.length, 19, "una línea por caso y la regla de prioridad");
  P.ORDEN_CASOS.forEach((id, i) => assert.ok(tabla[i].startsWith(id + ": "), "línea " + i + ": " + tabla[i]));
  for (const id of P.ORDEN_CASOS) {
    const c = P.CASOS[id];
    assert.equal(c.id, id);
    assert.ok(c.nombre && c.fam && c.reconocer, id + ": nombre, familia y reconocer");
    assert.ok(!c.reconocer.includes("\n"), id + ": reconocer en una línea");
    assert.equal(c.provisorio, ["inconsciente", "desmayo", "otro"].includes(id), id + ": provisorio");
    assert.equal(c.rcp, id === "ahogamiento" ? "ventilaciones" : null, id + ": rcp");
  }
  const enLinea = P.ORDEN_CASOS.filter(id => P.CASOS[id].lego.enLinea);
  assert.deepEqual(enLinea.sort(), ["ahogamiento", "alergia", "atragantamiento", "convulsion", "hemorragia", "inconsciente", "paro", "parto"]);
});

/* ---------------- regresión (contrato 2.2) ---------------- */
test("regresión: CHECKS y CHECKS_LEGO son los de antes", () => {
  assert.deepEqual(P.CHECKS.map(campos), ORIGINAL.CHECKS);
  assert.deepEqual(P.CHECKS_LEGO.map(campos), ORIGINAL.CHECKS_LEGO);
  assert.equal(P.CHECKS_LEGO.reduce((a, c) => a + c.peso, 0), 100, "los pesos lego suman 100");
});

test("regresión: la rúbrica de cada caso heredado da lo mismo que la guía de antes", () => {
  const pares = {
    "guardavidas/ahogamiento": P.rubrica("guardavidas", "ahogamiento"),
    "guardavidas/paro": P.rubrica("guardavidas", "paro"),
    "guardavidas/trauma": P.rubrica("guardavidas", "trauma"),
    "lego/paro": P.rubrica("lego", "paro"),
    "lego/ahogamiento+paro": P.rubrica("lego", "ahogamiento", { paro: true }),
  };
  for (const [k, R] of Object.entries(pares)) assert.deepEqual(R.map(campos), ORIGINAL.rubricas[k], k);
  assert.deepEqual(ids(pares["guardavidas/ahogamiento"]).slice(10), ["sumersion", "clasificacion", "maniobras"]);
  assert.deepEqual(campos(P.CHECK_VENTILACIONES), ORIGINAL.rubricas["lego/ahogamiento+paro"].at(-1));
  assert.ok(!(P.CASOS.ahogamiento.lego.checks || []).some(c => c.id === "ventilaciones"), "al ahogado que respira no se le exige ventilar");
  assert.deepEqual(P.CASOS.paro.lego.checks, []);
});

test("regresión: los casos heredan las guías de antes sin perder una línea", () => {
  const nuevos = {
    "ahogamiento/guardavidas": P.CASOS.ahogamiento.guardavidas, "paro/guardavidas": P.CASOS.paro.guardavidas,
    "trauma/guardavidas": P.CASOS.trauma.guardavidas, "paro/lego": P.CASOS.paro.lego, "ahogamiento/lego": P.CASOS.ahogamiento.lego,
  };
  for (const [k, viejo] of Object.entries(ORIGINAL.guias)) {
    const nuevo = nuevos[k];
    for (const campo of ["escala", "clasificar", "saber"]) {
      if (viejo[campo]) contieneEnOrden(nuevo[campo] || [], viejo[campo], k + "." + campo);
    }
    for (const campo of ["extras", "cambia", "checks"]) {
      if (viejo[campo]) assert.deepEqual(nuevo[campo], viejo[campo], k + "." + campo);
    }
  }
});

test("las correcciones del instructor siguen: sin oxígeno, 15:2 sólo chicos y lactantes", () => {
  assert.match(P.CHECKS.find(c => c.id === "material").logrado, /oxígeno no se le pide/);
  const saber = P.CASOS.ahogamiento.guardavidas.saber.join("\n");
  assert.match(saber, /15:2/);
  assert.match(saber, /30:2/);
  // Ningún caso le indica oxígeno ni aspirina al lego.
  for (const id of P.ORDEN_CASOS) {
    for (const x of P.CASOS[id].lego.indicaciones || []) {
      const t = typeof x === "string" ? x : x.di;
      assert.ok(!/aspirina|ox[ií]geno/i.test(t), id + ": indica " + t);
    }
  }
});

/* ---------------- los 18 casos × 2 perfiles × paro ---------------- */
const VICTIMAS = [undefined, "adulto", "nino", "lactante"];
function cadaRubrica(fn) {
  for (const perfil of ["guardavidas", "lego"]) for (const caso of [...P.ORDEN_CASOS, null, "inventado"])
    for (const paro of [false, true]) for (const victima of VICTIMAS)
      fn(perfil, caso, { paro, victima }, P.rubrica(perfil, caso, victima ? { paro, victima } : { paro }));
}

test("rúbricas de todos los casos: sin ids repetidos, 0 / 50 / 100, y sin ubicación topeada en 40", () => {
  let n = 0;
  cadaRubrica((perfil, caso, o, R) => {
    const k = [perfil, caso, o.paro ? "paro" : "sin paro", o.victima].join("/");
    n++;
    assert.ok(R.length >= 7, k + ": muy pocos criterios");
    assert.equal(new Set(ids(R)).size, R.length, k + ": ids repetidos " + ids(R));
    for (const c of R) assert.ok(c.label && c.logrado && c.parcial && c.peso > 0, k + "/" + c.id + " incompleto");
    assert.equal(P.puntuar(todos(R, "falto"), R), 0, k);
    assert.equal(P.puntuar(todos(R, "logrado"), R), 100, k);
    const medio = P.puntuar(todos(R, "parcial"), R);
    assert.ok(medio === 50 || medio === 40, k + ": todo parcial da " + medio);
    const d = todos(R, "logrado"); d.items.find(i => i.id === "ubicacion").estado = "falto";
    assert.equal(P.puntuar(d, R), 40, k);
    assert.equal(d.topeado, true, k);
    // Los críticos son siempre los de la base: ubicación y estado (guardavidas), ubicación y respiración (lego).
    assert.deepEqual(R.filter(c => c.critico).map(c => c.id), perfil === "lego" ? ["ubicacion", "respiracion"] : ["ubicacion", "estado"], k);
  });
  assert.equal(n, 2 * 20 * 2 * 4);
});

test("guardavidas: las opciones no cambian nada; el caso nulo o inventado vale otro", () => {
  for (const caso of P.ORDEN_CASOS) {
    const base = P.rubrica("guardavidas", caso);
    assert.deepEqual(P.rubrica("guardavidas", caso, { paro: true, victima: "lactante", enLinea: false }), base, caso);
    assert.deepEqual(ids(base).slice(0, 10), ids(P.CHECKS), caso + ": los diez de la base, en orden");
    assert.deepEqual(ids(base).slice(10), ids(P.CASOS[caso].guardavidas.checks || []), caso + ": más los propios");
  }
  assert.deepEqual(P.rubrica("guardavidas", null), P.rubrica("guardavidas", "otro"));
  assert.deepEqual(P.rubrica("guardavidas", "inventado"), P.rubrica("guardavidas", "otro"));
  assert.deepEqual(P.rubrica("lego", null), P.rubrica("lego", "otro"));
  assert.deepEqual(P.rubrica("lego", undefined, { enLinea: undefined }), P.rubrica("lego", "otro"), "enLinea undefined no rompe");
});

test("guardavidas: el material con DEA sólo donde viene a cuento", () => {
  const material = id => P.rubrica("guardavidas", id).find(c => c.id === "material").logrado;
  assert.match(material("paro"), /DEA/);
  for (const id of ["hemorragia", "quemadura", "temperatura", "parto"]) {
    assert.notEqual(material(id), P.CHECKS.find(c => c.id === "material").logrado, id + ": el material tiene que ser el del cuadro");
  }
});

test("lego con paro: los diez de siempre, y ventilaciones con un ahogado, un chico o un bebé", () => {
  for (const caso of [...P.ORDEN_CASOS, null]) {
    for (const victima of VICTIMAS) {
      const R = P.rubrica("lego", caso, { paro: true, victima });
      const venti = caso === "ahogamiento" || victima === "nino" || victima === "lactante";
      assert.deepEqual(ids(R), ids(P.CHECKS_LEGO).concat(venti ? ["ventilaciones"] : []), caso + "/" + victima);
    }
  }
  // El caso paro es paro aunque no se diga en las opciones.
  assert.deepEqual(ids(P.rubrica("lego", "paro")), ids(P.CHECKS_LEGO));
  assert.deepEqual(ids(P.rubrica("lego", "paro", { paro: false })), ids(P.CHECKS_LEGO));
  assert.deepEqual(ids(P.rubrica("lego", "paro", { victima: "nino" })), ids(P.CHECKS_LEGO).concat(["ventilaciones"]));
});

test("lego sin paro: sin lo de la RCP, con las indicaciones y los criterios del caso", () => {
  for (const caso of P.ORDEN_CASOS.filter(id => id !== "paro")) {
    const c = P.CASOS[caso];
    for (const enLinea of [undefined, true, false]) {
      const R = P.rubrica("lego", caso, enLinea === undefined ? { paro: false } : { paro: false, enLinea });
      const k = caso + "/enLinea=" + enLinea;
      const queda = enLinea === undefined ? c.lego.enLinea : enLinea;
      for (const fuera of ["rcp", "dea", "altavoz"]) assert.ok(!ids(R).includes(fuera), k + ": sobra " + fuera);
      assert.equal(ids(R).includes("linea"), Boolean(queda), k + ": linea sigue a enLinea");
      const ind = R.find(x => x.id === "indicaciones_lego");
      assert.ok(ind && ind.peso === 15, k + ": indicaciones_lego con peso 15");
      const ayuda = R.find(x => x.id === "ayuda");
      assert.ok(!/DEA|relevo/.test(ayuda.logrado), k + ": la ayuda sin paro no habla del DEA ni del relevo");
      assert.equal(ayuda.peso, P.CHECKS_LEGO.find(x => x.id === "ayuda").peso, k + ": la ayuda conserva su peso");
      const propios = ids(c.lego.checks || []);
      if (propios.length) assert.deepEqual(ids(R).slice(-propios.length), propios, k + ": los criterios del caso van al final");
      else assert.equal(ids(R).at(-1), "indicaciones_lego", k);
      // La víctima no cambia nada sin paro.
      assert.deepEqual(P.rubrica("lego", caso, { paro: false, victima: "lactante", enLinea }), R, k);
    }
  }
  // El original no se toca: rubrica() devuelve copias.
  const R = P.rubrica("lego", "hemorragia");
  R[0].peso = 999;
  assert.notEqual(P.CHECKS_LEGO[0].peso, 999);
  assert.notEqual(P.rubrica("lego", "hemorragia")[0].peso, 999);
});

test("los criterios propios: pesos de 6 a 12, nunca críticos, sin pisar a los de la base", () => {
  for (const id of P.ORDEN_CASOS) {
    for (const [perfil, base] of [["guardavidas", P.CHECKS], ["lego", P.CHECKS_LEGO]]) {
      const propios = P.CASOS[id][perfil].checks || [];
      assert.ok(propios.length <= 3 || (id === "ahogamiento" && perfil === "guardavidas"), id + "/" + perfil + ": más de 3 criterios");
      for (const c of propios) {
        const k = id + "/" + perfil + "/" + c.id;
        assert.ok(!base.some(b => b.id === c.id), k + ": ya existe en la rúbrica base (usá `cambia`)");
        assert.ok(c.id !== "indicaciones_lego" && c.id !== "ventilaciones", k + ": pisa un criterio común");
        assert.ok(c.peso >= 6 && c.peso <= 12, k + ": peso " + c.peso);
        assert.equal(c.critico, false, k);
        assert.ok(c.label && c.logrado && c.parcial, k + " incompleto");
      }
      for (const cambiado of Object.keys(P.CASOS[id][perfil].cambia || {})) {
        assert.ok(base.some(b => b.id === cambiado), id + ": `cambia` apunta a un criterio que no existe: " + cambiado);
        assert.ok(!("critico" in P.CASOS[id][perfil].cambia[cambiado]), id + ": `cambia` no puede tocar si es crítico");
      }
    }
  }
});

/* ---------------- puntuar en los bordes ---------------- */
test("puntuar: bordes", () => {
  const R = P.rubrica("guardavidas", "hemorragia");
  // Sin datos, o con datos rotos: todo cuenta como faltó.
  assert.equal(P.puntuar(undefined, R), 0);
  assert.equal(P.puntuar({}, R), 0);
  assert.equal(P.puntuar({ items: "nada" }, R), 0);
  assert.equal(P.puntuar({ items: [null, { estado: "logrado" }, { id: "inventado", estado: "logrado" }] }, R), 0);
  // Estados escritos de otra manera.
  assert.equal(P.puntuar({ items: R.map(c => ({ id: c.id, estado: " LOGRADO " })) }, R), 100);
  assert.equal(P.puntuar({ items: R.map(c => ({ id: c.id, estado: "faltó" })) }, R), 0);
  assert.equal(P.puntuar({ items: R.map(c => ({ id: c.id, estado: "excelente" })) }, R), 0, "un estado desconocido es faltó");
  assert.equal(P.normEstado("Faltó"), "falto");
  assert.equal(P.normEstado(undefined), "falto");
  // Sin rúbrica, la base de guardavidas.
  assert.equal(P.puntuar(todos(P.CHECKS, "logrado"), undefined), 100);
  assert.equal(P.puntuar(todos(P.CHECKS, "logrado"), []), 100);
  // Pesos que no suman 100: normaliza.
  const chica = [{ id: "a", peso: 1 }, { id: "b", peso: 3 }];
  assert.equal(P.puntuar({ items: [{ id: "b", estado: "logrado" }] }, chica), 75);
  assert.equal(P.puntuar({ items: [{ id: "a", estado: "logrado" }, { id: "b", estado: "parcial" }] }, chica), 63, "redondea");
  // Pesos en cero: no divide por cero.
  assert.equal(P.puntuar(todos([{ id: "a", peso: 0 }], "logrado"), [{ id: "a", peso: 0 }]), 0);
});

test("puntuar: el tope crítico", () => {
  for (const [perfil, criticos] of [["guardavidas", ["ubicacion", "estado"]], ["lego", ["ubicacion", "respiracion"]]]) {
    const R = P.rubrica(perfil, "hemorragia");
    for (const id of criticos) {
      const d = todos(R, "logrado"); d.items.find(i => i.id === id).estado = "falto";
      assert.equal(P.puntuar(d, R), 40, perfil + "/" + id);
      assert.equal(d.topeado, true);
      // Parcial no topea.
      const p = todos(R, "logrado"); p.items.find(i => i.id === id).estado = "parcial";
      assert.ok(P.puntuar(p, R) > 40, perfil + "/" + id + " parcial");
      assert.equal(p.topeado, false);
    }
    // Si el total ya es menor que el tope, queda como está y no se marca topeado.
    const bajo = todos(R, "falto");
    assert.equal(P.puntuar(bajo, R), 0);
    assert.equal(bajo.topeado, false);
    // Un tope propio.
    const d = todos(R, "logrado"); d.items.find(i => i.id === "ubicacion").estado = "falto";
    assert.equal(P.puntuar(d, R, 25), 25);
    assert.equal(P.puntuar(d, R, Infinity), P.puntuar(d, R), "un tope que no es un número usa TOPE_CRITICO");
  }
});
