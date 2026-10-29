// Service worker de retiro. Hasta octubre de 2026 el simulador vivía en www.kalulab.store y
// dejaba instalado ahí su service worker (sim107-v1). Ahora www es la página de Kalu Lab y
// el simulador está en simulador.kalulab.store. Cuando un celular que tenía el viejo vuelve
// a entrar, el navegador baja este archivo en su lugar: borra lo guardado, se da de baja y
// recarga las pestañas, así nadie queda viendo una copia vieja del simulador. Esta página
// no registra ningún service worker propio.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const clave of await caches.keys()) await caches.delete(clave);
    await self.registration.unregister();
    const ventanas = await self.clients.matchAll({ type: "window" });
    for (const v of ventanas) v.navigate(v.url);
  })());
});
