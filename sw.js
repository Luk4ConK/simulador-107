// Service worker mínimo: hace que la app sea instalable y abra rápido.
// La conversación con el operador SIEMPRE necesita internet: nunca se cachea /api/.
const CACHE = "sim107-v3";
const SHELL = ["./", "./index.html", "./protocolos.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
// Con un wifi que conecta pero no tiene salida (el de un natatorio), el pedido no falla:
// queda colgado. Pasado este tiempo, una página se abre con la copia guardada.
const ESPERA_RED_MS = 3500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Lo que se sirve sin red. La entrada de los alumnos sólo para la raíz: abrir /panel o
// /fundamentos sin red mostraba la app de los alumnos con otro título.
function sinRed(req){
  const url = new URL(req.url);
  return caches.match(req).then(r => {
    if (r) return r;
    if (req.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")) return caches.match("./index.html");
    return new Response("Sin conexión a internet. Revisá el wifi o los datos y probá de nuevo.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  });
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;          // el operador siempre va a la red
  if (url.pathname.startsWith("/descargas/")) return;    // el APK no se guarda en la caché
  if (url.origin !== self.location.origin) return;        // fuentes y demás, que resuelva el navegador

  const red = fetch(e.request).then(r => {
    // Sólo se guarda lo que salió bien: un 404 o un 500 pasajero pisaba la copia buena.
    if (r.ok) {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
    }
    return r;
  });

  if (e.request.mode !== "navigate") {
    e.respondWith(red.catch(() => sinRed(e.request)));
    return;
  }
  // Una página: gana la red si contesta a tiempo; si no, la copia guardada, y si no hay
  // copia, se sigue esperando a la red.
  const reloj = new Promise(listo => setTimeout(listo, ESPERA_RED_MS));
  e.respondWith(
    Promise.race([red.catch(() => null), reloj])
      .then(r => r || caches.match(e.request))
      .then(r => r || red)
      .catch(() => sinRed(e.request))
  );
});
