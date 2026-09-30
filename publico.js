/* Páginas públicas: completa los datos del titular y de contacto, que viven en las
   variables de entorno de Vercel (TITULAR_*, CONTACTO_*, CODIGO_DEMO, MOSTRAR_PRECIOS)
   y no en el repositorio. Si falta alguno, lo dice en la página en vez de inventarlo. */
(function(){
  "use strict";
  const faltantes = {
    nombre: "[falta cargar TITULAR_NOMBRE en Vercel]",
    cuit: "[falta cargar TITULAR_CUIT en Vercel]",
    domicilio: "[falta cargar TITULAR_DOMICILIO en Vercel]"
  };
  function poner(el, texto, falta){
    el.textContent = texto;
    el.classList.toggle("falta", Boolean(falta));
  }
  function aplicar(info){
    const t = (info && info.titular) || {};
    document.querySelectorAll("[data-titular]").forEach(el => {
      const k = el.dataset.titular;
      poner(el, t[k] || faltantes[k] || "", !t[k]);
    });
    const c = (info && info.contacto) || {};
    document.querySelectorAll("[data-contacto='email']").forEach(el => {
      if(!c.email){ el.hidden = true; return; }
      el.textContent = c.email; el.href = "mailto:" + c.email; el.hidden = false;
    });
    document.querySelectorAll("[data-contacto='whatsapp']").forEach(el => {
      const n = String(c.whatsapp || "").replace(/\D/g, "");
      if(!n){ el.hidden = true; return; }
      el.textContent = "WhatsApp " + c.whatsapp; el.href = "https://wa.me/" + n; el.hidden = false;
    });
    document.querySelectorAll("[data-si-contacto]").forEach(el => el.hidden = !(c.email || c.whatsapp));
    document.querySelectorAll("[data-sin-contacto]").forEach(el => el.hidden = Boolean(c.email || c.whatsapp));
    document.querySelectorAll("[data-precios]").forEach(el => el.hidden = !(info && info.precios));
    document.querySelectorAll("[data-sin-precios]").forEach(el => el.hidden = Boolean(info && info.precios));
    const demo = info && info.demo;
    document.querySelectorAll("[data-demo]").forEach(el => el.hidden = !demo);
    document.querySelectorAll("[data-demo-codigo]").forEach(el => el.textContent = demo || "");
    document.querySelectorAll("a[data-demo-link]").forEach(el => { if(demo) el.href = "./?c=" + encodeURIComponent(demo); });
    document.dispatchEvent(new CustomEvent("info-publica", { detail: info || {} }));
  }
  document.querySelectorAll("[data-anio]").forEach(el => el.textContent = String(new Date().getFullYear()));
  fetch("/api/datos?info=1", { cache: "no-store" })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .then(aplicar);
})();
