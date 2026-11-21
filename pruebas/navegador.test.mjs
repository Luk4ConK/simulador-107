// El aviso de navegador de la entrada: node --test pruebas/navegador.test.mjs
// diagnosticarNavegador() se recorta de index.html y se prueba con firmas reales de
// navegadores. Lo que importa: el navegador de adentro de WhatsApp, Instagram o Facebook
// se reconoce (tiene las funciones pero las bloquea), y Chrome y Safari no reciben aviso.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const desde = js.indexOf("  const NAVEGADORES_INTERNOS = [");
const hasta = js.indexOf("  function capacidadesDelNavegador(){");
assert.ok(desde > 0 && hasta > desde, "no encontré el detector de navegador en index.html");
const diagnosticar = new Function(js.slice(desde, hasta) + "\nreturn diagnosticarNavegador;")();

const TODO = { voz: true, habla: true, mic: true };
const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 13; moto g32 Build/T1SAS; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Instagram 355.0.0.0.0 Android",
  facebookIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1]",
  whatsappAndroid: "Mozilla/5.0 (Linux; Android 12; SM-G991B Build/SP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.1",
  webviewAndroid: "Mozilla/5.0 (Linux; Android 11; Redmi Note 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  chromeEscritorio: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

test("Chrome y Safari, con todo, no reciben aviso", () => {
  for (const k of ["chromeAndroid", "safariIphone", "chromeEscritorio"]) assert.equal(diagnosticar(UA[k], TODO), null, k);
});

test("el navegador de adentro de una aplicación se reconoce aunque tenga las funciones", () => {
  const ig = diagnosticar(UA.instagramAndroid, TODO);
  assert.equal(ig.tipo, "interno"); assert.equal(ig.app, "Instagram"); assert.equal(ig.android, true); assert.equal(ig.boton, true);
  const fb = diagnosticar(UA.facebookIphone, TODO);
  assert.equal(fb.app, "Facebook"); assert.equal(fb.ios, true); assert.equal(fb.boton, true);
  assert.equal(diagnosticar(UA.whatsappAndroid, TODO).app, "WhatsApp");
  assert.equal(diagnosticar(UA.webviewAndroid, TODO).app, "otra aplicación");
});

test("sin reconocimiento de voz, sin voz o sin micrófono, se avisa", () => {
  const ff = diagnosticar(UA.firefoxAndroid, { voz: false, habla: true, mic: true });
  assert.equal(ff.tipo, "sin-voz"); assert.equal(ff.boton, true, "en Android se ofrece abrir en Chrome");
  assert.equal(diagnosticar(UA.chromeIphone, { voz: false, habla: true, mic: true }).boton, true, "Chrome de iPhone: se ofrece Safari");
  assert.equal(diagnosticar(UA.safariIphone, { voz: false, habla: true, mic: true }).boton, false, "ya está en Safari: no se ofrece abrirlo ahí");
  assert.equal(diagnosticar(UA.chromeAndroid, { voz: true, habla: false, mic: true }).tipo, "sin-voz");
  assert.equal(diagnosticar(UA.chromeAndroid, { voz: true, habla: true, mic: false }).tipo, "sin-voz");
});
