// Simulador 107 — función del servidor.
// Guarda la clave de API fuera del navegador: los alumnos nunca la ven.
//
// Variables de entorno (se cargan en Vercel, no en el código):
//
//   GEMINI_API_KEY     · gratis · clave de Google AI Studio. Si está, se usa esta.
//   ANTHROPIC_API_KEY  · pago   · clave de Claude. Se usa si no hay clave de Gemini.
//   CODIGO_ACCESO      · opcional · palabra que tienen que ingresar los alumnos
//
//   MODELO_OPERADOR    · opcional · para forzar otro modelo en la conversación
//   MODELO_EVALUADOR   · opcional · para forzar otro modelo en la devolución
//   GEMINI_SIN_PENSAR  · opcional · poné "1" si el operador tarda demasiado en contestar
//
// Con cargar UNA de las dos claves alcanza. Podés empezar con Gemini gratis
// y después cambiar a Claude sin tocar una línea de código: se borra una
// variable, se agrega la otra y se vuelve a desplegar.

// Se prueban en orden: si el primero no está disponible para tu clave, sigue con el siguiente
// y se queda con el que funcionó. Así no hay que adivinar qué modelos sirve tu cuenta.
const DEFAULTS = {
  gemini: {
    operador:  ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"],
    evaluador: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"]
  },
  anthropic: {
    operador:  ["claude-haiku-4-5-20251001"],
    evaluador: ["claude-sonnet-5"]
  }
};

const elegido = {}; // memoria del modelo que funcionó, por rol

const SISTEMA_EVALUADOR =
  "Sos instructor de guardavidas evaluando una práctica de llamada al 107. " +
  "Respondés únicamente con un objeto JSON válido, sin texto alrededor y sin bloques de código.";

export default async function handler(req, res) {
  const codigo = (process.env.CODIGO_ACCESO || "").trim();

  if (req.method === "GET") {
    // /api/chat?diag=1 — comprueba que la clave sirve y con qué modelos. No devuelve la clave.
    if (req.query && (req.query.diag === "1" || req.query.diag === "true")) {
      return res.status(200).json(await diagnostico());
    }
    return res.status(200).json({ requiereCodigo: Boolean(codigo), proveedor: proveedor().nombre });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "metodo_no_permitido" });
  }
  if (codigo && String(req.headers["x-codigo"] || "") !== codigo) {
    return res.status(401).json({ error: "codigo_invalido" });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === "string") {
    try { cuerpo = JSON.parse(cuerpo); } catch (e) { return res.status(400).json({ error: "json_invalido" }); }
  }
  if (!cuerpo || typeof cuerpo !== "object") return res.status(400).json({ error: "cuerpo_vacio" });

  // Verificación del código: no gasta una llamada al modelo.
  if (cuerpo.modo === "verificar") return res.status(200).json({ ok: true });

  const prov = proveedor();
  if (!prov.clave) {
    return res.status(500).json({
      error: "sin_clave",
      detalle: "Falta cargar GEMINI_API_KEY o ANTHROPIC_API_KEY en Vercel, y volver a desplegar."
    });
  }

  try {
    if (cuerpo.modo === "operador") {
      const turnos = (Array.isArray(cuerpo.turnos) ? cuerpo.turnos : [])
        .filter(t => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
        .slice(-40)
        .map(t => ({ role: t.role, content: t.content.slice(0, 4000) }));

      // La conversación tiene que arrancar por el lado de quien llama.
      const mensajes = (!turnos.length || turnos[0].role === "assistant")
        ? [{ role: "user", content: "[Entra la llamada al 107]" }, ...turnos]
        : turnos;

      const texto = await generar(prov, "operador", {
        sistema: String(cuerpo.instrucciones || "").slice(0, 24000),
        mensajes,
        // Alcanza para dos oraciones más los marcadores. Si el modelo piensa antes de
        // contestar, esos tokens salen de acá: por eso no va más justo.
        maxTokens: 500,
        rapido: true
      });
      return res.status(200).json({ texto });
    }

    if (cuerpo.modo === "evaluar") {
      const texto = await generar(prov, "evaluador", {
        sistema: SISTEMA_EVALUADOR,
        mensajes: [{ role: "user", content: String(cuerpo.prompt || "").slice(0, 40000) }],
        // El presupuesto de razonamiento se descuenta de maxTokens. Con 1800 y el
        // razonamiento encendido, el modelo lo gastaba pensando en voz alta y la
        // respuesta se cortaba a mitad de palabra, antes del JSON.
        maxTokens: 4000,
        sinPensar: true,
        rapido: false
      });
      const datos = extraerJSON(texto);
      if (!datos) return res.status(502).json({ error: "json_invalido", crudo: texto.slice(0, 600) });
      return res.status(200).json({ datos });
    }

    return res.status(400).json({ error: "modo_desconocido" });
  } catch (e) {
    const estado = e && e.estado ? e.estado : 502;
    return res.status(estado).json({ error: "api", detalle: String((e && e.message) || e).slice(0, 300) });
  }
}

function proveedor() {
  const gemini = (process.env.GEMINI_API_KEY || "").trim();
  const anthropic = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (gemini) return { nombre: "gemini", clave: gemini };
  return { nombre: "anthropic", clave: anthropic };
}

function candidatos(prov, rol) {
  const forzado = rol === "operador" ? process.env.MODELO_OPERADOR : process.env.MODELO_EVALUADOR;
  if (forzado) return [forzado.trim()];
  const previo = elegido[prov.nombre + ":" + rol];
  const lista = DEFAULTS[prov.nombre][rol];
  return previo ? [previo, ...lista.filter(m => m !== previo)] : lista;
}

// Recorre los modelos candidatos hasta que uno responda. Un modelo que no existe
// para esta clave no es un error: se pasa al siguiente y se recuerda cuál anduvo.
async function generar(prov, rol, opciones) {
  const lista = candidatos(prov, rol);
  let ultimo = null;
  for (const modelo of lista) {
    try {
      const texto = prov.nombre === "gemini"
        ? await viaGemini(prov.clave, { ...opciones, modelo })
        : await viaAnthropic(prov.clave, { ...opciones, modelo });
      elegido[prov.nombre + ":" + rol] = modelo;
      return texto;
    } catch (e) {
      ultimo = e;
      if (!e.modeloInexistente) throw e;
    }
  }
  throw ultimo || new Error("sin modelos disponibles");
}

async function diagnostico() {
  const prov = proveedor();
  const salida = { proveedor: prov.nombre, claveCargada: Boolean(prov.clave), codigoAcceso: Boolean((process.env.CODIGO_ACCESO || "").trim()) };
  if (!prov.clave) {
    salida.error = "Falta cargar GEMINI_API_KEY o ANTHROPIC_API_KEY en Vercel, y volver a desplegar.";
    return salida;
  }
  if (prov.nombre === "gemini") {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": prov.clave }
      });
      const d = await r.json();
      if (!r.ok) { salida.error = "La clave fue rechazada: " + JSON.stringify(d).slice(0, 200); return salida; }
      salida.modelosDisponibles = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => String(m.name).replace("models/", ""));
    } catch (e) {
      salida.error = "No se pudo consultar la lista de modelos: " + String(e.message).slice(0, 150);
      return salida;
    }
  }
  try {
    const texto = await generar(prov, "operador", {
      sistema: "Respondé exactamente la palabra: listo",
      mensajes: [{ role: "user", content: "probando" }],
      maxTokens: 20, rapido: true
    });
    salida.prueba = { ok: true, modelo: elegido[prov.nombre + ":operador"], respuesta: texto.slice(0, 80) };
  } catch (e) {
    salida.prueba = { ok: false, detalle: String(e.message).slice(0, 250) };
  }
  return salida;
}

async function viaAnthropic(clave, { modelo, sistema, mensajes, maxTokens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: sistema, messages: mensajes })
  });
  if (!r.ok) throw fallo(await r.text(), r.status);
  const data = await r.json();
  const texto = (data.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
  if (!texto) throw new Error("respuesta vacía");
  return texto;
}

async function viaGemini(clave, opciones) {
  try {
    return await pedirAGemini(clave, opciones);
  } catch (e) {
    // No todos los modelos aceptan que se les apague el razonamiento. Si se queja de
    // eso, se reintenta sin pedírselo antes de dar la llamada por perdida.
    if (e.sinPensarNoSoportado) return await pedirAGemini(clave, { ...opciones, sinPensar: false, rapido: false });
    throw e;
  }
}

async function pedirAGemini(clave, { modelo, sistema, mensajes, maxTokens, rapido, sinPensar }) {
  const cuerpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: mensajes.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    })),
    generationConfig: { maxOutputTokens: maxTokens }
  };
  // El evaluador lo pide siempre (`sinPensar`), porque razonar le come los tokens de la
  // respuesta. El operador lo pide sólo si el instructor prendió GEMINI_SIN_PENSAR,
  // porque ahí es una decisión de velocidad, no de correctitud.
  if (sinPensar || (rapido && process.env.GEMINI_SIN_PENSAR === "1")) {
    cuerpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelo) + ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpo)
    }
  );
  if (!r.ok) throw fallo(await r.text(), r.status);
  const data = await r.json();
  const partes = ((data.candidates || [])[0]?.content?.parts) || [];
  const texto = partes.map(p => p && p.text).filter(Boolean).join("\n").trim();
  if (!texto) throw new Error("respuesta vacía");
  return texto;
}

function fallo(texto, status) {
  const t = String(texto);
  const err = new Error(t.slice(0, 300));
  err.estado = (status === 429) ? 429 : 502;
  // Modelo que esta clave no puede usar: no es una falla real, hay que probar el siguiente.
  err.modeloInexistente = status === 404 || /NOT_FOUND|not_found|not found|does not exist|is not supported|unknown model/i.test(t);
  // El modelo no acepta thinkingConfig: hay que repetir el pedido sin eso.
  err.sinPensarNoSoportado = status === 400 && /thinking/i.test(t);
  return err;
}

function extraerJSON(texto) {
  const intentos = [texto];
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) intentos.push(fence[1]);
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a !== -1 && b > a) intentos.push(texto.slice(a, b + 1));
  for (const t of intentos) {
    try { const v = JSON.parse(t.trim()); if (v && typeof v === "object") return v; } catch (e) {}
  }
  return null;
}
