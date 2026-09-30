// Pruebas de punta a punta en un navegador real (Chromium con Playwright), con el
// servidor de prueba y un operador de mentira que sigue el ESTADO DE LA LLAMADA.
//
//   NODE_PATH=$(npm root -g) node pruebas/ui.test.mjs
//
// Se prueba en modo texto (sin reconocimiento de voz), que es el mismo flujo de turnos.
// Voz real, ruido y latencia percibida no se pueden probar así: eso va en el celular.
import { createRequire } from "node:module";
import assert from "node:assert/strict";

process.env.RAPIDO = "1";
process.env.CON_BASE = "1";
process.env.CODIGO_ADMIN = "ADMIN-DE-PRUEBA-99";
process.env.PUERTO = process.env.PUERTO || "8123";
const { default: servidor, redis } = await import("./servidor.mjs");
const base = "http://localhost:" + process.env.PUERTO;

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

async function nuevaPagina() {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.on("pageerror", e => { console.error("ERROR EN LA PÁGINA:", e.message); errores.push(e.message); });
  await page.addInitScript(falsos);
  return page;
}
const errores = [];

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

let ok = 0;
async function prueba(nombre, f) {
  process.stdout.write("· " + nombre + " … ");
  await f();
  ok++;
  console.log("ok");
}

try {
  await prueba("guardavidas: teclado, interrogatorio, cierre del operador y devolución", async () => {
    // Sin código: con base configurada, pide código. Se entra con el del administrador.
    const page = await nuevaPagina();
    await page.goto(base + "/");
    await page.waitForSelector("#v-gate:not([hidden])");
    await page.fill("#gate-in", "codigo-que-no-existe");
    await page.click("#gate-go");
    await page.waitForFunction(() => /no es el correcto/.test(document.querySelector("#gate-err").textContent));
    await page.fill("#gate-in", "ADMIN-DE-PRUEBA-99");
    await page.click("#gate-go");
    await page.waitForSelector("#v-setup:not([hidden])");
    assert.equal(await page.locator('.card[data-id="lego-gimnasio"]').count(), 0, "los de lego no se ven en perfil guardavidas");
    assert.ok(await page.locator(".card").count() >= 6);

    await page.click('.card[data-id="ahogamiento-puro"]');
    await page.click("#btn-brief");
    await page.waitForSelector("#v-brief:not([hidden])");
    await page.click("#btn-call");
    await marcar(page, "911");
    await page.waitForFunction(() => /107/.test(document.querySelector("#dial-aviso").textContent));
    await marcar(page, "107");
    await page.waitForSelector("#v-call:not([hidden])");
    await page.waitForSelector("#typer:not([hidden])", { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll(".msg.op:not(.live)").length >= 1, null, { timeout: 10000 });

    await decir(page, "Estoy en la Costanera Este, puesto 2, entrá por la bajada frente al camping");
    await decir(page, "Saqué del agua a un hombre de 35 años, no responde y no respira");
    await decir(page, "Estamos comprimiendo y ventilando, tengo el DEA y el bolso, te espera mi compañero en la bajada");
    await decir(page, "Soy Luka, guardavidas del puesto 2");
    for (let i = 0; i < 4; i++) if ((await decir(page, "Seguimos con la RCP")) === false) break;
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 15000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["), "ninguna marca [[...]] se filtra a la pantalla");
    assert.match(feed, /El operador cortó la llamada/);
    await page.click("#ver-informe");
    await page.waitForSelector("#deb-body:not([hidden])", { timeout: 15000 });
    assert.equal(await page.locator("#ring-t").textContent(), "100");
    assert.match(await page.locator("#deb-meta").innerText(), /ubicación a los/);
    assert.match(await page.locator("#deb-saved").innerText(), /Guardado en el registro/);
    // La rúbrica de ahogamiento suma sus criterios propios a los globales.
    const criterios = await page.locator("#deb-items .item").count();
    assert.equal(criterios, 10 + 3);
    await page.context().close();
  });

  await prueba("lego en una clase: entra por link, RCP guiada hasta que llega la ambulancia, y el tablero lo ve", async () => {
    const admin = { "x-panel": "ADMIN-DE-PRUEBA-99" };
    const cuenta = (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Curso RCP Norte", plan: "instructor" } }, admin)).cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const sala = (await api("/api/datos", { accion: "sala-crear", nombre: "RCP sábado", perfil: "lego", horas: 2 }, inst)).sala;

    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + sala.codigo);
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.waitForFunction(() => /RCP sábado/.test(document.querySelector("#cuenta-info").textContent));
    assert.equal(await page.locator("#perfil").isHidden(), true, "la clase fija el perfil");
    assert.equal(await page.locator('.card[data-id="ahogamiento-puro"]').count(), 0);
    await page.click('.card[data-id="lego-gimnasio"]');
    await page.click("#btn-brief");
    // En clase, el nombre del grupo es obligatorio.
    await page.waitForFunction(() => /nombre de tu grupo/.test(document.querySelector("#setup-note").textContent));
    await page.fill("#alias", "Grupo 3");
    await page.click("#btn-brief");
    await page.waitForSelector("#v-brief:not([hidden])");
    assert.match(await page.locator("#b-rol").innerText(), /persona común/);
    await page.click("#btn-call");
    await marcar(page, "107");
    await page.waitForSelector("#typer:not([hidden])", { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll(".msg.op:not(.live)").length >= 1, null, { timeout: 10000 });

    // El tablero ve al grupo en llamada.
    let vivo = await api("/api/datos", { accion: "sala-vivo", codigo: sala.codigo }, inst);
    assert.equal(vivo.grupos.find(g => g.grupo === "Grupo 3").estado, "en llamada");

    await decir(page, "Estoy en el gimnasio de San Martín 2850, primer piso");
    await decir(page, "Un hombre se desplomó, no responde y no respira, hace como un ronquido");
    await decir(page, "¿Qué hago?");
    assert.match(await page.locator("#feed").innerText(), /altavoz/);
    await decir(page, "Ya estoy comprimiendo");
    // Ahora se queda callado: el operador lo alienta solo y, cuando llega la ambulancia, cierra.
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 40000 });
    const feed = await page.locator("#feed").innerText();
    assert.ok(!feed.includes("[["));
    assert.match(feed, /ambulancia ya está ahí/i);
    await page.click("#ver-informe");
    await page.waitForSelector("#deb-body:not([hidden])", { timeout: 15000 });
    assert.match(await page.locator("#deb-meta").innerText(), /empezó la RCP a los/);
    // Rúbrica lego: 10 criterios, sin los del guardavidas.
    assert.equal(await page.locator("#deb-items .item").count(), 10);
    assert.match(await page.locator("#deb-items").innerText(), /Siguió la RCP guiada/);

    vivo = await api("/api/datos", { accion: "sala-vivo", codigo: sala.codigo }, inst);
    const g = vivo.grupos.find(x => x.grupo === "Grupo 3");
    assert.equal(g.estado, "terminada");
    assert.equal(g.puntaje, 100);
    assert.equal(vivo.practicas[0].perfil, "lego");
    assert.ok(vivo.practicas[0].tRcpMs > 0);
    await page.context().close();
  });

  await prueba("una clase cerrada devuelve al alumno a la puerta con un mensaje claro", async () => {
    const admin = { "x-panel": "ADMIN-DE-PRUEBA-99" };
    const cuenta = (await api("/api/datos", { accion: "cuenta-guardar", cuenta: { nombre: "Escuela Sur" } }, admin)).cuenta;
    const inst = { "x-panel": cuenta.codigoInstructor };
    const sala = (await api("/api/datos", { accion: "sala-crear", nombre: "Martes" }, inst)).sala;
    await api("/api/datos", { accion: "sala-cerrar", codigo: sala.codigo }, inst);
    const page = await nuevaPagina();
    await page.goto(base + "/?sala=" + sala.codigo);
    await page.waitForSelector("#v-gate:not([hidden])");
    await page.waitForFunction(() => /clase ya terminó/.test(document.querySelector("#gate-err").textContent));
    await page.context().close();
  });

  await prueba("panel: el administrador ve la clase en vivo, revisa una práctica, mide el acuerdo y exporta", async () => {
    const page = await nuevaPagina();
    page.on("dialog", d => d.accept());
    await page.goto(base + "/panel");
    await page.fill("#login-cod", "no-es-un-codigo");
    await page.click("#login-go");
    await page.waitForFunction(() => /no abre el panel/.test(document.querySelector("#login-err").textContent));
    await page.fill("#login-cod", "ADMIN-DE-PRUEBA-99");
    await page.click("#login-go");
    await page.waitForSelector("#v-panel:not([hidden])");
    assert.equal(await page.locator('#tabs button[data-t="cuentas"]').isVisible(), true, "el administrador ve la pestaña de clientes");

    // Alta de un cliente: sale el mensaje de bienvenida con sus códigos.
    await page.click('#tabs button[data-t="cuentas"]');
    await page.waitForFunction(() => /Curso RCP Norte/.test(document.querySelector("#cl-tabla").textContent));
    await page.click("#cl-nueva");
    await page.fill("#dc-nombre", "Instituto del Litoral");
    await page.click("#dc-guardar");
    await page.waitForSelector("#dc-bienvenida:not([hidden])");
    const bienvenida = await page.locator("#dc-msj").textContent();
    assert.match(bienvenida, /\/panel/);
    assert.match(bienvenida, /INS-[A-Z0-9]{10}/);
    assert.match(bienvenida, /\/\?c=INS-|\/\?c=[A-Z]{3}-/);
    await page.click("#dc-cerrar");

    // Mira la cuenta del curso de la prueba anterior.
    await page.waitForFunction(() => [...document.querySelectorAll("#p-cambiar option")].some(o => o.textContent === "Curso RCP Norte"));
    await page.selectOption("#p-cambiar", { label: "Curso RCP Norte" });
    await page.waitForFunction(() => document.querySelector("#p-cuenta").textContent === "Curso RCP Norte");

    // Clase en vivo: la clase sigue abierta y el grupo 3 terminó con 100.
    await page.click('#tabs button[data-t="clase"]');
    await page.waitForSelector("#clase-viva:not([hidden])");
    await page.waitForFunction(() => /Grupo 3/.test(document.querySelector("#cv-grupos").textContent));
    assert.match(await page.locator("#cv-grupos").innerText(), /terminada/);
    assert.equal(await page.locator("#cv-barras .barra").count(), 10, "una barra por criterio de la rúbrica lego");
    assert.match(await page.locator("#cv-guion").innerText(), /Gimnasio|gimnasio/);

    // Prácticas: abrir, marcar que no averiguó la respiración (crítico) y guardar.
    await page.click('#tabs button[data-t="practicas"]');
    await page.waitForSelector("#pr-tabla tr.clic");
    await page.click("#pr-tabla tr.clic");
    await page.waitForSelector("#dlg[open]");
    assert.equal(await page.locator("#d-crit select").count(), 10);
    assert.match(await page.locator("#d-tr").textContent(), /ALUMNO #1: Estoy en el gimnasio/);
    // Revisión a ciegas: lo de la IA está oculto y los criterios arrancan sin marcar.
    assert.equal(await page.locator("#d-ciega").isVisible(), true);
    assert.equal(await page.locator("#d-crit .ia").first().isVisible(), false, "no se ve el juicio de la IA antes de revisar");
    await page.click("#d-guardar");
    await page.waitForFunction(() => /Te falta marcar 10 criterios/.test(document.querySelector("#d-estado").textContent));
    for (const sel of await page.locator("#d-crit select").all()) await sel.selectOption("logrado");
    await page.selectOption('#d-crit select[data-id="respiracion"]', "falto");
    await page.click("#d-guardar");
    await page.waitForFunction(() => /tu puntaje es 40/.test(document.querySelector("#d-estado").textContent));
    assert.equal(await page.locator("#d-crit .ia").first().isVisible(), true, "después de guardar se puede comparar con la IA");
    await page.click("#d-cerrar");
    await page.waitForFunction(() => /revisada/.test(document.querySelector("#pr-tabla").textContent));

    // Planilla: una fila por práctica, una columna por criterio.
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#pr-csv")]);
    const csv = await new Promise((ok, mal) => { descarga.createReadStream().then(s => { let t = ""; s.on("data", c => t += c); s.on("end", () => ok(t)); s.on("error", mal); }); });
    assert.match(csv, /ia_respiracion/);
    assert.match(csv, /Grupo 3/);
    assert.match(csv, /,40,/, "lleva el puntaje del instructor");

    // Calidad: 10 pares, 9 coinciden.
    await page.click('#tabs button[data-t="calidad"]');
    await page.waitForFunction(() => /Revisadas a ciegas/.test(document.querySelector("#ca-tiles").textContent));
    assert.match(await page.locator("#ca-tiles").innerText(), /90% de coincidencia exacta/);
    assert.ok(await page.locator("#ca-tabla tr").count() > 1);

    // Alumnos: el grupo, con su evolución.
    await page.click('#tabs button[data-t="alumnos"]');
    await page.waitForFunction(() => /Grupo 3/.test(document.querySelector("#al-tabla").textContent));

    // Escenario propio: lo ve el alumno de esa cuenta, marcado como de su institución.
    await page.click('#tabs button[data-t="escenarios"]');
    await page.waitForSelector("#es-fijos details");
    await page.fill("#es-title", "Río · calambre en la correntada");
    await page.fill("#es-scene", "Un nadador se acalambró en la correntada y lo sacaste a la orilla. Respira y tose.");
    await page.fill("#es-addr", "Playa del Espigón I, frente a la bajada de calle Mitre");
    await page.fill("#es-notas", "Al minuto: tose y vomita agua.\nA los 3 minutos: está consciente.");
    await page.click("#es-guardar");
    await page.waitForFunction(() => /calambre/.test(document.querySelector("#es-lista").textContent));

    // Cerrar la clase y abrir otra desde el panel.
    await page.click('#tabs button[data-t="clase"]');
    await page.waitForSelector("#clase-viva:not([hidden])");
    await page.click("#cv-cerrar");
    await page.waitForSelector("#clase-nueva:not([hidden])");
    await page.fill("#cn-nombre", "Clase de repaso");
    await page.click("#cn-abrir");
    await page.waitForSelector("#clase-viva:not([hidden])");
    await page.waitForFunction(() => /^[2-9A-Z]{6}$/.test(document.querySelector("#cv-codigo").textContent));
    assert.match(await page.locator("#clase-anteriores").innerText(), /RCP sábado/);

    // Uso y contactos (sólo administrador).
    await api("/api/datos", { accion: "contacto", nombre: "Marta Instructora", email: "marta@example.com", rol: "Instructora de RCP", mensaje: "Quiero probarlo" });
    await page.click('#tabs button[data-t="contactos"]');
    await page.waitForFunction(() => /Marta Instructora/.test(document.querySelector("#co-tabla").textContent));
    await page.click('#tabs button[data-t="uso"]');
    await page.waitForSelector("#us-cols .c");
    assert.equal(await page.locator("#us-cols .c").count(), 30);
    assert.match(await page.locator("#us-tabla").innerText(), /gemini/);
    await page.context().close();

    // El alumno de esa cuenta ve el escenario nuevo.
    const cuentas = (await api("/api/datos", { accion: "cuentas" }, { "x-panel": "ADMIN-DE-PRUEBA-99" })).cuentas;
    const curso = cuentas.find(c => c.nombre === "Curso RCP Norte");
    const alumno = await nuevaPagina();
    await alumno.goto(base + "/?c=" + curso.codigoAlumnos);
    await alumno.waitForSelector("#v-setup:not([hidden])");
    await alumno.waitForFunction(() => /calambre/.test(document.querySelector("#scenarios").textContent));
    assert.match(await alumno.locator("#scenarios").textContent(), /De tu institución/);
    await alumno.context().close();

    // El instructor, con su propio código, ve sólo su cuenta y no las pestañas del administrador.
    const inst = await nuevaPagina();
    await inst.goto(base + "/panel");
    await inst.fill("#login-cod", curso.codigoInstructor);
    await inst.click("#login-go");
    await inst.waitForSelector("#v-panel:not([hidden])");
    assert.equal(await inst.locator('#tabs button[data-t="cuentas"]').isVisible(), false);
    assert.equal(await inst.locator("#p-cambiar-wrap").isVisible(), false);
    assert.equal(await inst.locator("#p-cuenta").textContent(), "Curso RCP Norte");
    await inst.click('#tabs button[data-t="cuenta"]');
    await inst.waitForFunction(c => document.querySelector("#cu-alumnos").textContent === c, curso.codigoAlumnos);
    await inst.context().close();
  });

  await prueba("páginas públicas: presentación con formulario, fundamentos con la rúbrica real, términos y privacidad", async () => {
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
    const leads = (await api("/api/datos", { accion: "contactos" }, { "x-panel": "ADMIN-DE-PRUEBA-99" })).contactos;
    assert.ok(leads.some(l => l.nombre === "Laura Instructora" && l.origen === "instructores"));

    await page.goto(base + "/fundamentos");
    await page.waitForSelector("table.rub");
    assert.equal(await page.locator("table.rub").count(), 2, "una tabla por perfil");
    assert.match(await page.locator("#tablas-rubrica").innerText(), /Ubicación exacta/);
    assert.ok(await page.locator(".refs li").count() >= 25);
    for (const p of ["terminos", "privacidad"]) {
      await page.goto(base + "/" + p);
      await page.waitForFunction(() => document.querySelector("[data-titular]").textContent.length > 0);
      // Sin TITULAR_NOMBRE en el entorno, la página lo dice en vez de inventarlo.
      assert.match(await page.locator("[data-titular=nombre]").first().textContent(), /falta cargar TITULAR_NOMBRE/);
    }
    await page.context().close();
  });

  assert.deepEqual(errores, [], "sin errores de JavaScript en la página");
  // El prompt del operador no se recorta nunca: tiene que quedar lejos del tope del servidor.
  const { gemini } = await import("./servidor.mjs");
  const largos = gemini.registro.filter(x => x.cuerpo.systemInstruction && !/objeto JSON/.test(x.cuerpo.systemInstruction.parts[0].text))
    .map(x => x.cuerpo.systemInstruction.parts[0].text.length);
  console.log("Prompt del operador: máximo " + Math.max(...largos) + " caracteres (tope del servidor: 40.000).");
  assert.ok(Math.max(...largos) < 36000, "el prompt se acerca al tope: subir TOPE_PROMPT en api/chat.js");
  console.log("\n" + ok + " pruebas de punta a punta pasaron. Comandos a Redis: " + redis.llamadas);
} finally {
  await navegador.close();
  servidor.close();
}
