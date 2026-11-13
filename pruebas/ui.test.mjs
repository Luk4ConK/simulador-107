// Pruebas de punta a punta en un navegador real (Chromium con Playwright), con el
// servidor de prueba y un operador de mentira que sigue el ESTADO DE LA LLAMADA.
//
//   NODE_PATH=$(npm root -g) node pruebas/ui.test.mjs
//
// Se prueba en modo texto (sin reconocimiento de voz), que es el mismo flujo de turnos.
// Voz real, ruido y latencia percibida no se pueden probar así: eso va en el celular.
//
// Desde noviembre de 2026 no hay escenarios: el alumno cuenta el caso y el operador se
// adapta. Acá se recorre eso de punta a punta: la entrada con sus tres puertas, la
// configuración, el teclado, llamadas de los dos perfiles con y sin paro, la devolución con
// el caso a la vista, la clase con consigna, el panel y las páginas públicas.
import { createRequire } from "node:module";
import fs from "node:fs";
import assert from "node:assert/strict";

process.env.RAPIDO = "1";
process.env.CON_BASE = "1";
process.env.CODIGO_ADMIN = "ADMIN-DE-PRUEBA-99";
process.env.PUERTO = process.env.PUERTO || "8123";
const { default: servidor, redis, gemini: geminiFalso } = await import("./servidor.mjs");
const base = "http://localhost:" + process.env.PUERTO;
const ADMIN = { "x-panel": "ADMIN-DE-PRUEBA-99" };
const CELULAR = { width: 375, height: 812 };

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// Voz de mentira: el operador "habla" en 30 ms; sin reconocedor, la app pasa a texto.
function falsos() {
  const oyentes = {};
  const sintesis = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [], cancel(){ if(this._u){ const u=this._u; this._u=null; u.onend && u.onend(); } },
    speak(u){ this._u = u; window.__hablado = (window.__hablado||[]).concat(u.text); setTimeout(()=>{ if(this._u===u){ this._u=null; u.onend && u.onend(); } }, 30); },
    addEventListener(t, f){ (oyentes[t] = oyentes[t] || []).push(f); }, removeEventListener(){}
  };
  Object.defineProperty(window, "speechSynthesis", { value: sintesis, configurable: true });
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] });
}

async function api(ruta, body, headers = {}) {
  const r = await fetch(base + ruta, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return r.json();
}

const errores = [];
async function nuevaPagina(viewport) {
  const ctx = await navegador.newContext({ serviceWorkers: "block", acceptDownloads: true, ...(viewport ? { viewport } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", e => { console.error("ERROR EN LA PÁGINA:", e.message, e.stack || ""); errores.push(e.message); });
  await page.addInitScript(falsos);
  return page;
}

// Espera a que se pueda hablar o a que la llamada haya terminado. Devuelve false si terminó.
async function turnoLibre(page) {
  await page.waitForFunction(() => !document.querySelector("#ver-informe").hidden
    || (!document.querySelector("#send").disabled && !document.querySelector("#typer").hidden), null, { timeout: 20000 });
  return await page.locator("#ver-informe").isHidden();
}

async function decir(page, texto) {
  if (!(await turnoLibre(page))) return false;
  const antes = await page.locator(".msg.op:not(.live)").count();
  await page.fill("#typed", texto);
  await page.click("#send");
  await page.waitForFunction(n => document.querySelectorAll(".msg.op:not(.live)").length > n
    || !document.querySelector("#ver-informe").hidden, antes, { timeout: 15000 });
}

async function marcar(page, numero) {
  for (const k of numero) await page.click(`#teclas button[data-k="${k}"]`);
  await page.click("#llamar");
}

// Marca el 107 y espera a que la central atienda (la apertura es una frase fija).
async function llamar(page) {
  await marcar(page, "107");
  await page.waitForSelector("#v-call:not([hidden])");
  await page.waitForSelector("#typer:not([hidden])", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".msg.op:not(.live)").length >= 1, null, { timeout: 10000 });
}

async function entrarConCodigo(page, codigo) {
  await page.goto(base + "/");
  await page.waitForSelector("#v-gate:not([hidden])");
  await page.fill("#gate-in", codigo);
  await page.click("#gate-go");
  await page.waitForSelector("#v-setup:not([hidden])");
}

async function verDevolucion(page) {
  // Ninguna marca del operador llega a la pantalla ni a la voz.
  assert.ok(!(await page.locator("#feed").innerText()).includes("[["), "ninguna marca [[...]] en la pantalla");
  const hablado = await page.evaluate(() => (window.__hablado || []).join(" | "));
  assert.ok(hablado.length > 0 && !hablado.includes("[["), "ninguna marca [[...]] en lo que lee la voz");
  await page.click("#ver-informe");
  await page.waitForSelector("#deb-body:not([hidden])", { timeout: 15000 });
}

// En un celular nada se sale del ancho de la pantalla: ni la página ni lo que tiene adentro.
async function sinScrollHorizontal(page, donde) {
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cuerpo: document.body.scrollWidth, vista: window.innerWidth }));
  assert.ok(ancho.doc <= ancho.vista && ancho.cuerpo <= ancho.vista, donde + ": sin scroll horizontal en el celular (" + JSON.stringify(ancho) + ")");
}

async function leerDescarga(descarga) {
  return await new Promise((ok, mal) => { descarga.createReadStream().then(s => { let t = ""; s.on("data", c => t += c); s.on("end", () => ok(t)); s.on("error", mal); }); });
}

/* Lo que le llegó a la IA. Cada pedido al operador lleva el prompt entero: la parte fija y,
   al final, la variable (lo del caso bajo "SOBRE ESTA LLAMADA" y el "ESTADO DE LA LLAMADA"). */
const sistemaDe = x => (x.cuerpo.systemInstruction && x.cuerpo.systemInstruction.parts[0].text) || "";
const esEvaluador = x => /Respondés únicamente con un objeto JSON/.test(sistemaDe(x));
const promptsDelOperador = desde => geminiFalso.registro.slice(desde).filter(x => sistemaDe(x) && !esEvaluador(x)).map(sistemaDe);
const promptsDelEvaluador = desde => geminiFalso.registro.slice(desde).filter(esEvaluador).map(x => x.cuerpo.contents[0].parts[0].text);
const partir = p => { const i = p.lastIndexOf("SOBRE ESTA LLAMADA"); return { fijo: p.slice(0, i), variable: p.slice(i) }; };

let ok = 0;
async function prueba(nombre, f) {
  process.stdout.write("· " + nombre + " … ");
  await f();
  ok++;
  console.log("ok");
}

// Lo que comparten las pruebas de clase y la del panel.
let cursoNorte = null, instNorte = null, salaNorte = null;
const CONSIGNA = "En la cocina del club, alguien se quema o se descompone: lo decide cada grupo.";
const LUGAR = "Club Regatas, Avenida Alem 3288";

try {
  await prueba("guardavidas en un celular: entrada, configuración, teclado, ahogamiento con paro, cierre del operador y devolución", async () => {
    const desde = geminiFalso.registro.length;
    const page = await nuevaPagina(CELULAR);
    await page.goto(base + "/");
    await page.waitForSelector("#v-gate:not([hidden])");
    assert.equal(await page.locator("#v-gate .puerta").count(), 3, "la entrada tiene tres puertas");
    await sinScrollHorizontal(page, "entrada");
    // Sin código: con base configurada, pide código. Se entra con el del administrador.
    await page.fill("#gate-in", "codigo-que-no-existe");
    await page.click("#gate-go");
    await page.waitForFunction(() => /no es el correcto/.test(document.querySelector("#gate-err").textContent));
    await page.fill("#gate-in", "ADMIN-DE-PRUEBA-99");
    await page.click("#gate-go");
    await page.waitForSelector("#v-setup:not([hidden])");

    // Configuración: ya no hay tarjetas de escenarios ni briefing; sí el aviso de la dirección.
    assert.equal(await page.locator(".card, #scenarios, #btn-brief, #v-brief, #v-nuevo").count(), 0, "no queda nada de los escenarios");
    assert.match(await page.locator("#aviso-direccion").innerText(), /no des tu domicilio/);
    assert.equal(await page.locator("#consigna-setup").isHidden(), true, "sin clase no hay consigna");
    assert.equal(await page.locator("#btn-call").innerText(), "Agarrar el teléfono");
    await sinScrollHorizontal(page, "configuración");

    // Teclado: se puede volver; un número equivocado no llama y explica cuál es; el 107 sí.
    await page.click("#btn-call");
    await page.waitForSelector("#v-dial:not([hidden])");
    await sinScrollHorizontal(page, "teclado");
    assert.match(await page.locator("#v-dial").innerText(), /No des tu domicilio ni datos reales/);
    await page.click("#dial-volver");
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.click("#btn-call");
    await page.waitForSelector("#v-dial:not([hidden])");
    await marcar(page, "911");
    await page.waitForFunction(() => /107/.test(document.querySelector("#dial-aviso").textContent));
    assert.equal(await page.locator("#v-call").isHidden(), true, "el 911 no arranca la llamada");
    await sinScrollHorizontal(page, "teclado con el aviso");
    await llamar(page);

    await decir(page, "Estoy en la Costanera Este, puesto 2, entrá por la bajada frente al camping");
    await decir(page, "Saqué del agua a un hombre de 35 años, no responde y no respira");
    await sinScrollHorizontal(page, "llamada");
    await decir(page, "Estamos comprimiendo y ventilando, tengo el DEA y el bolso, te espera mi compañero en la bajada");
    await decir(page, "Soy Luka, guardavidas del puesto 2");
    for (let i = 0; i < 4; i++) if ((await decir(page, "Seguimos con la RCP")) === false) break;
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 15000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["), "ninguna marca [[...]] se filtra a la pantalla");
    assert.match(feed, /El operador cortó la llamada/);
    assert.match(feed, /SEM ya está en camino/);
    await sinScrollHorizontal(page, "llamada terminada");

    await verDevolucion(page);
    await sinScrollHorizontal(page, "devolución");
    assert.equal(await page.locator("#deb-caso").textContent(), "Llamada al 107 · Ahogamiento · con paro");
    assert.equal(await page.locator("#ring-t").textContent(), "100");
    assert.match(await page.locator("#deb-meta").innerText(), /ubicación a los/);
    assert.match(await page.locator("#deb-saved").innerText(), /Guardado en el registro/);
    // La rúbrica de ahogamiento suma sus criterios propios a los globales.
    assert.equal(await page.locator("#deb-items .item").count(), 10 + 3);
    assert.match(await page.locator("#deb-items").innerText(), /sumersión/i);
    assert.ok(!(await page.locator("#v-debrief").innerText()).includes("[["), "ninguna marca en la devolución");

    // El operador supo qué tipo de llamada era por el bloque del caso, con la escala de grados.
    const prompts = promptsDelOperador(desde);
    assert.match(partir(prompts[0]).variable, /todavía no sabés qué pasa/);
    assert.ok(prompts.some(p => /TIPO DE LLAMADA: Ahogamiento/.test(partir(p).variable) && /ESCALA QUE MANEJÁS/.test(partir(p).variable)));
    // El grado que marcó con esa escala (6: paro) le llega de vuelta en el estado.
    assert.ok(prompts.some(p => /Ya tenés el grado: 6/.test(partir(p).variable)), "la marca [[GRADO]] se acepta en un ahogamiento");
    // Y el evaluador, qué caso clasificó la app.
    const ev = promptsDelEvaluador(desde).pop();
    assert.match(ev, /QUIÉN LLAMA: guardavidas/);
    assert.match(ev, /TIPO DE CASO \(lo clasificó la app a partir de la llamada\): Ahogamiento/);
    assert.match(ev, /HUBO PARO: sí/);
    assert.match(ev, /VÍCTIMA: un adulto/);
    assert.match(ev, /No penalices que la dirección, el nombre o el teléfono sean inventados/);

    // El informe se descarga con el caso en el nombre y adentro.
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
    assert.match(descarga.suggestedFilename(), /^informe-107-ahogamiento-\d{4}-\d\d-\d\d\.txt$/);
    const informe = await leerDescarga(descarga);
    assert.match(informe, /Ahogamiento/);
    assert.ok(!/undefined|\[\[/.test(informe), "el informe no trae marcas ni huecos");

    // "Llamar de nuevo" lleva al teclado; "Cambiar ajustes" (desde la devolución), a la configuración.
    await page.click("#again");
    await page.waitForSelector("#v-dial:not([hidden])");
    await page.context().close();
  });

  await prueba("sin ubicación no hay despacho, aunque el operador diga que la tiene", async () => {
    // El caso de las pruebas contra producción: un alumno que contesta con preguntas y un
    // operador que declara todos los datos, ubicación incluida, y anuncia el móvil.
    const estados = [];
    geminiFalso.operador = (sistema) => {
      const estado = sistema.slice(sistema.lastIndexOf("ESTADO DE LA LLAMADA"));
      estados.push(estado);
      if (/SE TERMINÓ/.test(estado)) return "Sin la dirección no puedo mandarte el móvil. Averiguala y volvé a llamar al 107.\n[[CERRAR]]";
      return "El SEM ya está en camino, llega en unos 6 minutos. ¿Algo más?\n[[DATOS:ubicacion,motivo,victimas,estado,acciones,material,acceso]]\n[[CASO:paro,paro,adulto]]";
    };
    try {
      const page = await nuevaPagina();
      await entrarConCodigo(page, "ADMIN-DE-PRUEBA-99");
      await page.click("#btn-call");
      await llamar(page);
      // Nada que un móvil pueda buscar: la edad no es una dirección.
      for (const t of ["¿Qué hago?", "Hay un hombre de 40 años que no respira", "¿Ya viene?", "¿Me escuchás?", "¿Qué tengo que hacer?", "Apurate por favor"]) {
        if ((await decir(page, t)) === false) break;
      }
      await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 20000 });
      const feed = await page.locator("#feed").innerText();
      assert.match(feed, /no puedo mandarte el móvil/, "cierra abandonando, no despachando");
      assert.ok(!feed.includes("[["));
      assert.ok(estados.some(e => /NO tenés la ubicación/.test(e)), "la app le hace aclarar que sin ubicación no sale nada");
      assert.ok(!estados.some(e => /El móvil está en camino y le faltan/.test(e)), "nunca le dice que el móvil está en camino");
      assert.ok(!estados.some(e => /Datos que YA tenés[^\n]*ubicacion/.test(e)), "la ubicación inventada no entra en la grilla");
      await page.context().close();
    } finally {
      geminiFalso.operador = null;
    }
  });

  await prueba("guardavidas con una hemorragia: el bloque del caso viaja en la parte variable y la rúbrica es la de ese caso", async () => {
    const desde = geminiFalso.registro.length;
    const page = await nuevaPagina();
    await entrarConCodigo(page, "ADMIN-DE-PRUEBA-99");
    await page.click("#btn-call");
    await llamar(page);
    await decir(page, "Estoy en la Costanera Este, puesto 2, entrá por la bajada frente al camping");
    await decir(page, "Un hombre de 30 años se cortó la pierna con un vidrio y sangra muchísimo, a chorros, de la pierna");
    await decir(page, "Está consciente y respira. Le estamos haciendo presión directa con gasas, tengo el botiquín y un torniquete, te espera mi compañero en la bajada");
    await decir(page, "Soy Luka, guardavidas del puesto 2");
    for (let i = 0; i < 4; i++) if ((await decir(page, "Seguimos apretando la herida")) === false) break;
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 15000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["));
    assert.match(feed, /El operador cortó la llamada/);
    await verDevolucion(page);
    assert.match(await page.locator("#deb-caso").innerText(), /Llamada al 107 · Hemorragia grave$/i);
    assert.equal(await page.locator("#ring-t").textContent(), "100");
    // Los diez globales más los dos propios de la hemorragia; nada del ahogamiento.
    assert.equal(await page.locator("#deb-items .item").count(), 10 + 2);
    const items = await page.locator("#deb-items").innerText();
    assert.match(items, /De dónde sangra y cuánto/);
    assert.match(items, /Qué están haciendo para frenar el sangrado/);
    assert.ok(!/sumersión/i.test(items));

    const prompts = promptsDelOperador(desde).map(partir);
    // La parte fija no cambia en toda la llamada (se puede cachear) y no depende del caso.
    assert.ok(prompts.length >= 5);
    assert.ok(prompts.every(p => p.fijo === prompts[0].fijo), "la parte fija del prompt es idéntica en todos los turnos");
    assert.match(prompts[0].fijo, /QUÉ TIPO DE LLAMADA ES/);
    assert.ok(!/TIPO DE LLAMADA: Hemorragia/.test(prompts[0].fijo));
    // Antes de saber qué pasa no hay bloque; después, el de la hemorragia con su dato propio.
    assert.match(prompts[0].variable, /todavía no sabés qué pasa/);
    const conCaso = prompts.filter(p => /TIPO DE LLAMADA: Hemorragia grave/.test(p.variable));
    assert.ok(conCaso.length >= 3, "el bloque del caso viaja en la parte variable desde que se lo reconoce");
    assert.ok(conCaso.every(p => /CÓMO INTERROGÁS ESTE CUADRO/.test(p.variable) && /LO QUE SABÉS DE ESTE CUADRO/.test(p.variable)));
    assert.ok(conCaso.some(p => /Identificadores válidos: [^\n]*sangrado/.test(p.variable)), "el dato propio del caso entra en la grilla");
    assert.ok(conCaso.some(p => /presión directa sobre la herida/.test(p.variable)), "lo que pide por acciones es lo de este cuadro");
    // Sólo el ahogamiento lleva escala de grados.
    assert.ok(!prompts.some(p => /ESCALA QUE MANEJÁS/.test(p.variable)));
    const ev = promptsDelEvaluador(desde).pop();
    assert.match(ev, /TIPO DE CASO \(lo clasificó la app a partir de la llamada\): Hemorragia grave/);
    assert.match(ev, /HUBO PARO: no/);
    assert.match(ev, /- origen \(/);
    // "Cambiar ajustes" vuelve a la configuración.
    await page.click("#other");
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.context().close();
  });

  await prueba("lego que ya comprime y lo dice todo en la primera frase: igual escucha que la ambulancia sale", async () => {
    // Lo que se enseña en un curso de RCP. Antes la única orden de anunciar la ambulancia
    // estaba en la rama de "todavía no comprime", así que nunca la anunciaba, el reloj del
    // arribo no arrancaba y la llamada terminaba en "sin la dirección no puedo mandarte".
    const cuenta = (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Curso RCP Oeste", plan: "instructor" } }, ADMIN)).cuenta;
    const sala = (await api("/api/datos", { accion: "sala-crear", nombre: "RCP domingo", perfil: "lego", horas: 2 }, { "x-panel": cuenta.codigoInstructor })).sala;
    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + sala.codigo);
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.waitForFunction(() => /RCP domingo/.test(document.querySelector("#cuenta-info").textContent));
    assert.equal(await page.locator("#consigna-setup").isHidden(), true, "una clase sin consigna no muestra el recuadro");
    await page.fill("#alias", "Grupo 7");
    await page.click("#btn-call");
    await llamar(page);
    await decir(page, "Ya estoy comprimiendo. Estoy en el gimnasio de San Martín 2850, primer piso. Un hombre se desplomó, no responde y no respira.");
    // Después se queda callado comprimiendo: el operador anuncia, alienta y cierra al llegar.
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 40000 });
    const feed = await page.locator("#feed").innerText();
    assert.match(feed, /ambulancia ya sale/i);
    assert.match(feed, /ambulancia ya está ahí/i);
    assert.match(feed, /Seguí comprimiendo/);
    assert.ok(!/Sin la dirección/i.test(feed), "no la abandona con la dirección dada");
    assert.ok(!feed.includes("[["));
    await page.context().close();
  });

  await prueba("lego en una clase con consigna, en un celular: quemadura, recibe indicaciones y el operador corta diciendo cuándo volver a llamar", async () => {
    cursoNorte = (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Curso RCP Norte", plan: "instructor" } }, ADMIN)).cuenta;
    instNorte = { "x-panel": cursoNorte.codigoInstructor };
    salaNorte = (await api("/api/datos", { accion: "sala-crear", nombre: "RCP sábado", perfil: "lego", horas: 2, consigna: CONSIGNA, lugar: LUGAR, zona: "Santa Fe" }, instNorte)).sala;
    const desde = geminiFalso.registro.length;

    const page = await nuevaPagina(CELULAR);
    await page.goto(base + "/?sala=" + salaNorte.codigo);
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.waitForFunction(() => /RCP sábado/.test(document.querySelector("#cuenta-info").textContent));
    assert.equal(await page.locator("#perfil").isHidden(), true, "la clase fija el perfil");
    assert.match(await page.locator("#perfil-fijo").innerText(), /sin formación|persona común/i);
    // La consigna y el lugar que dejó el instructor, a la vista.
    await page.waitForSelector("#consigna-setup:not([hidden])");
    assert.match(await page.locator("#consigna-setup").innerText(), /Consigna de la clase/i);
    assert.match(await page.locator("#consigna-setup .c-txt").innerText(), /En la cocina del club/);
    assert.match(await page.locator("#consigna-setup .c-lugar").innerText(), /Club Regatas, Avenida Alem 3288/);
    await sinScrollHorizontal(page, "configuración de la clase");
    // En clase, el nombre del grupo es obligatorio.
    await page.click("#btn-call");
    await page.waitForFunction(() => /nombre de tu grupo/.test(document.querySelector("#setup-note").textContent));
    assert.equal(await page.locator("#v-dial").isHidden(), true);
    await page.fill("#alias", "Grupo 3");
    await page.click("#btn-call");
    await page.waitForSelector("#v-dial:not([hidden])");
    assert.match(await page.locator("#consigna-dial").innerText(), /En la cocina del club/);
    assert.match(await page.locator("#consigna-dial").innerText(), /Avenida Alem 3288/);
    await sinScrollHorizontal(page, "teclado de la clase");

    // El tablero ve al grupo desde que agarra el teléfono, y después en llamada.
    let vivo = await api("/api/datos", { accion: "sala-vivo", codigo: salaNorte.codigo }, instNorte);
    assert.equal(vivo.grupos.find(g => g.grupo === "Grupo 3").estado, "conectado");
    await llamar(page);
    vivo = await api("/api/datos", { accion: "sala-vivo", codigo: salaNorte.codigo }, instNorte);
    assert.equal(vivo.grupos.find(g => g.grupo === "Grupo 3").estado, "en llamada");

    await decir(page, "Estoy en el Club Regatas, Avenida Alem 3288, en la cocina");
    await decir(page, "Mi compañera se quemó la mano con agua hirviendo");
    await decir(page, "Sí, me responde, está despierta y respira bien");
    await sinScrollHorizontal(page, "llamada de la clase");
    // No es en línea: el operador da las indicaciones de a una y corta él.
    for (const t of ["Listo, ya tiene la mano bajo la canilla", "Ya le saqué los anillos, te espera mi compañero en la entrada", "Ya se la tapé. Mi teléfono es el 3425550101", "Bueno", "Bueno", "Bueno"]) {
      if ((await decir(page, t)) === false) break;
    }
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 20000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["));
    assert.match(feed, /ambulancia ya sale/i);
    assert.match(feed, /bajo el agua fresca de la canilla/, "recibe las indicaciones del caso");
    assert.match(feed, /sacale anillos/);
    assert.ok(!/No lo toques: primero que alguien corte la luz/.test(feed), "una indicación condicional no se da si nadie contó esa condición");
    assert.ok(!/altavoz|empujar fuerte|comprim/i.test(feed), "sin paro no hay RCP guiada");
    assert.match(feed, /Voy a cortar: volvé a llamar al 107 si se le pone ronca la voz/, "corta con la alarma del caso");
    assert.match(feed, /El operador cortó la llamada/);
    assert.ok(!/ambulancia ya está ahí/i.test(feed), "en este cuadro no se queda en línea hasta el arribo");

    await verDevolucion(page);
    await sinScrollHorizontal(page, "devolución de la clase");
    assert.match(await page.locator("#deb-caso").innerText(), /Llamada al 107 · Quemadura$/i);
    assert.ok(!/RCP/.test(await page.locator("#deb-meta").innerText()), "sin paro no se informa la RCP");
    // Rúbrica lego sin paro: sin RCP, DEA, altavoz ni "se quedó en línea"; con las indicaciones y lo del caso.
    const items = await page.locator("#deb-items").innerText();
    assert.equal(await page.locator("#deb-items .item").count(), 9);
    assert.match(items, /Enfrió la quemadura como le indicaron/);
    assert.match(items, /Contó con qué se quemó y dónde/);
    assert.ok(!/Siguió la RCP guiada|altavoz|DEA/.test(items));
    assert.equal(await page.locator("#ring-t").textContent(), "100");

    // El operador es ciego: ni la consigna ni el lugar entran a su prompt. La localidad sí.
    const prompts = promptsDelOperador(desde);
    assert.ok(prompts.length >= 5);
    assert.ok(!prompts.some(p => p.includes("En la cocina del club") || p.includes("Club Regatas, Avenida Alem 3288")), "la consigna y el lugar nunca le llegan al operador");
    assert.ok(prompts.every(p => p.startsWith("Sos operador/a del sistema de emergencias 107 en Santa Fe, Argentina, atendiendo una llamada real.")));
    assert.ok(prompts.some(p => /TIPO DE LLAMADA: Quemadura/.test(partir(p).variable) && /NO ES UN PARO, así que no hay RCP/.test(partir(p).variable)));
    assert.ok(prompts.every(p => partir(p).fijo === partir(prompts[0]).fijo), "la parte fija no cambia");
    // El evaluador sí recibe lo que sabía el alumno.
    const ev = promptsDelEvaluador(desde).pop();
    assert.match(ev, /CONSIGNA DEL INSTRUCTOR \(el alumno la conocía; el operador no\): En la cocina del club/);
    assert.match(ev, /UBICACIÓN DE LA CONSIGNA: Club Regatas, Avenida Alem 3288/);
    assert.match(ev, /TIPO DE CASO[^\n]*: Quemadura/);
    assert.match(ev, /HUBO PARO: no/);
    assert.ok(!/turno_respiracion/.test(ev));

    // El tablero: terminada, con el tipo de caso; la práctica guarda el caso y la clase.
    vivo = await api("/api/datos", { accion: "sala-vivo", codigo: salaNorte.codigo }, instNorte);
    const g = vivo.grupos.find(x => x.grupo === "Grupo 3");
    assert.equal(g.estado, "terminada");
    assert.equal(g.caso, "Quemadura");
    assert.equal(g.puntaje, 100);
    const p = vivo.practicas.find(x => x.alias === "Grupo 3" || x.alumno === "Grupo 3" || x.grupo === "Grupo 3") || vivo.practicas[0];
    assert.equal(p.casoId, "quemadura");
    assert.equal(p.paro, false);
    assert.ok(!p.tRcpMs, "sin paro no hay tiempo hasta la RCP");
    await page.context().close();
  });

  await prueba("lego con paro, en la misma clase: RCP guiada y el operador se queda en línea hasta que llega la ambulancia", async () => {
    const desde = geminiFalso.registro.length;
    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + salaNorte.codigo);
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.fill("#alias", "Grupo 5");
    await page.click("#btn-call");
    await llamar(page);
    await decir(page, "Estoy en el Club Regatas, Avenida Alem 3288, en el gimnasio del primer piso");
    await decir(page, "Un hombre se desplomó, no responde y no respira, hace como un ronquido");
    await decir(page, "¿Qué hago?");
    assert.match(await page.locator("#feed").innerText(), /altavoz/);
    await decir(page, "Ya estoy comprimiendo");
    // Ahora se queda callado: el operador lo alienta solo y, cuando llega la ambulancia, cierra.
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 40000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["));
    assert.match(feed, /ambulancia ya sale/i);
    assert.match(feed, /ambulancia ya está ahí/i);
    assert.match(feed, /Seguí comprimiendo/);
    assert.ok(!/Voy a cortar: volvé a llamar/.test(feed), "a quien reanima no se le corta antes del arribo");
    await verDevolucion(page);
    assert.match(await page.locator("#deb-caso").innerText(), /Llamada al 107 · Paro cardiorrespiratorio$/i);
    assert.match(await page.locator("#deb-meta").innerText(), /empezó la RCP a los/);
    // Rúbrica lego con paro: los diez de siempre.
    assert.equal(await page.locator("#deb-items .item").count(), 10);
    assert.match(await page.locator("#deb-items").innerText(), /Siguió la RCP guiada/);
    assert.equal(await page.locator("#ring-t").textContent(), "100");

    // La lista de RCP viaja en la parte variable (depende de la víctima), no en la fija.
    const prompts = promptsDelOperador(desde).map(partir);
    assert.ok(prompts.every(p => !/LA RCP GUIADA, una indicación por turno/.test(p.fijo)));
    assert.ok(prompts.some(p => /ES UN PARO/.test(p.variable) && /LA RCP GUIADA, una indicación por turno/.test(p.variable)));
    assert.ok(prompts.some(p => /Identificadores válidos: [^\n]*rcp/.test(p.variable)));
    const ev = promptsDelEvaluador(desde).pop();
    assert.match(ev, /siguió la RCP guiada por teléfono/);
    assert.match(ev, /turno_respiracion/);

    const vivo = await api("/api/datos", { accion: "sala-vivo", codigo: salaNorte.codigo }, instNorte);
    const g = vivo.grupos.find(x => x.grupo === "Grupo 5");
    assert.equal(g.estado, "terminada");
    assert.equal(g.caso, "Paro cardiorrespiratorio");
    assert.equal(g.puntaje, 100);
    const p = vivo.practicas.find(x => x.casoId === "paro");
    assert.equal(p.perfil, "lego");
    assert.equal(p.paro, true);
    assert.ok(p.tRcpMs > 0);
    await page.context().close();
  });

  await prueba("lego: empieza como un desmayo y pasa a paro en la misma llamada", async () => {
    const desde = geminiFalso.registro.length;
    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + salaNorte.codigo);
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.fill("#alias", "Grupo 8");
    await page.click("#btn-call");
    await llamar(page);
    await decir(page, "Estoy en el Club Regatas, Avenida Alem 3288, en el salón de la planta baja");
    await decir(page, "Mi papá se desmayó, ya abrió los ojos, me responde y respira bien");
    await decir(page, "Está pálido, pero me habla");
    // Hasta acá es un desmayo: primeros auxilios, sin RCP.
    let feed = await page.locator("#feed").innerText();
    assert.match(feed, /ambulancia ya sale/i);
    assert.match(feed, /Que se quede acostado boca arriba/);
    assert.ok(!/altavoz|empujar fuerte/i.test(feed));
    const n = promptsDelOperador(desde).length;
    // Se agrava: ahora es un paro, y el operador pasa a la RCP guiada en ese turno.
    await decir(page, "¡Se desvaneció de nuevo! Ahora no responde y no respira");
    feed = await page.locator("#feed").innerText();
    assert.match(feed, /altavoz|empujar fuerte/i, "con el paro arranca la RCP guiada");
    await decir(page, "Ya estoy comprimiendo");
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 40000 });
    feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["));
    assert.match(feed, /ambulancia ya está ahí/i);
    assert.match(feed, /Seguí comprimiendo/);
    assert.ok(!/Voy a cortar: volvé a llamar/.test(feed), "con el paro ya no corta antes del arribo");
    assert.equal((feed.match(/ambulancia ya sale/gi) || []).length, 1, "la ambulancia se anuncia una sola vez");

    await verDevolucion(page);
    assert.match(await page.locator("#deb-caso").innerText(), /Llamada al 107 · Paro cardiorrespiratorio · empezó como Desmayo$/i);
    assert.match(await page.locator("#deb-meta").innerText(), /empezó la RCP a los/);
    // La rúbrica se recalcula al final: la del paro, no la del desmayo.
    assert.equal(await page.locator("#deb-items .item").count(), 10);
    assert.match(await page.locator("#deb-items").innerText(), /Siguió la RCP guiada/);

    const prompts = promptsDelOperador(desde).map(partir);
    assert.ok(prompts.slice(0, n).some(p => /TIPO DE LLAMADA: Desmayo/.test(p.variable)));
    assert.ok(prompts.slice(0, n).every(p => !/TIPO DE LLAMADA: Paro/.test(p.variable)));
    assert.ok(prompts.slice(n).every(p => /TIPO DE LLAMADA: Paro cardiorrespiratorio/.test(p.variable)), "desde que se agrava, el caso es el paro");
    assert.ok(prompts.slice(n).every(p => /LA RCP GUIADA, una indicación por turno/.test(p.variable)));
    const ev = promptsDelEvaluador(desde).pop();
    assert.match(ev, /TIPO DE CASO[^\n]*: Paro cardiorrespiratorio \(empezó como Desmayo\)/);
    assert.match(ev, /VÍCTIMA: un adulto/);

    const practica = (await api("/api/datos", { accion: "sala-vivo", codigo: salaNorte.codigo }, instNorte)).practicas.find(x => x.casoId === "paro" && x.id !== undefined && /Grupo 8/.test(JSON.stringify(x)));
    assert.ok(practica, "la práctica quedó guardada como paro");
    const entera = (await api("/api/datos", { accion: "practica", id: practica.id }, instNorte)).practica;
    assert.equal(entera.caso.origen, "desmayo");
    assert.deepEqual(entera.caso.historia.map(h => h.id), ["desmayo", "paro"]);
    assert.equal(entera.clase.lugar, LUGAR);
    await page.context().close();
  });

  await prueba("una clase cerrada devuelve al alumno a la puerta con un mensaje claro", async () => {
    const cuenta = (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Sur" } }, ADMIN)).cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const sala = (await api("/api/datos", { accion: "sala-crear", nombre: "Martes" }, inst)).sala;
    await api("/api/datos", { accion: "sala-cerrar", codigo: sala.codigo }, inst);
    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + sala.codigo);
    await page.waitForSelector("#v-gate:not([hidden])");
    await page.waitForFunction(() => /clase ya terminó/.test(document.querySelector("#gate-err").textContent));
    await page.context().close();
  });

  await prueba("entrada: tres puertas; el instructor llega a su panel, administración rechaza su código y abre en Instructores con el de administrador", async () => {
    const page = await nuevaPagina();
    await page.goto(base + "/");
    await page.waitForSelector("#v-gate:not([hidden])");
    // Con base de datos se pide código: no hay práctica libre, y el panel figura activado.
    assert.equal(await page.locator("#gate-libre").isHidden(), true);
    assert.equal(await page.locator("#inst-activar").isHidden(), true);
    // La entrada es de Kalu Lab: el nombre de la institución lo ve cada alumno al entrar.
    assert.match(await page.locator(".marca").textContent(), /Kalu Lab/);
    assert.match(await page.locator("#v-gate .pie").innerText(), /producto de Kalu Lab/);
    assert.equal(await page.locator("#v-gate .puerta").count(), 3);
    assert.match(await page.locator("#v-gate").innerText(), /Alumnos/);
    assert.match(await page.locator("#v-gate").innerText(), /Instructores/);
    assert.equal(await page.locator("#v-gate .puerta.admin #admin-go").innerText(), "Entrar a la administración");

    // Puerta de instructores: un código cualquiera no abre; el del instructor abre SU panel.
    await page.fill("#inst-in", "NO-ES-UN-CODIGO");
    await page.click("#inst-go");
    await page.waitForFunction(() => /no abre el panel/.test(document.querySelector("#inst-err").textContent));
    await page.fill("#inst-in", cursoNorte.codigoInstructor);
    await page.click("#inst-go");
    await page.waitForURL(u => new URL(u).pathname === "/panel");
    await page.waitForSelector("#v-panel:not([hidden])");
    assert.match(await page.locator("#p-rol").textContent(), /Instructor/);
    assert.equal(await page.locator("#p-cuenta").textContent(), "Curso RCP Norte");
    assert.equal(await page.locator('#tabs button[data-t="clase"]').getAttribute("aria-selected"), "true");
    assert.equal(await page.locator('#tabs button[data-t="cuentas"]').isVisible(), false);
    assert.equal(await page.locator('#tabs button[data-t="escenarios"]').count(), 0, "ya no hay pestaña Escenarios");

    // Puerta de administración: el código de un instructor, el de alumnos y uno inventado no entran.
    const adm = await nuevaPagina();
    await adm.goto(base + "/");
    await adm.waitForSelector("#v-gate:not([hidden])");
    for (const cod of [cursoNorte.codigoInstructor, cursoNorte.codigoAlumnos, "NADA-QUE-VER"]) {
      await adm.fill("#admin-in", cod);
      await adm.click("#admin-go");
      await adm.waitForFunction(() => /no es el de administración/.test(document.querySelector("#admin-err").textContent));
      assert.equal(new URL(adm.url()).pathname, "/", "se queda en la entrada");
      assert.equal(await adm.evaluate(() => sessionStorage.getItem("sim107_panel")), null, "un código rechazado no queda guardado");
      await adm.evaluate(() => { document.querySelector("#admin-err").textContent = ""; });
    }
    // Con el de administrador entra, y el panel abre en Instructores.
    await adm.fill("#admin-in", "ADMIN-DE-PRUEBA-99");
    await adm.click("#admin-go");
    await adm.waitForURL(u => new URL(u).pathname === "/panel");
    await adm.waitForSelector("#v-panel:not([hidden])");
    assert.match(await adm.locator("#p-rol").textContent(), /Administrador/);
    assert.equal(await adm.locator('#tabs button[data-t="cuentas"]').getAttribute("aria-selected"), "true", "desde la puerta de administración abre en Instructores");
    assert.equal(await adm.locator("#t-cuentas").isVisible(), true);
    await adm.waitForFunction(() => /Curso RCP Norte/.test(document.querySelector("#cl-tabla").textContent));

    // La puerta de instructores sigue aceptando el código de administrador, y ahí abre en la clase.
    const porInst = await nuevaPagina();
    await porInst.goto(base + "/");
    await porInst.waitForSelector("#v-gate:not([hidden])");
    await porInst.fill("#inst-in", "ADMIN-DE-PRUEBA-99");
    await porInst.click("#inst-go");
    await porInst.waitForURL(u => new URL(u).pathname === "/panel");
    await porInst.waitForSelector("#v-panel:not([hidden])");
    assert.match(await porInst.locator("#p-rol").textContent(), /Administrador/);
    assert.equal(await porInst.locator('#tabs button[data-t="clase"]').getAttribute("aria-selected"), "true");

    // Un alumno entra a practicar desde la misma entrada, con el código de su clase.
    const inst = { "x-panel": (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Norte" } }, ADMIN)).cuenta.codigoInstructor };
    const sala = (await api("/api/datos", { accion: "sala-crear", nombre: "Jueves" }, inst)).sala;
    const alumno = await nuevaPagina();
    await alumno.goto(base + "/");
    await alumno.waitForSelector("#v-gate:not([hidden])");
    await alumno.fill("#gate-in", sala.codigo.toLowerCase());
    await alumno.click("#gate-go");
    await alumno.waitForSelector("#v-setup:not([hidden])");
    assert.match(await alumno.locator("#cuenta-info").innerText(), /Jueves/);
    assert.equal(await alumno.locator("#perfil").isVisible(), true, "si la clase no fija el perfil, lo elige cada grupo");
    assert.equal(await alumno.locator("#cambiar-codigo").textContent(), "Cambiar de código");
    await alumno.click("#cambiar-codigo");
    await alumno.waitForSelector("#v-gate:not([hidden])");

    // La página para el dueño revisa lo que está activado.
    const activar = await nuevaPagina();
    await activar.goto(base + "/activar");
    await activar.waitForSelector("#listo:not([hidden])");
    assert.equal(await activar.locator(".fila.lista").count(), 3);

    // El link que arma el panel (?c=CÓDIGO) deja entrar directo, y el código no queda a la
    // vista en la dirección.
    const conLink = await nuevaPagina();
    await conLink.goto(base + "/?c=" + encodeURIComponent(" " + sala.codigo.toLowerCase()));
    await conLink.waitForSelector("#v-setup:not([hidden])");
    assert.match(await conLink.locator("#cuenta-info").innerText(), /Jueves/);
    assert.equal(new URL(conLink.url()).search, "", "el código no queda a la vista en la dirección");
    for (const p of [page, adm, porInst, alumno, activar, conLink]) await p.context().close();
  });

  await prueba("panel: clase en vivo con el caso de cada grupo, prácticas por caso, revisión a ciegas, acuerdo, planillas, altas y localidad", async () => {
    const page = await nuevaPagina();
    page.on("dialog", d => d.accept());
    await page.goto(base + "/panel");
    await page.fill("#login-cod", "no-es-un-codigo");
    await page.click("#login-go");
    await page.waitForFunction(() => /no abre el panel/.test(document.querySelector("#login-err").textContent));
    await page.fill("#login-cod", "ADMIN-DE-PRUEBA-99");
    await page.click("#login-go");
    await page.waitForSelector("#v-panel:not([hidden])");
    assert.equal(await page.locator('#tabs button[data-t="cuentas"]').textContent(), "Instructores");
    assert.equal(await page.locator('#tabs button[data-t="cuentas"]').isVisible(), true, "el administrador ve la pestaña de instructores");
    assert.equal(await page.locator('#tabs button[data-t="escenarios"]').count(), 0, "la pestaña Escenarios no existe más");
    assert.equal(await page.locator("#t-escenarios, #cn-escenarios, #cv-guion").count(), 0);
    assert.ok(!/Escenarios/.test(await page.locator("#tabs").innerText()));

    // Instructores: la meta del piloto arriba y una fila por cuenta, con su uso.
    await page.click('#tabs button[data-t="cuentas"]');
    await page.waitForFunction(() => /Curso RCP Norte/.test(document.querySelector("#cl-tabla").textContent));
    assert.equal(await page.locator("#cl-tiles .tile").count(), 4);
    assert.match(await page.locator("#cl-tiles").textContent(), /Meta del piloto/);
    assert.match(await page.locator("#cl-tabla").textContent(), /tu cuenta/);
    const [planilla] = await Promise.all([page.waitForEvent("download"), page.click("#cl-csv")]);
    const csvCuentas = await leerDescarga(planilla);
    assert.match(csvCuentas, /dias_de_clase/);
    assert.match(csvCuentas, /Curso RCP Norte/);

    // Alta de un instructor, con su localidad: salen sus códigos y el mensaje de bienvenida.
    await page.click("#cl-nueva");
    assert.equal(await page.locator("#dc-codigos").isVisible(), false, "una cuenta nueva no tiene códigos hasta guardarla");
    await page.fill("#dc-nombre", "Instituto del Litoral");
    await page.fill("#dc-zona", "Paraná");
    await page.click("#dc-guardar");
    await page.waitForSelector("#dc-bienvenida:not([hidden])");
    assert.equal(await page.locator("#dc-codigos").isVisible(), true);
    const bienvenida = await page.locator("#dc-msj").textContent();
    assert.match(bienvenida, /\/panel/);
    assert.match(bienvenida, /INS-[A-Z0-9]{10}/);
    assert.match(bienvenida, /\/\?c=INS-|\/\?c=[A-Z]{3}-/);
    // Cambiarle el código de instructor: el mensaje sale con el nuevo.
    const viejo = bienvenida.match(/INS-[A-Z0-9]{10}/)[0];
    await page.click("#dc-regen-inst");
    await page.waitForFunction(v => /INS-[A-Z0-9]{10}/.test(document.querySelector("#dc-inst").textContent) && !document.querySelector("#dc-msj").textContent.includes(v), viejo);
    await page.click("#dc-cerrar");
    // La localidad quedó en la cuenta, y es la que conoce el operador cuando atiende a sus alumnos.
    const litoral = (await api("/api/datos", { accion: "cuentas" }, ADMIN)).cuentas.find(c => c.nombre === "Instituto del Litoral");
    assert.equal(litoral.zona, "Paraná");
    const acceso = await api("/api/chat", { modo: "verificar" }, { "x-codigo": litoral.codigoAlumnos });
    assert.equal(acceso.zona, "Paraná");

    // La ficha del curso de las pruebas de clase: cómo la usa, sus códigos, los casos
    // que practicó, y de ahí a su panel.
    await page.locator("#cl-tabla tr", { hasText: "Curso RCP Norte" }).click();
    await page.waitForSelector("#dlg-cuenta[open] #dc-uso:not([hidden])");
    assert.equal(await page.locator("#dc-meses .mes").count(), 6, "una columna por mes, seis meses");
    assert.match(await page.locator("#dc-tiles").textContent(), /Días de clase/);
    assert.match(await page.locator("#dc-tiles").textContent(), /Hasta dar la ubicación/);
    assert.match(await page.locator("#dc-casos").innerText(), /Paro cardiorrespiratorio/);
    assert.match(await page.locator("#dc-casos").innerText(), /Quemadura/);
    await page.click("#dc-ver-inst");
    assert.match(await page.locator("#dc-inst").textContent(), /^INS-[A-Z0-9]{10}$/);
    await page.click("#dc-ver-panel");
    await page.waitForFunction(() => document.querySelector("#p-cuenta").textContent === "Curso RCP Norte");
    await page.waitForFunction(() => /Grupo 3/.test(document.querySelector("#al-tabla").textContent));
    assert.notEqual(await page.locator("#p-cambiar").inputValue(), "principal", "el selector queda en la cuenta que se mira");

    // Clase en vivo: la clase sigue abierta, con su consigna y el caso de cada grupo.
    await page.click('#tabs button[data-t="clase"]');
    await page.waitForSelector("#clase-viva:not([hidden])");
    await page.waitForFunction(() => /Grupo 3/.test(document.querySelector("#cv-grupos").textContent));
    const grupos = await page.locator("#cv-grupos").innerText();
    assert.match(grupos, /terminada/);
    assert.match(grupos, /Quemadura/);
    assert.match(grupos, /Paro cardiorrespiratorio/);
    assert.equal(await page.locator("#cv-consigna-wrap").isVisible(), true);
    assert.match(await page.locator("#cv-consigna").innerText(), /En la cocina del club/);
    assert.match(await page.locator("#cv-consigna").innerText(), /Club Regatas, Avenida Alem 3288/);
    assert.ok(await page.locator("#cv-barras .barra").count() >= 10, "una barra por criterio de las rúbricas que se usaron");
    assert.match(await page.locator("#cv-casos").innerText(), /Paro cardiorrespiratorio/);
    assert.match(await page.locator("#cv-casos").innerText(), /Quemadura/);

    // Prácticas: columna y filtro por tipo de caso.
    await page.click('#tabs button[data-t="practicas"]');
    await page.waitForSelector("#pr-tabla tr.clic");
    assert.match(await page.locator("#pr-tabla tr").first().innerText(), /Caso/);
    assert.equal(await page.locator("#pr-tabla tr.clic").count(), 3);
    const opciones = await page.locator("#pr-caso option").allInnerTexts();
    assert.ok(opciones.some(o => /Quemadura/.test(o)) && opciones.some(o => /Paro cardiorrespiratorio/.test(o)), "el filtro ofrece los casos del período: " + opciones.join(" | "));
    assert.ok(!opciones.some(o => /Escenarios anteriores/.test(o)), "sin prácticas viejas no se ofrece esa opción");
    await page.selectOption("#pr-caso", "quemadura");
    await page.waitForFunction(() => document.querySelectorAll("#pr-tabla tr.clic").length === 1);
    assert.match(await page.locator("#pr-tabla tr.clic").innerText(), /Grupo 3/);
    assert.match(await page.locator("#pr-tabla tr.clic").innerText(), /Quemadura/);
    // La planilla respeta el filtro y lleva el caso.
    const [soloQuemadura] = await Promise.all([page.waitForEvent("download"), page.click("#pr-csv")]);
    const csvFiltrado = await leerDescarga(soloQuemadura);
    assert.match(csvFiltrado.split("\n")[0], /,caso,caso_id,/);
    assert.match(csvFiltrado, /Quemadura,quemadura/);
    assert.ok(!/Grupo 5/.test(csvFiltrado), "el CSV respeta el filtro por caso");
    await page.selectOption("#pr-caso", "");
    await page.waitForFunction(() => document.querySelectorAll("#pr-tabla tr.clic").length === 3);

    // Abrir la del paro, marcar que no averiguó la respiración (crítico) y guardar.
    await page.locator("#pr-tabla tr.clic", { hasText: "Grupo 5" }).click();
    await page.waitForSelector("#dlg[open]");
    assert.equal(await page.locator("#d-crit select").count(), 10);
    assert.match(await page.locator("#d-tr").textContent(), /ALUMNO #1: Estoy en el Club Regatas/);
    // Revisión a ciegas: lo de la IA está oculto y los criterios arrancan sin marcar. Lo que
    // sabía el alumno (el caso, la consigna y el lugar de la clase) sí se ve.
    assert.equal(await page.locator("#d-ciega").isVisible(), true);
    assert.equal(await page.locator("#d-crit .ia").first().isVisible(), false, "no se ve el juicio de la IA antes de revisar");
    const fichaCaso = await page.locator("#d-caso").innerText();
    assert.match(fichaCaso, /Paro cardiorrespiratorio/);
    assert.match(fichaCaso, /En la cocina del club/);
    assert.match(fichaCaso, /Club Regatas, Avenida Alem 3288/);
    await page.click("#d-guardar");
    await page.waitForFunction(() => /Te falta marcar 10 criterios/.test(document.querySelector("#d-estado").textContent));
    for (const sel of await page.locator("#d-crit select").all()) await sel.selectOption("logrado");
    await page.selectOption('#d-crit select[data-id="respiracion"]', "falto");
    await page.click("#d-guardar");
    await page.waitForFunction(() => /tu puntaje es 40/.test(document.querySelector("#d-estado").textContent));
    assert.equal(await page.locator("#d-crit .ia").first().isVisible(), true, "después de guardar se puede comparar con la IA");
    await page.click("#d-cerrar");
    await page.waitForFunction(() => /revisada/.test(document.querySelector("#pr-tabla").textContent));
    // La que escaló dice de cuál venía.
    await page.locator("#pr-tabla tr.clic", { hasText: "Grupo 8" }).click();
    await page.waitForSelector("#dlg[open]");
    assert.match(await page.locator("#d-caso").innerText(), /Desmayo/);
    await page.click("#d-cerrar");

    // Planilla: una fila por práctica, una columna por criterio, y el caso.
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#pr-csv")]);
    const csv = await leerDescarga(descarga);
    assert.match(csv, /ia_respiracion/);
    assert.match(csv, /ia_enfriamiento/, "los criterios propios de un caso tienen su columna");
    assert.match(csv, /Grupo 3/);
    assert.match(csv, /Paro cardiorrespiratorio,paro/);
    assert.match(csv, /,40,/, "lleva el puntaje del instructor");
    assert.ok(!/\bescenario\b/.test(csv.split("\n")[0]), "ya no hay columna escenario");

    // Calidad: 10 pares, 9 coinciden.
    await page.click('#tabs button[data-t="calidad"]');
    await page.waitForFunction(() => /Revisadas a ciegas/.test(document.querySelector("#ca-tiles").textContent));
    assert.match(await page.locator("#ca-tiles").innerText(), /90% de coincidencia exacta/);
    assert.ok(await page.locator("#ca-tabla tr").count() > 1);

    // Alumnos: el grupo, con su evolución.
    await page.click('#tabs button[data-t="alumnos"]');
    await page.waitForFunction(() => /Grupo 3/.test(document.querySelector("#al-tabla").textContent));

    // Cerrar la clase: queda a la vista, cerrada, con su resumen para el debriefing.
    await page.click('#tabs button[data-t="clase"]');
    await page.waitForSelector("#clase-viva:not([hidden])");
    const barras = await page.locator("#cv-barras .barra").count();
    await page.click("#cv-cerrar");
    await page.waitForSelector("#cv-volver:not([hidden])");
    assert.equal(await page.locator("#cv-barras .barra").count(), barras, "el resumen sigue a la vista después de cerrar");
    assert.equal(await page.locator("#cv-cerrar").isVisible(), false);

    // Volver y abrir otra desde el panel, con consigna, lugar y localidad.
    await page.click("#cv-volver");
    await page.waitForSelector("#clase-nueva:not([hidden])");
    assert.match(await page.locator("#clase-nueva").innerText(), /nunca el operador/i);
    await page.fill("#cn-nombre", "Clase de repaso");
    await page.fill("#cn-consigna", "En la pileta, un nene de 6 años estuvo debajo del agua.");
    await page.fill("#cn-lugar", "Pileta municipal, Bv. Gálvez 1150");
    await page.fill("#cn-zona", "Santo Tomé");
    await page.click("#cn-abrir");
    await page.waitForSelector("#clase-viva:not([hidden])");
    await page.waitForFunction(() => /^[2-9A-Z]{6}$/.test(document.querySelector("#cv-codigo").textContent));
    assert.equal(await page.locator("#cv-cerrar").isVisible(), true, "la clase nueva vuelve a tener su botón de cerrar");
    assert.match(await page.locator("#cv-consigna").innerText(), /un nene de 6 años/);
    assert.match(await page.locator("#cv-consigna").innerText(), /Bv\. Gálvez 1150/);
    assert.match(await page.locator("#clase-anteriores").innerText(), /RCP sábado/);
    // El alumno que entra a esa clase ve la consigna, y el operador conoce esa localidad.
    const repaso = await api("/api/chat", { modo: "verificar" }, { "x-codigo": await page.locator("#cv-codigo").textContent() });
    assert.equal(repaso.sala.consigna, "En la pileta, un nene de 6 años estuvo debajo del agua.");
    assert.equal(repaso.sala.lugar, "Pileta municipal, Bv. Gálvez 1150");
    assert.equal(repaso.zona, "Santo Tomé");
    // El resumen de una clase anterior se puede volver a ver.
    await page.locator("#clase-anteriores tr", { hasText: "RCP sábado" }).locator("button", { hasText: "ver resumen" }).click();
    await page.waitForFunction(() => /RCP sábado/.test(document.querySelector("#cv-nombre").textContent));
    assert.equal(await page.locator("#cv-barras .barra").count(), barras);
    assert.match(await page.locator("#cv-casos").innerText(), /Quemadura/);

    // Uso y contactos (sólo administrador).
    await api("/api/datos", { accion: "contacto", nombre: "Marta Instructora", email: "marta@example.com", rol: "Instructora de RCP", mensaje: "Quiero probarlo" });
    await page.click('#tabs button[data-t="contactos"]');
    await page.waitForFunction(() => /Marta Instructora/.test(document.querySelector("#co-tabla").textContent));
    // Pedido de supresión: se borra desde el panel, con confirmación.
    await page.locator("#co-tabla tr", { hasText: "Marta Instructora" }).locator("button", { hasText: "Borrar" }).click();
    await page.waitForFunction(() => !/Marta Instructora/.test(document.querySelector("#co-tabla").textContent));
    assert.ok(!(await api("/api/datos", { accion: "contactos" }, ADMIN)).contactos.some(c => c.nombre === "Marta Instructora"));
    await page.click('#tabs button[data-t="uso"]');
    await page.waitForSelector("#us-cols .c");
    assert.equal(await page.locator("#us-cols .c").count(), 30);
    assert.match(await page.locator("#us-tabla").innerText(), /gemini/);
    await page.context().close();

    // El instructor, con su propio código, ve sólo su cuenta y no las pestañas del administrador.
    const inst = await nuevaPagina();
    await inst.goto(base + "/panel");
    await inst.fill("#login-cod", cursoNorte.codigoInstructor);
    await inst.click("#login-go");
    await inst.waitForSelector("#v-panel:not([hidden])");
    assert.equal(await inst.locator('#tabs button[data-t="cuentas"]').isVisible(), false);
    assert.equal(await inst.locator("#p-cambiar-wrap").isVisible(), false);
    assert.equal(await inst.locator("#p-cuenta").textContent(), "Curso RCP Norte");
    await inst.click('#tabs button[data-t="cuenta"]');
    await inst.waitForFunction(c => document.querySelector("#cu-alumnos").textContent === c, cursoNorte.codigoAlumnos);
    // Sus propios números, los mismos que ve el administrador en la ficha.
    assert.equal(await inst.locator("#cu-meses .mes").count(), 6);
    assert.match(await inst.locator("#cu-tiles").textContent(), /Días de clase/);
    assert.match(await inst.locator("#cu-tiles").textContent(), /Vencimiento/);
    assert.match(await inst.locator("#cu-casos").innerText(), /Quemadura/);
    await inst.context().close();
  });

  await prueba("páginas públicas: presentación con formulario, fundamentos con la rúbrica de protocolos.js, términos, privacidad y la página de Kalu Lab", async () => {
    const page = await nuevaPagina();
    await page.goto(base + "/instructores");
    await page.waitForSelector("#planes-lista .plan", { state: "attached" });
    assert.equal(await page.locator("[data-sin-precios]").isVisible(), true, "sin MOSTRAR_PRECIOS se ve la etapa piloto");
    await page.fill("#form-contacto [name=nombre]", "Laura Instructora");
    await page.click("#form-contacto button[type=submit]");
    await page.waitForFunction(() => /mail o un WhatsApp/.test(document.querySelector("#form-estado").textContent));
    await page.fill("#form-contacto [name=email]", "laura@example.com");
    await page.click("#form-contacto button[type=submit]");
    await page.waitForFunction(() => /Listo, Laura/.test(document.querySelector("#form-estado").textContent));
    const leads = (await api("/api/datos", { accion: "contactos" }, ADMIN)).contactos;
    assert.ok(leads.some(l => l.nombre === "Laura Instructora" && l.origen === "instructores"));

    // Fundamentos arma la tabla con rubrica() de protocolos.js: perfil, tipo de caso y paro.
    const pedidos = [];
    page.on("request", r => pedidos.push(new URL(r.url()).pathname));
    await page.goto(base + "/fundamentos");
    await page.waitForSelector("table.rub");
    assert.ok(pedidos.includes("/protocolos.js"), "fundamentos carga protocolos.js");
    assert.ok(!pedidos.includes("/index.html") && !pedidos.includes("/"), "y ya no lee index.html");
    const filas = () => page.locator("#tablas-rubrica table.rub tr:has(td)").count();
    const tabla = () => page.locator("#tablas-rubrica").innerText();
    assert.equal(await page.locator("#sel-caso option").count(), 18, "un tipo de caso por cada uno de protocolos.js");
    assert.match(await tabla(), /Ubicación exacta/);
    assert.equal(await page.locator("#lab-paro").isVisible(), false, "con guardavidas no se elige con o sin paro");
    await page.selectOption("#sel-caso", "ahogamiento");
    assert.equal(await filas(), 13);
    assert.match(await tabla(), /sumersión/i);
    await page.selectOption("#sel-caso", "hemorragia");
    assert.equal(await filas(), 12);
    assert.match(await tabla(), /De dónde sangra y cuánto/);
    await page.selectOption("#sel-perfil", "lego");
    await page.selectOption("#sel-caso", "quemadura");
    assert.equal(await page.locator("#lab-paro").isVisible(), true);
    await page.selectOption("#sel-paro", "no");
    assert.equal(await filas(), 9);
    assert.match(await tabla(), /Enfrió la quemadura/);
    await page.selectOption("#sel-paro", "si");
    assert.equal(await filas(), 10);
    assert.match(await tabla(), /RCP guiada/);
    await page.selectOption("#sel-caso", "paro");
    assert.equal(await page.locator("#sel-paro").inputValue(), "si");
    assert.equal(await page.locator("#sel-paro").isDisabled(), true, "con el caso paro queda fijo en con paro");
    assert.equal(await filas(), 10);
    assert.ok(await page.locator(".refs li").count() >= 30);
    assert.match(await page.locator("body").innerText(), /El operador se adapta al caso/);

    for (const p of ["terminos", "privacidad"]) {
      await page.goto(base + "/" + p);
      await page.waitForFunction(() => document.querySelector("[data-titular]").textContent.length > 0);
      // Sin TITULAR_NOMBRE en el entorno, la página lo dice en vez de inventarlo.
      assert.match(await page.locator("[data-titular=nombre]").first().textContent(), /falta cargar TITULAR_NOMBRE/);
      assert.match(await page.locator("body").innerText(), /domicilio/);
    }
    // El pie de las páginas públicas lleva a la página de la empresa.
    assert.equal(await page.locator(".pie .legal a").first().getAttribute("href"), "https://www.kalulab.store/");

    // La página de Kalu Lab (otro proyecto de Vercel, carpeta kalulab/) elige entre los
    // proyectos: el simulador con su acceso de instructores, y el portal de alumnos.
    await page.goto(base + "/kalulab/index.html");
    assert.equal(await page.locator("#ir-simulador").getAttribute("href"), "https://simulador.kalulab.store/");
    assert.equal(await page.locator("#acceso-panel").getAttribute("href"), "https://simulador.kalulab.store/panel");
    assert.equal(await page.locator("#ir-portal").getAttribute("href"), "https://portal.kalulab.store/");
    assert.match(await page.locator(".proyecto.portal").innerText(), /Sumar Salud/);
    assert.equal(await page.locator(".proximamente a").count(), 0, "el proyecto que viene no lleva a ningún lado");
    const enlacesSueltos = await page.locator("a[href]").evaluateAll(as => as.map(a => a.getAttribute("href")).filter(h => !/^(https:\/\/(simulador|portal)\.kalulab\.store\/|mailto:info@kalulab\.store$)/.test(h)));
    assert.deepEqual(enlacesSueltos, [], "todos los enlaces van al simulador, al portal o al mail");
    // Un link de clase viejo (www.kalulab.store/?c=…) sigue llegando a la clase en el simulador.
    await page.route("https://simulador.kalulab.store/**", r => r.fulfill({ contentType: "text/html", body: "simulador" }));
    await page.goto(base + "/kalulab/index.html?c=CLASE-1");
    await page.waitForURL("https://simulador.kalulab.store/**");
    assert.equal(page.url(), "https://simulador.kalulab.store/?c=CLASE-1");
    // La app del simulador instalada cuando vivía en www.kalulab.store abre el simulador.
    const instalada = await page.context().newPage();
    await instalada.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /standalone/.test(q) ? { matches: true, media: q } : mm(q); });
    await instalada.route("https://simulador.kalulab.store/**", r => r.fulfill({ contentType: "text/html", body: "simulador" }));
    await instalada.goto(base + "/kalulab/index.html");
    await instalada.waitForURL("https://simulador.kalulab.store/**");
    assert.equal(instalada.url(), "https://simulador.kalulab.store/");
    await instalada.close();
    await page.goto(base + "/kalulab/404.html");
    assert.match(await page.locator("h1").textContent(), /no existe/);
    await page.context().close();
  });

  assert.deepEqual(errores, [], "sin errores de JavaScript en la página");

  // Ninguna respuesta del operador de mentira salió sin sus marcas, y ninguna llegó a la
  // pantalla (se comprobó llamada por llamada). Acá, lo que queda guardado: ninguna
  // transcripción del registro lleva una marca.
  const guardadas = [...redis.datos.entries()].filter(([k]) => k.startsWith("s107:p:")).map(([, e]) => typeof e.v === "string" ? e.v : JSON.stringify([...e.v]));
  assert.ok(guardadas.length >= 5, "las prácticas quedaron en el registro");
  assert.ok(!guardadas.some(t => t.includes("[[")), "ninguna marca [[...]] queda en una transcripción guardada");

  // El prompt del operador no se recorta nunca: tiene que quedar lejos del tope del servidor.
  // Lo que se midió en las llamadas de arriba, y además el peor caso armado a mano: la parte
  // fija más larga (la de cada perfil) con el bloque variable más largo que se vio.
  const todos = promptsDelOperador(0).map(partir);
  const largos = todos.map(p => p.fijo.length + p.variable.length);
  const fijoMax = Math.max(...todos.map(p => p.fijo.length)), variableMax = Math.max(...todos.map(p => p.variable.length));
  console.log("Prompt del operador: máximo " + Math.max(...largos) + " caracteres en " + largos.length + " turnos (parte fija hasta " + fijoMax
    + ", variable hasta " + variableMax + "; tope del servidor: 40.000).");
  assert.ok(todos.some(p => /TIPO DE LLAMADA: Ahogamiento/.test(p.variable)), "se midió el caso de bloque más largo (ahogamiento, guardavidas)");
  assert.ok(Math.max(...largos) < 30000, "el prompt se acerca al tope: revisar el largo o subir TOPE_PROMPT en api/chat.js");
  assert.ok(fijoMax + variableMax < 32000, "el peor caso (parte fija más larga + variable más larga) queda lejos del tope");
  console.log("\n" + ok + " pruebas de punta a punta pasaron. Comandos a Redis: " + redis.llamadas);
} finally {
  await navegador.close();
  servidor.close();
}
