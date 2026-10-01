// Arma la copia del Simulador 107 que corre dentro de Claude (un artifact de claude.ai)
// a partir de index.html. Esa copia sirve para escribir y probar guiones sin gastar la
// API del simulador: el operador y la devolución los hace Claude con la cuenta de quien
// la abre (capacidad "sample" del artifact).
//
//   node herramientas/copia-claude.mjs [salida.html]   (sin salida, la deja en la carpeta temporal)
//
// Qué cambia respecto de la app publicada, y por qué:
// - No hay servidor: api() llama a Claude con las mismas instrucciones que la app le
//   manda a /api/chat. El puntaje lo sigue calculando puntuar(), nunca el modelo.
// - No hay código de acceso, ni clases en vivo, ni registro de prácticas.
// - El micrófono no funciona dentro de Claude (NotAllowedError): la llamada se escribe.
// - Las descargas pasan por la capacidad "downloads" (un <a download> no anda ahí).
// Cada reemplazo exige encontrar el texto exactamente una vez: si index.html cambia y un
// reemplazo deja de calzar, el programa se detiene y dice cuál, en vez de armar una copia
// rota en silencio.
//
// Se publica como artifact con capabilities {sample:{}, downloads:true}.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const salida = path.resolve(process.argv[2] || path.join(os.tmpdir(), "simulador-107-claude.html"));
let h = fs.readFileSync(path.join(raiz, "index.html"), "utf8");

function cambiar(viejo, nuevo) {
  const n = h.split(viejo).length - 1;
  if (n !== 1) throw new Error(`Se esperaba encontrar una vez y aparece ${n}:\n${viejo.slice(0, 160)}`);
  h = h.replace(viejo, () => nuevo);
}

/* ---------------- pantallas ---------------- */

// La entrada (alumnos e instructores) no se muestra nunca en la copia: se sacan sus enlaces
// a otras páginas para que no quede ninguno roto.
cambiar(
  `      <p class="pie">¿Querés usarlo con tus alumnos? <a href="instructores">Conocé el simulador</a><br>
        <a href="fundamentos">Fundamentos y fuentes</a> · <a href="terminos">Términos</a> · <a href="privacidad">Privacidad</a><br>
        Simulador 107 es un producto de Kalu Lab.</p>\n`,
  ``
);
cambiar(
  `El panel todavía no está activado. <a href="activar">Ver qué falta</a>.`,
  `El panel no existe en la copia de Claude.`
);
cambiar(
  `<p class="sub">Practicá la llamada al sistema de emergencias hablando en voz alta con un operador simulado. Al cortar recibís la devolución sobre qué datos pasaste y cuáles faltaron.</p>`,
  `<p class="sub">Practicá la llamada al sistema de emergencias con un operador simulado. Al cortar recibís la devolución sobre qué datos pasaste y cuáles faltaron.</p>
    <p class="note cuenta">Copia para trabajar dentro de Claude: el operador y la devolución los hace Claude con tu cuenta, sin gastar la API del simulador. Acá el micrófono no funciona, así que la llamada se escribe. No hay clases en vivo ni registro de prácticas.</p>`
);
cambiar(
  `No uses datos personales reales durante la llamada: un nombre de pila alcanza. <a href="privacidad.html">Cómo se usan los datos</a>.`,
  `No uses datos personales reales durante la llamada: un nombre de pila alcanza. En esta copia, lo que escribís lo procesa Claude con tu cuenta.`
);
cambiar(
  `        <div class="row">\n          <div><div class="t">Manos libres</div>`,
  `        <div class="row" hidden>\n          <div><div class="t">Manos libres</div>`
);
cambiar(`<div class="row" id="row-pausa">`, `<div class="row" id="row-pausa" hidden>`);
cambiar(
  `<a href="fundamentos.html">Fundamentos y fuentes</a> · <a href="terminos.html">Términos</a> · <a href="privacidad.html">Privacidad</a> · `,
  `Fundamentos, términos y privacidad: en la versión publicada del simulador. `
);
cambiar(
  `Cuando la llamada empiece, el navegador te va a pedir el micrófono: decí tu frase y cuando hacés silencio se envía sola.`,
  `En esta copia la llamada se escribe: poné lo que dirías y tocá Decir, o Enter.`
);
cambiar(
  `<button class="ghost" id="toggle-type">Escribir</button>`,
  `<button class="ghost" id="toggle-type" hidden>Escribir</button>`
);

/* ---------------- estado ---------------- */

cambiar(`manos:true, pausa:1500`, `manos:false, pausa:1500`);

/* ---------------- servidor → Claude ---------------- */

cambiar(
`  // Con tope de tiempo: si la conexión del celular se queda colgada sin fallar, el pedido
  // no terminaba nunca y el alumno quedaba en "Revisando la llamada…" sin botón para
  // salir. 75 s es más que los 60 s que Vercel le da a la función.
  async function api(payload){
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const reloj = ctl ? setTimeout(()=>ctl.abort(), 75000) : null;
    let r, data;
    try{
      r = await fetch("/api/chat", {
        method:"POST",
        headers:{"content-type":"application/json", "x-codigo":S.codigo},
        body: JSON.stringify(payload),
        signal: ctl ? ctl.signal : undefined
      });
      data = await r.json().catch(()=>({error:"respuesta_ilegible"}));
    }catch(err){
      if(err && err.name === "AbortError"){ const e = new Error("sin_respuesta"); e.code = "sin_respuesta"; throw e; }
      throw err;
    }finally{ if(reloj) clearTimeout(reloj); }
    if(!r.ok){ const e = new Error(data.detalle||data.error||"error"); e.code = data.error; e.status = r.status; e.data = data; throw e; }
    return data;
  }`,
`  /* En la copia de Claude no hay servidor: el operador y la devolución los hace Claude
     con la cuenta de quien la usa (capacidad "sample"). Las instrucciones son las mismas
     que la app publicada manda a /api/chat, y el puntaje lo sigue calculando puntuar(). */
  const usos = {};
  function claudeUse(nombre){
    if(!usos[nombre]) usos[nombre] = (async ()=>{
      try{ return (window.claude && window.claude.use) ? (await window.claude.use(nombre)) || null : null; }
      catch(e){ return null; }
    })();
    return usos[nombre];
  }
  const SISTEMA_EVALUADOR =
    "Sos instructor de guardavidas y de primeros auxilios evaluando una práctica de llamada al sistema de emergencias. " +
    "Respondés únicamente con un objeto JSON válido, sin texto alrededor y sin bloques de código.";
  const ERR_CLAUDE = {
    sin_claude: "El operador con IA no está disponible en esta vista. Abrí la página desde Claude.",
    not_granted: "Falta autorizar que esta página use Claude. Volvé a escribir y aceptá el permiso.",
    rate_limited: "Se alcanzó el límite de uso de Claude por ahora. Esperá un rato y volvé a escribir.",
    session_expired: "Se venció la sesión de Claude. Actualizá la página.",
    sampling_disabled: "Esta cuenta no tiene habilitado el uso de Claude desde páginas.",
    refused: "Claude no quiso responder ese mensaje. Probá decirlo de otra forma.",
    invalid_json: "La devolución llegó incompleta. Tocá Reintentar la devolución."
  };
  function unirTurnos(turnos){
    const out = [];
    for(const t of turnos){
      const prev = out[out.length-1];
      if(prev && prev.role === t.role) prev.content += "\\n" + t.content;
      else out.push({ role:t.role, content:t.content });
    }
    return out;
  }
  async function api(payload){
    if(payload.modo === "verificar") return { ok:true };
    const sample = await claudeUse("sample");
    if(!sample){ const e = new Error("sin_claude"); e.code = "sin_claude"; throw e; }
    try{
      if(payload.modo === "operador"){
        const turnos = unirTurnos((payload.turnos||[])
          .filter(t=>t && (t.role==="user" || t.role==="assistant") && typeof t.content==="string" && t.content.trim())
          .slice(-40).map(t=>({ role:t.role, content:t.content.slice(0,4000) })));
        // Como en el servidor: la conversación arranca del lado de quien llama.
        const mensajes = (!turnos.length || turnos[0].role==="assistant")
          ? [{ role:"user", content:"[Entra la llamada al 107]" }, ...turnos] : turnos;
        if(mensajes[mensajes.length-1].role !== "user") mensajes.push({ role:"user", content:"[silencio]" });
        const r = await sample([{ role:"user", content: payload.fijo + "\\n\\n" + payload.variable }, ...mensajes],
                               { modelTier:"quick", cache:false });
        return { texto: r.text };
      }
      if(payload.modo === "evaluar"){
        const datos = await sample.json(SISTEMA_EVALUADOR + "\\n\\n" + payload.prompt, { modelTier:"default", cache:false });
        if(!datos || typeof datos !== "object"){ const e = new Error("invalid_json"); e.code = "invalid_json"; throw e; }
        return { datos, puntaje:null, guardado:false, practicaId:null };
      }
    }catch(e){
      const x = new Error((e && e.message) || "error");
      x.code = (e && e.code) || "api";
      throw x;
    }
    const e = new Error("modo_desconocido"); e.code = "api"; throw e;
  }`
);
cambiar(
`  async function pedirDatos(cuerpo, encabezados){
    const r = await fetch("/api/datos", { method:"POST",
      headers: Object.assign({"content-type":"application/json"}, encabezados || {}), body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(()=>({error:"respuesta_ilegible"}));
    if(!r.ok){ const e = new Error(d.detalle||d.error||"error"); e.code = d.error; e.status = r.status; throw e; }
    return d;
  }`,
`  async function pedirDatos(){ const e = new Error("sin_servidor"); e.code = "sin_servidor"; throw e; }`
);
cambiar(
`  function avisarSala(estado){
    if(!S.acceso || !S.acceso.sala) return;
    fetch("/api/datos", { method:"POST", headers:{"content-type":"application/json", "x-codigo":S.codigo},
      body: JSON.stringify({ accion:"sala-estado", grupo: S.alias || "Sin nombre", estado, escenario: S.scn ? S.scn.title : "", perfil: S.perfil })
    }).catch(()=>{});
  }`,
`  function avisarSala(estado){ /* en la copia de Claude no hay clases en vivo */ }`
);

cambiar(
`  (async function init(){
    try{ S.codigo = localStorage.getItem("sim107_codigo") || ""; }catch(e){ S.codigo = ""; }
    try{ S.alias = localStorage.getItem("sim107_alias") || ""; }catch(e){}
    $("#alias").value = S.alias;
    pintarPerfil();
    const delLink = codigoDelLink();
    let estado = {};
    try{ const r = await fetch("/api/chat"); estado = await r.json(); }catch(e){}
    S.requiere = Boolean(estado.requiereCodigo);
    pintarEntrada(estado);
    if(delLink){
      try{ await verificar(delLink); show("setup"); }
      catch(e){ pedirCodigo(textoError(e)); $("#gate-in").value = delLink; }
      return;
    }
    // Sin un código guardado, la web abre en la entrada: cada uno por su puerta.
    if(!S.codigo && (S.requiere || !libreEnSesion())){ show("gate"); return; }
    pintarCuenta();
    show("setup");
    // Con un código guardado se vuelve a verificar en segundo plano: trae el nombre de la
    // institución y sus escenarios, y si la clase ya cerró, vuelve a pedir un código.
    if(S.codigo){
      try{ await verificar(S.codigo); }
      catch(e){ if(BLOQUEOS.includes(e.code)) pedirCodigo(textoError(e)); }
    }
  })();`,
`  (async function init(){
    try{ S.alias = localStorage.getItem("sim107_alias") || ""; }catch(e){}
    $("#alias").value = S.alias;
    pintarPerfil();
    show("setup");
    // Sin la capacidad de descargas no se ofrece el informe; sin Claude, se avisa.
    claudeUse("downloads").then(dl=>{ if(!dl) $("#save").hidden = true; });
    if(!(await claudeUse("sample"))) $("#setup-note").textContent = ERR_CLAUDE.sin_claude;
  })();`
);

cambiar(
`  $("#btn-export").addEventListener("click", ()=>{
    const txt = JSON.stringify(MIOS.map(({mio, ...r})=>r), null, 2);
    const blob = new Blob([txt], {type:"application/json;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "escenarios-107.json";
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });`,
`  $("#btn-export").addEventListener("click", async ()=>{
    const txt = JSON.stringify(MIOS.map(({mio, ...r})=>r), null, 2);
    const dl = await claudeUse("downloads");
    if(dl){
      try{ await dl.save({ filename:"escenarios-107.json", data:txt }); return; }
      catch(e){ if(e && e.code === "declined") return; }
    }
    try{ await navigator.clipboard.writeText(txt); $("#setup-note").textContent = "Copié tus escenarios al portapapeles."; }
    catch(e){ $("#setup-note").textContent = "No se pudieron exportar desde esta vista."; }
  });`
);

/* ---------------- llamada escrita ---------------- */

cambiar(
`    try{
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("sin-api");
      const st = await navigator.mediaDevices.getUserMedia({audio:true});
      st.getTracks().forEach(t=>t.stop());
    }catch(e){
      S.micDiag = (e && (e.name||e.message)) || "desconocido";
      const w = $("#mic-warn"); w.hidden=false;
      w.textContent = "El permiso de micrófono no salió ("+S.micDiag+"). Probá igual con Hablar; si no anda, revisá el candado de la barra de direcciones.";
    }

`,
  ``
);
cambiar(
  `feed.innerHTML=""; $("#mic-warn").hidden=true; setTextMode(false);`,
  `feed.innerHTML=""; $("#mic-warn").hidden=true; setTextMode(true);`
);
cambiar(
  `    escuchar();\n    avisarSala("en llamada");\n`,
  `    escuchar();\n    avisarSala("en llamada");\n    try{ $("#typed").focus(); }catch(e){}\n`
);
cambiar(
  `      const map = {\n        codigo_invalido:"El código de acceso ya no es válido. Pedíselo al instructor.",`,
  `      const map = Object.assign({\n        codigo_invalido:"El código de acceso ya no es válido. Pedíselo al instructor.",`
);
cambiar(
  `        api:"El servicio no respondió. Volvé a hablar para reintentar."\n      };`,
  `        api:"El servicio no respondió. Volvé a escribir para reintentar."\n      }, ERR_CLAUDE);`
);
cambiar(
  `"Se cortó la comunicación con el operador. Volvé a hablar para reintentar."`,
  `"Se cortó la comunicación con el operador. Volvé a escribir para reintentar."`
);

/* ---------------- devolución ---------------- */

cambiar(
  `: "el servicio no respondió ("+(e.code||e.status||"error")+")");`,
  `: (ERR_CLAUDE[e.code] || "el servicio no respondió") + " ("+(e.code||e.status||"error")+")");`
);
cambiar(
`    const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "107-"+S.scn.id+"-"+new Date().toISOString().slice(0,10)+".txt";
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);`,
`    const nombre = "107-"+S.scn.id+"-"+new Date().toISOString().slice(0,10)+".txt";
    claudeUse("downloads").then(dl=>{ if(dl) return dl.save({ filename:nombre, data:txt }); }).catch(()=>{});`
);
cambiar(
`  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
  }
`,
  ``
);

/* ---------------- documento ----------------
   El artifact envuelve la página en su propio esqueleto: se publica el contenido del
   <body> con el <title>, las fuentes y los estilos adelante. */
const cabeza = h.slice(h.indexOf("<head>") + 6, h.indexOf("</head>"));
const cuerpo = h.slice(h.indexOf("<body>") + 6, h.lastIndexOf("</body>"));
const titulo = cabeza.match(/<title>[\s\S]*?<\/title>/)[0];
const fuentes = cabeza.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g).join("\n");
const estilos = cabeza.match(/<style>[\s\S]*<\/style>/)[0];
for (const prohibido of ["fetch(", "serviceWorker", "getUserMedia", "href=\"privacidad", "a.download"]) {
  if (cuerpo.includes(prohibido)) throw new Error("La copia todavía menciona " + prohibido);
}
fs.writeFileSync(salida, [titulo, fuentes, estilos, cuerpo.trim(), ""].join("\n"));
console.log("Copia de Claude en " + path.relative(process.cwd(), salida) + " (" + fs.statSync(salida).size + " bytes)");
