// Prueba de punta a punta de la copia que corre dentro de Claude (herramientas/copia-claude.mjs),
// en Chromium, con un Claude de mentira en window.claude que usa el mismo operador y el
// mismo evaluador falsos que el resto de las pruebas.
//
//   NODE_PATH=$(npm root -g) node pruebas/copia-claude.test.mjs
//
// Comprueba que la copia no depende del servidor, que la llamada se hace escribiendo, que
// el operador y la devolución pasan por la capacidad "sample" y el informe por "downloads".
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { operadorPorDefecto, evaluadorPorDefecto } from "./falsos.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "copia-107-")), "copia.html");
execFileSync(process.execPath, [path.join(raiz, "herramientas/copia-claude.mjs"), archivo], { stdio: "inherit" });

// Como en servidor.mjs con RAPIDO=1: los tiempos de la llamada en segundos.
const copia = fs.readFileSync(archivo, "utf8")
  .replace(/const ARRIBOS = \{[^}]*\};/, "const ARRIBOS = { corto:[0.1,0.1], normal:[0.15,0.15], largo:[0.25,0.25] };")
  .replace(/const CADENCIA = \{[^}]*\};/, "const CADENCIA = { critico:5000, estable:6000, rcp:4000 };");
// El esqueleto que le pone el artifact a la página publicada.
const pagina = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + copia + "</body></html>";

const pedidos = [];
const servidor = http.createServer((req, res) => {
  pedidos.push(req.url);
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(pagina); }
  else { res.writeHead(404); res.end(); }
}).listen(0);
const base = "http://localhost:" + servidor.address().port;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// Voz de mentira y el Claude del artifact. `__operador` y `__evaluador` los expone la prueba.
function falsos() {
  const sintesis = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [], cancel(){ if(this._u){ const u=this._u; this._u=null; u.onend && u.onend(); } },
    speak(u){ this._u = u; setTimeout(()=>{ if(this._u===u){ this._u=null; u.onend && u.onend(); } }, 30); },
    addEventListener(){}, removeEventListener(){}
  };
  Object.defineProperty(window, "speechSynthesis", { value: sintesis, configurable: true });
  window.__descargas = [];
  window.__llamadas = { sample: 0, json: 0 };
  const sample = async (input, opciones) => {
    window.__llamadas.sample++;
    if (!Array.isArray(input) || input[0].role !== "user" || input[input.length - 1].role !== "user") throw { code: "invalid_request", message: "turnos mal armados" };
    if (!opciones || opciones.cache !== false) throw { code: "invalid_request", message: "la conversación no se cachea" };
    const texto = await window.__operador(input[0].content, input.slice(1));
    return { text: texto, truncated: false, modelTierApplied: "quick" };
  };
  sample.json = async (input) => { window.__llamadas.json++; return JSON.parse(await window.__evaluador(String(input))); };
  const downloads = { save: async (d) => { window.__descargas.push(d); return { status: "saved" }; } };
  window.claude = { use: async (nombre) => ({ sample, downloads })[nombre] || null };
}

const errores = [];
async function nuevaPagina() {
  const page = await navegador.newPage();
  page.on("pageerror", e => { console.error("ERROR EN LA PÁGINA:", e.message); errores.push(e.message); });
  await page.exposeFunction("__operador", (sistema, turnos) =>
    operadorPorDefecto(sistema, turnos.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }))));
  await page.exposeFunction("__evaluador", prompt => evaluadorPorDefecto(prompt));
  await page.addInitScript(falsos);
  return page;
}

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
  await prueba("guardavidas: sin código, llamada escrita, cierre del operador, devolución e informe", async () => {
    const page = await nuevaPagina();
    await page.goto(base + "/");
    await page.waitForSelector("#v-setup:not([hidden])");
    assert.match(await page.locator("#v-setup").innerText(), /Copia para trabajar dentro de Claude/);
    assert.equal(await page.locator("#row-pausa").isHidden(), true, "sin manos libres");
    assert.ok(await page.locator(".card").count() >= 6);

    await page.click('.card[data-id="ahogamiento-puro"]');
    await page.click("#btn-brief");
    await page.waitForSelector("#v-brief:not([hidden])");
    assert.match(await page.locator("#v-brief").innerText(), /la llamada se escribe/);
    await page.click("#btn-call");
    await marcar(page, "107");
    await page.waitForSelector("#typer:not([hidden])", { timeout: 10000 });
    assert.equal(await page.locator("#toggle-type").isHidden(), true, "no se ofrece volver a hablar");
    assert.equal(await page.locator("#ptt").isHidden(), true);
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
    assert.equal(await page.locator("#deb-saved").isHidden(), true, "no hay registro en la copia");

    await page.click("#save");
    await page.waitForFunction(() => window.__descargas.length === 1);
    const d = await page.evaluate(() => window.__descargas[0]);
    assert.match(d.filename, /^107-ahogamiento-puro-\d{4}-\d{2}-\d{2}\.txt$/);
    assert.match(d.data, /Puntaje: 100\/100/);
    const n = await page.evaluate(() => window.__llamadas);
    assert.ok(n.sample >= 5 && n.json === 1, "operador y devolución pasan por Claude");
    await page.close();
  });

  await prueba("lego: RCP guiada hasta que llega la ambulancia, con la rúbrica lego", async () => {
    const page = await nuevaPagina();
    await page.goto(base + "/");
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.click('#perfil button[data-v="lego"]');
    await page.click('.card[data-id="lego-gimnasio"]');
    await page.click("#btn-brief");
    await page.waitForSelector("#v-brief:not([hidden])");
    await page.click("#btn-call");
    await marcar(page, "107");
    await page.waitForSelector("#typer:not([hidden])", { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll(".msg.op:not(.live)").length >= 1, null, { timeout: 10000 });
    await decir(page, "Estoy en el gimnasio de San Martín 2850, primer piso");
    await decir(page, "Un hombre se desplomó, no responde y no respira, hace como un ronquido");
    await decir(page, "¿Qué hago?");
    assert.match(await page.locator("#feed").innerText(), /altavoz/);
    await decir(page, "Ya estoy comprimiendo");
    await page.waitForSelector("#ver-informe:not([hidden])", { timeout: 40000 });
    assert.match(await page.locator("#feed").innerText(), /ambulancia ya está ahí/i);
    await page.click("#ver-informe");
    await page.waitForSelector("#deb-body:not([hidden])", { timeout: 15000 });
    assert.match(await page.locator("#deb-meta").innerText(), /empezó la RCP a los/);
    assert.equal(await page.locator("#deb-items .item").count(), 10);
    assert.equal(await page.locator("#ring-t").textContent(), "100");
    await page.close();
  });

  await prueba("fuera de Claude avisa que el operador no está disponible", async () => {
    const page = await navegador.newPage();
    page.on("pageerror", e => errores.push(e.message));
    await page.goto(base + "/");
    await page.waitForSelector("#v-setup:not([hidden])");
    await page.waitForFunction(() => /no está disponible/.test(document.querySelector("#setup-note").textContent), null, { timeout: 5000 });
    assert.equal(await page.locator("#save").isHidden(), true, "sin descargas no se ofrece el informe");
    await page.close();
  });

  assert.deepEqual(errores, [], "sin errores de JavaScript");
  // /favicon.ico no lo pide la página: lo pide solo el Chrome completo (el de Windows, por
  // ejemplo), no el Chromium de Playwright.
  assert.ok(pedidos.every(u => u === "/" || u === "/favicon.ico"), "la copia no le pide nada a ningún servidor: " + pedidos.join(", "));
  console.log("\n" + ok + " pruebas de la copia de Claude pasaron.");
} finally {
  await navegador.close();
  servidor.close();
}
