// Cómo la app reconoce el tipo de llamada, sin navegador: node --test pruebas/casos.test.mjs
// Carga protocolos.js como lo cargan las páginas (un script clásico) y prueba los
// detectores con frases como las que llegan por voz: sin signos, sin tildes a veces, y con
// las trampas de cada caso (relevamiento de la taxonomía, sección 2). Cada frase es un
// turno del alumno; un array son varios turnos de la misma llamada.
// Si una frase razonable falla, se corrige el detector en protocolos.js, no la frase.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fuente = fs.readFileSync(new URL("../protocolos.js", import.meta.url), "utf8");
const P = new Function(fuente + "\nreturn PROTOCOLOS;")();

// Corre una tabla [frase, esperado] y junta todas las fallas en un solo mensaje, para ver
// de una vez qué frases no reconoce.
function tabla(fn, filas, nombre) {
  const mal = [];
  for (const [frase, esperado] of filas) {
    const got = fn(Array.isArray(frase) ? frase : [frase]);
    if (got !== esperado) mal.push(JSON.stringify(frase) + " → " + JSON.stringify(got) + " (esperaba " + JSON.stringify(esperado) + ")");
  }
  assert.equal(mal.length, 0, nombre + ":\n  " + mal.join("\n  "));
}

/* ---------------- detectarCaso: una tabla por caso ----------------
   Cada caso lleva frases que lo delatan (✔) y trampas (✘): lo que se le parece y es otra
   cosa, o no alcanza para clasificar. */
const CASOS_FRASES = {
  ahogamiento: [
    ["lo sacamos del agua y no reacciona", "ahogamiento"],
    ["se hundió en la pileta", "ahogamiento"],
    ["un nene se está ahogando en la pileta", "ahogamiento"],
    ["estaba flotando boca abajo en el río", "ahogamiento"],
    ["tragó mucha agua en el mar", "ahogamiento"],
    ["se ahogó nadando en la laguna", "ahogamiento"],
    [["estamos en la playa", "se está ahogando"], "ahogamiento"],
    ["le dio una convulsión en la pileta y se hundió", "ahogamiento"],
    ["lo sacamos del agua helada y está tiritando", "ahogamiento"],
    // ✘ "se ahoga" sin agua no dice si es agua, comida o asma.
    ["se está ahogando", null],
    ["se ahoga con la comida", "atragantamiento"],
    ["no se ahogó, se cayó de la escalera", "trauma"],
    ["y si se está ahogando", null],
  ],
  atragantamiento: [
    ["se atragantó con un caramelo", "atragantamiento"],
    ["se le quedó un pedazo de carne en la garganta", "atragantamiento"],
    ["se tragó una moneda y no puede respirar", "atragantamiento"],
    ["estaba comiendo y no puede respirar", "atragantamiento"],
    ["se agarra el cuello y no le sale la voz", "atragantamiento"],
    ["se ahoga con la comida", "atragantamiento"],
    // ✘ las pastillas tragadas son intoxicación.
    ["se tragó todas las pastillas", "intoxicacion"],
    ["no se atragantó, se desmayó", "desmayo"],
  ],
  paro: [
    ["no responde y no respira", "paro"],
    ["está boqueando", "paro"],
    ["no tiene pulso", "paro"],
    ["le dio un paro", "paro"],
    ["creo que está en paro cardíaco", "paro"],
    ["ya le estoy haciendo RCP", "paro"],
    [["no responde", "no, no respira"], "paro"],
    ["se desmayó y no respira", "paro"],
    ["lo agarró la corriente, no responde y no respira", "paro"],
    // ✘ "paro" suelto: sin tildes es también el verbo.
    ["ya paró de convulsionar", "convulsion"],
    ["paró de sangrar", null],
    ["se paró y se cayó", null],
    ["listo, estoy apretando", null],
    ["respira pero no responde", "inconsciente"],
    ["no respira bien", null],
  ],
  hemorragia: [
    ["sangra mucho de la pierna", "hemorragia"],
    ["no para de sangrar", "hemorragia"],
    ["hay un charco de sangre", "hemorragia"],
    ["le sale un chorro de sangre del brazo", "hemorragia"],
    ["lo apuñalaron", "hemorragia"],
    ["se cortó la muñeca con un vidrio", "hemorragia"],
    ["se cayó de la bici y sangra mucho", "hemorragia"],
    ["chocó con la moto y sangra mucho", "hemorragia"],
    // ✘ sangrados chicos, o sangre que no es una herida.
    ["le sangra la nariz", null],
    ["tiene un poquito de sangre en la rodilla", null],
    ["tose sangre", null],
    ["no sangra", null],
  ],
  alergia: [
    ["le picó una abeja y se le hinchó la cara", "alergia"],
    ["es alérgico al maní y le falta el aire", "alergia"],
    ["se le está cerrando la garganta", "alergia"],
    ["tiene su epipen", "alergia"],
    ["le salieron ronchas y no puede respirar", "alergia"],
    ["tiene una reacción alérgica", "alergia"],
    ["le falta el aire después de que le picó una abeja y se le hinchó la cara", "alergia"],
    // ✘ alergia estacional, o la picadura y las ronchas sin nada más.
    ["es alérgico al polen y estornuda", null],
    ["le picó una abeja", null],
    ["tiene ronchas", null],
  ],
  parto: [
    ["está por tener el bebé", "parto"],
    ["rompió bolsa y tiene contracciones", "parto"],
    ["se le ve la cabeza al bebé", "parto"],
    ["está pujando", "parto"],
    ["ya nació el bebé y no llora", "parto"],
    ["mi señora está en trabajo de parto", "parto"],
    // ✘ "embarazada" sola: el caso es lo que le pasó.
    ["está embarazada y se cayó de la escalera", "trauma"],
    ["embarazada de ocho meses y le duele el pecho", "pecho"],
  ],
  acv: [
    ["tiene la boca torcida y no puede levantar el brazo", "acv"],
    ["le dio un ACV", "acv"],
    ["se le cayó un lado de la cara", "acv"],
    ["habla raro y no mueve el brazo", "acv"],
    ["creo que es un derrame cerebral", "acv"],
    ["se le durmió medio cuerpo", "acv"],
    // ✘ "habla raro" en un borracho o en un diabético.
    ["está borracho y habla raro", "intoxicacion"],
    ["es diabético y habla raro", "glucemia"],
  ],
  pecho: [
    ["le duele mucho el pecho", "pecho"],
    ["tiene una opresión en el pecho y transpira", "pecho"],
    ["le está dando un infarto", "pecho"],
    ["le duele el brazo izquierdo", "pecho"],
    ["le dio un ataque al corazón", "pecho"],
    [["le falta el aire", "le duele el pecho y transpira"], "pecho"],
    ["es diabético y le duele el pecho", "pecho"],
    // ✘ "ataque" solo no dice de qué.
    ["le dio un ataque", null],
    ["le duele la panza", null],
  ],
  respiratorio: [
    ["es asmático y no puede respirar", "respiratorio"],
    ["le silba el pecho", "respiratorio"],
    ["no encuentra el inhalador", "respiratorio"],
    ["tiene EPOC y le falta el aire", "respiratorio"],
    ["le falta el aire", "respiratorio"],
    ["le falta el aire, se ahoga, es asmático", "respiratorio"],
    // ✘ la falta de aire es señal débil: cualquier otra señal le gana.
    ["no es asmático, le duele el pecho", "pecho"],
    ["no puede respirar pero responde", "respiratorio"],
  ],
  convulsion: [
    ["está convulsionando", "convulsion"],
    ["es epiléptico y se puso rígido", "convulsion"],
    ["tiene los ojos para atrás y se sacude", "convulsion"],
    ["ya paró de convulsionar", "convulsion"],
    ["está temblando todo y tiene espuma por la boca", "convulsion"],
    ["tiene espuma en la boca y se sacude", "convulsion"],
    // ✘ temblar de frío es temperatura.
    ["está temblando de frío", "temperatura"],
    ["no convulsiona", null],
  ],
  glucemia: [
    ["es diabético y está muy confundido", "glucemia"],
    ["se le bajó el azúcar", "glucemia"],
    ["se puso insulina y no comió", "glucemia"],
    ["tiene hipoglucemia", "glucemia"],
    ["tiene el azúcar por el piso", "glucemia"],
    // ✘ "azúcar" sola.
    ["le di agua con azúcar", null],
  ],
  intoxicacion: [
    ["se tomó todas las pastillas", "intoxicacion"],
    ["tomó lavandina", "intoxicacion"],
    ["hay olor a gas y están mareados", "intoxicacion"],
    ["lo mordió una víbora", "intoxicacion"],
    ["están intoxicados con el brasero", "intoxicacion"],
    ["creo que es una sobredosis", "intoxicacion"],
    ["se tomó una caja de clonazepam", "intoxicacion"],
    // ✘ su remedio de siempre no es intoxicación; el borracho golpeado es un golpe.
    ["tomó su pastilla de la presión", null],
    ["está borracho y se golpeó la cabeza", "trauma"],
  ],
  temperatura: [
    ["le dio un golpe de calor", "temperatura"],
    ["estuvo al sol y está confundido", "temperatura"],
    ["está helado y tiritando", "temperatura"],
    ["tiene hipotermia", "temperatura"],
    ["dejó de transpirar", "temperatura"],
    // ✘ fiebre, o un golpe que no es de calor.
    ["tiene fiebre", null],
    ["se dio un golpe", "trauma"],
  ],
  trauma: [
    ["se cayó de una escalera", "trauma"],
    ["se cayó del techo", "trauma"],
    ["se cayó desde el balcón", "trauma"],
    ["lo atropelló un auto", "trauma"],
    ["chocó con la moto", "trauma"],
    ["se tiró de cabeza y no siente las piernas", "trauma"],
    ["creo que se fracturó el brazo", "trauma"],
    ["le duele mucho el cuello después del golpe", "trauma"],
    // ✘ caerse "redondo" es desmayo; un corte de luz no es una herida.
    ["cayó redondo", "desmayo"],
    ["se cayó de golpe", null],
    ["se cortó la luz", null],
  ],
  quemadura: [
    ["se quemó con agua hirviendo", "quemadura"],
    ["se volcó la pava encima", "quemadura"],
    ["se le cayó aceite caliente encima", "quemadura"],
    ["se prendió fuego la ropa", "quemadura"],
    ["tiene ampollas en el brazo", "quemadura"],
    ["lo agarró la corriente pero habla", "quemadura"],
    // ✘ la de sol no; el electrocutado en paro es paro.
    ["se quemó con el sol", null],
    ["lo agarró la corriente, no responde y no respira", "paro"],
  ],
  inconsciente: [
    ["no responde pero respira", "inconsciente"],
    ["está inconsciente", "inconsciente"],
    ["está como dormido", "inconsciente"],
    ["no se despierta", "inconsciente"],
    // ✘ si además no respira, es paro.
    ["no responde y no respira", "paro"],
    ["no está inconsciente", null],
  ],
  desmayo: [
    ["se desmayó y ya volvió en sí", "desmayo"],
    ["le bajó la presión y se cayó", "desmayo"],
    ["se desmayó", "desmayo"],
    ["tuvo una lipotimia", "desmayo"],
    // ✘
    ["no se desmayó", null],
    ["se desmayó y no respira", "paro"],
  ],
  otro: [
    // Lo que no encaja no se adivina: null (la app lo trata como `otro`).
    ["le duele mucho la panza", null],
    ["tiene un ataque de pánico", null],
    ["hola, buenas", null],
    ["", null],
    ["[silencio: la persona no dice nada]", null],
    ["lo mordió un dinosaurio", null],
  ],
};

for (const [id, filas] of Object.entries(CASOS_FRASES)) {
  test("detectarCaso: " + id, () => {
    assert.ok(filas.length >= 6, id + ": al menos 6 frases");
    tabla(P.detectarCaso, filas, id);
  });
}

test("detectarCaso: la tabla cubre los 18 casos", () => {
  for (const id of P.ORDEN_CASOS) assert.ok(CASOS_FRASES[id], "falta la tabla de " + id);
});

test("detectarCaso: entradas raras no rompen", () => {
  assert.equal(P.detectarCaso([]), null);
  assert.equal(P.detectarCaso(null), null);
  assert.equal(P.detectarCaso(undefined), null);
  assert.equal(P.detectarCaso("se atragantó con un caramelo"), "atragantamiento", "un string suelto vale como un turno");
  assert.equal(P.detectarCaso([null, "no tiene pulso"]), "paro");
});

test("detectarCaso: la señal de mayor prioridad gana, aunque venga en otro turno", () => {
  assert.equal(P.detectarCaso(["se cayó de una escalera", "ahora sangra mucho"]), "hemorragia");
  assert.equal(P.detectarCaso(["le duele el pecho", "no responde y no respira"]), "paro");
  assert.equal(P.detectarCaso(["se desmayó", "es diabético"]), "glucemia");
  assert.equal(P.detectarCaso(["está convulsionando", "lo sacamos de la pileta"]), "ahogamiento");
});

/* ---------------- detectarParo e indicioDeParo ---------------- */
test("detectarParo: sólo con una señal inequívoca", () => {
  tabla(P.detectarParo, [
    ["no responde y no respira", true],
    [["no responde", "no, no respira"], true],
    ["está boqueando", true],
    ["no tiene pulso", true],
    ["le dio un paro", true],
    ["entró en paro", true],
    ["paro cardiorrespiratorio", true],
    ["paro respiratorio", true],
    ["ya le estoy haciendo RCP", true],
    ["estamos haciendo reanimación", true],
    ["le estoy haciendo masaje cardíaco", true],
    ["estoy haciendo compresiones en el pecho", true],
    ["cayó redondo y no respira", true],
    // Las trampas del contrato (§6) y sus parientes.
    ["ya paró de convulsionar", false],
    ["paró de sangrar", false],
    ["se paró y se cayó", false],
    ["listo estoy apretando", false],
    ["estoy empujando", false],
    ["le hago compresiones abdominales", false],
    ["no puede respirar", false],
    ["no respira bien", false],
    ["respira pero no responde", false],
    ["no responde", false],
    ["no respira", false],
    ["no le estoy haciendo RCP", false],
    ["dónde tengo que hacer RCP", false],
    ["no tiene pulso radial", false],
    ["y si entra en paro", false],
    ["no, respira bien", false],
  ], "detectarParo");
});

test("indicioDeParo: alguna señal suelta alcanza", () => {
  tabla(P.indicioDeParo, [
    ["no respira", true],
    ["no responde", true],
    ["no reacciona", true],
    ["está inconsciente", true],
    ["está morado", true],
    ["tiene los labios azules", true],
    ["está boqueando", true],
    ["no tiene pulso", true],
    ["le dio un paro", true],
    ["le duele el pecho", false],
    ["sangra mucho", false],
    ["responde bien y respira", false],
    ["", false],
  ], "indicioDeParo");
});

/* ---------------- detectarInconsciente ---------------- */
test("detectarInconsciente: el estado de ahora, no el episodio", () => {
  tabla(P.detectarInconsciente, [
    ["no responde", true],
    ["no reacciona pero respira", true],
    ["está desmayado", true],
    ["está inconsciente", true],
    ["no se despierta", true],
    [["no reacciona", "sigue igual"], true],
    ["se desmayó pero ya habla", false],
    [["no reacciona", "ya se despertó"], false],
    ["estaba inconsciente pero ya volvió en sí", false],
    ["responde bien", false],
    ["no está inconsciente", false],
    [["ya se despertó", "ahora no responde de nuevo"], true],
  ], "detectarInconsciente");
});

/* ---------------- detectarVictima ---------------- */
test("detectarVictima: la más chica gana; señor, señora, hombre, mujer sueltos no cuentan", () => {
  tabla(P.detectarVictima, [
    // Los del contrato (§6).
    ["soy la abuela, mi nieto de 3 años", "nino"],
    ["sí señora", null],
    [["la mamá está bien", "el bebé no respira"], "lactante"],
    // Lactante.
    ["mi bebé de 8 meses", "lactante"],
    ["es una beba", "lactante"],
    ["un recién nacido", "lactante"],
    ["tiene seis meses", "lactante"],
    // Chico.
    ["un nene de 4 años", "nino"],
    ["mi hijita no respira", "nino"],
    ["tiene 10 años", "nino"],
    ["tiene un año", "nino"],
    ["no es un bebé, tiene 10 años", "nino"],
    ["un hombre y un nene", "nino"],
    // Adulto.
    ["un señor de 60 años", "adulto"],
    ["tiene 45 años", "adulto"],
    ["tiene cuarenta y cinco años", "adulto"],
    ["una chica de 25 años", "adulto"],
    ["mi papá", "adulto"],
    ["una mujer", "adulto"],
    ["mi marido no responde", "adulto"],
    // Nada.
    ["mujer", null],
    ["señor, por favor venga", null],
    ["hace 3 años que es diabético", null],
    ["tengo 30 años", null],
    ["está embarazada de 8 meses", null],
    ["no puedo, hombre", null],
    ["", null],
  ], "detectarVictima");
});

/* ---------------- normalizar ---------------- */
test("normalizar: minúsculas, sin tildes ni signos, con un espacio en cada punta", () => {
  assert.equal(P.normalizar("¡No RESPIRA!, ¿qué hago?"), " no respira que hago ");
  assert.equal(P.normalizar("Tiene 3 años"), " tiene 3 anos ");
  assert.equal(P.normalizar(""), " ");
  assert.equal(P.normalizar(null), " ");
});

/* ---------------- resolverCaso: todos los caminos ---------------- */
test("resolverCaso: candidato, escalada, nunca baja ni vuelve a nulo", () => {
  const filas = [
    // Sin caso todavía: gana el candidato (el de más prioridad entre texto y marca).
    [[null, null, null], null],
    [[null, "hemorragia", null], "hemorragia"],
    [[null, null, "quemadura"], "quemadura"],
    [[null, "trauma", "hemorragia"], "hemorragia"],
    [[null, "hemorragia", "trauma"], "hemorragia"],
    // Una marca o un texto con id que no existe se ignora.
    [[null, null, "inventado"], null],
    [[null, "inventado", "trauma"], "trauma"],
    [[null, 3, {}], null],
    [[undefined, undefined, undefined], null],
    // Con caso: sólo escala.
    [["trauma", "hemorragia", null], "hemorragia"],
    [["hemorragia", "trauma", null], "hemorragia"],
    [["hemorragia", null, "trauma"], "hemorragia"],
    [["hemorragia", null, null], "hemorragia"],
    [["hemorragia", "hemorragia", "hemorragia"], "hemorragia"],
    [["pecho", null, "paro"], "paro"],
    [["paro", "ahogamiento", null], "ahogamiento"],
    [["paro", null, "inventado"], "paro"],
    [["paro", "pecho", "otro"], "paro"],
    // Provisorios: cualquier caso los reemplaza; entre ellos no hay ida y vuelta.
    [["inconsciente", "desmayo", null], "inconsciente"],
    [["desmayo", "inconsciente", null], "inconsciente"],
    [["otro", "desmayo", null], "desmayo"],
    [["desmayo", null, "otro"], "desmayo"],
    [["otro", null, "quemadura"], "quemadura"],
    [["inconsciente", "glucemia", null], "glucemia"],
    // Un caso actual que no existe no frena al candidato.
    [["inventado", "trauma", null], "trauma"],
    [["inventado", null, null], null],
  ];
  const mal = [];
  for (const [args, esperado] of filas) {
    const got = P.resolverCaso(...args);
    if (got !== esperado) mal.push(JSON.stringify(args) + " → " + got + " (esperaba " + esperado + ")");
  }
  assert.equal(mal.length, 0, mal.join("\n"));
});

test("resolverCaso: recorrer el orden de a uno sólo sube", () => {
  let actual = null;
  for (const id of P.ORDEN_CASOS.slice().reverse()) {
    actual = P.resolverCaso(actual, id, null);
    assert.equal(actual, id);
  }
  for (const id of P.ORDEN_CASOS) assert.equal(P.resolverCaso("ahogamiento", id, id), "ahogamiento");
});

test("casoDe: sin caso, o con uno que no existe, vale otro", () => {
  assert.equal(P.casoDe(null), P.CASOS.otro);
  assert.equal(P.casoDe("inventado"), P.CASOS.otro);
  assert.equal(P.casoDe("toString"), P.CASOS.otro, "no confunde un nombre heredado con un caso");
  assert.equal(P.casoDe("paro"), P.CASOS.paro);
});
