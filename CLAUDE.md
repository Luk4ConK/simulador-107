# Simulador 107

App web donde un alumno practica la llamada al sistema de emergencias hablando en voz
alta con un operador simulado por IA. Al cortar recibe una devolución sobre qué datos del
protocolo transmitió y cuáles faltaron. Tiene dos perfiles: **guardavidas** (el operador
pregunta como a un profesional y no le dicta maniobras) y **lego** (persona sin formación,
para los cursos de RCP: el operador reconoce el paro y guía la RCP por teléfono).

Es un producto de **Kalu Lab**, la empresa del titular (nombre comercial; desde octubre de
2026, dominio **kalulab.store**, comprado en GoDaddy: si sale bien se buscará el .com).
Kalu Lab es un proyecto aparte de la Asociación Civil Sumar Salud (Santa Fe), donde el
titular es instructor de guardavidas: **Sumar Salud no es parte oficial del proyecto**. El
titular usa el simulador en sus clases de ahí para probarlo, como un instructor más, pero
el producto no la presenta como socia, cliente ni lugar de uso oficial (pedido del
titular, octubre de 2026). En las prácticas de RCP y guardavidas, llamar al 107 se
resolvía diciendo en voz alta "llamo al 107"; esta app reemplaza ese hueco.

El usuario es el titular de Kalu Lab e instructor de guardavidas y RCP, no programador. Explicale los cambios en
castellano llano y evitá dejarlo con pasos que requieran terminal si hay alternativa.

## Estado

**En producción y funcionando.** Desplegada en Vercel, con la capa gratuita de Google
Gemini. Micrófono, voz del operador y evaluación andando en el celular.

Vercel está conectado a este repositorio: **todo push despliega solo**, conservando la
URL y las variables de entorno. No hay build: es HTML estático más una función.
La web es **https://simulador-107.vercel.app** (equipo `sumar-salud-ong`, proyecto
`simulador-107` en Vercel; producción sale de `main`). Si no la encontrás, está en el campo
*website* del repositorio y en los *deployments* de GitHub.

**Dominio (octubre de 2026):** la dirección del simulador es `simulador.kalulab.store`, y
`kalulab.store` y `www.kalulab.store` redirigen ahí desde Vercel (Settings → Domains),
mientras Kalu Lab no tenga página propia. Se decidió así para que la dirección que
reciben alumnos e instituciones (links, QR, la app instalada) no cambie el día que la
empresa tenga su página en la raíz. No se resuelve con un rewrite
por host en `vercel.json`: en Vercel el archivo `index.html` le gana a cualquier rewrite de
`/`. La página de la empresa, cuando exista, va en otro proyecto de Vercel con el dominio
raíz. Los pasos de DNS (GoDaddy) están en `/activar`.

**Marca:** la entrada, los pies de página y los textos legales dicen que el simulador es
un producto de Kalu Lab (nombre comercial del titular; los datos del titular siguen
saliendo de `TITULAR_*`). La entrada no lleva la marca de ninguna institución (estuvo el
escudo de Sumar Salud); la cuenta principal, la del titular, se llama Kalu Lab por
defecto (`NOMBRE_PRINCIPAL`). En octubre de 2026 se sacó también el recuadro para pegar
en la web de Sumar Salud que armaba `/activar`: si algún cliente quiere que sus alumnos
entren desde su propia web, está en el historial de git (commit anterior a "Kalu Lab va
por su cuenta").

**La raíz es la entrada única** (pedido del instructor: todo empieza en la web principal,
así los alumnos la conocen): `v-gate` de `index.html` tiene dos puertas, alumnos con el
código de la clase y instructores con el suyo. La de instructores verifica el código con
`/api/datos` (`accion: "panel"`), lo deja en `sessionStorage.sim107_panel` y manda a
`/panel`, que entra solo. Sin código guardado la web abre siempre en la entrada; la
práctica libre ("Practicar sin código") sólo aparece si el servidor no pide códigos. El
GET de `/api/chat` dice qué está activado (`registro`, `admin`, `clave`, nunca los
valores) y `/activar` (activar.html) lo muestra como lista de control con los pasos y los
enlaces directos a Vercel, para que el dueño no dependa de nadie para activar el panel.
Al final, `/activar` explica cómo conectar el dominio de Kalu Lab. Los links que arma el
panel (`/?sala=` o `/?c=`) toman `location.origin`, así que salen con la dirección desde
la que se abre el panel. Un sitio que quiera meter el simulador en su web tiene que
abrirlo en una pestaña nueva: dentro de un iframe el micrófono no anda.

**Septiembre de 2026: se armó el producto completo** (en la rama
`claude/simulador-107-producto-rllxr2`; producción se actualiza recién cuando se une a la
rama principal). Suma el modo lego, nueve escenarios, clases en vivo para 8 grupos, registro
de prácticas con base de datos (Upstash Redis), un panel de instructor y de administrador,
páginas públicas (presentación para instructores, fundamentos con fuentes, términos y
privacidad) y pruebas automáticas en `pruebas/`. El plan de negocio, los precios, la
operativa, los textos legales y el protocolo del piloto están en el Drive del titular,
carpeta «Simulador 107 · Operativa» (no en el repo). Veredicto: viable a escala chica
(7 instructores o 3 instituciones cubren la estructura paga); piloto gratuito hasta el
31/03/2027 y decisión con cuatro criterios (kappa ≥ 0,6 con ≥ 50 revisiones a ciegas, 5
instructores externos activos, 3 compromisos de pago, baja del tiempo hasta la ubicación).

Existe además una copia publicada como artifact de Claude
(https://claude.ai/artifact/XcYsqaPVXuPJqJnG8nikGi), que se usa para escribir guiones
gratis (sin gastar API): el operador y la devolución los hace Claude con la cuenta de
quien la abre (capacidad `sample`), y el informe se baja con la capacidad `downloads`.
Ahí el micrófono NO funciona — el contenedor de Claude no le pasa el permiso, da
`NotAllowedError` — así que esa copia se usa sólo en modo texto y no tiene manos libres,
ni código de acceso, ni clases en vivo, ni registro. **No se edita a mano**: se arma desde
`index.html` con `node herramientas/copia-claude.mjs salida.html`, se prueba con
`NODE_PATH=$(npm root -g) node pruebas/copia-claude.test.mjs` y se publica en esa misma
dirección con `capabilities: {sample: {}, downloads: true}`. Cada reemplazo del armador
exige encontrar su texto exactamente una vez: si cambiás `index.html` y alguno deja de
calzar, el armador se detiene y dice cuál; ajustalo ahí. Si cambiás escenarios, rúbrica o
el prompt del operador, regenerá y republicá la copia.

## Archivos

```
index.html            la app de los alumnos: pantallas, voz, rúbrica, estado. Sin frameworks.
panel.html            panel del instructor y del administrador (lee SCENARIOS de index.html)
instructores.html     presentación para instructores, formulario de contacto, PLANES
fundamentos.html      decisiones con su evidencia; arma la tabla de la rúbrica con rubrica()
activar.html          para el dueño: qué falta activar en Vercel (base, CODIGO_ADMIN, clave) y los pasos
terminos.html         términos de uso (datos del titular desde /api/datos?info=1)
privacidad.html       política de privacidad, Ley 25.326
publico.css/.js       estilo y datos del titular de las páginas públicas
api/chat.js           operador y evaluador: clave, rotación de modelos, cupo, registro
api/datos.js          salas, prácticas, revisiones, escenarios, cuentas, contactos, uso
manifest.webmanifest  para que se instale como app
sw.js                 service worker: abre rápido, nunca cachea /api/
vercel.json           maxDuration de las funciones, direcciones cortas, cabeceras
icons/                íconos de la app
pruebas/              pruebas automáticas y servidor local (no se publican: .vercelignore)
herramientas/         copia-claude.mjs: arma la copia que corre dentro de Claude (no se publica)
README.md             guía de despliegue, escrita para el usuario
```

`api/chat.js` y `api/datos.js` no se importan entre sí a propósito (cada función de Vercel
es autónoma): los ayudantes de base de datos y códigos están repetidos en las dos, en un
bloque marcado "repetido de api/chat.js (mantener iguales)". Si cambiás uno, cambiá el otro.

`panel.html` y `fundamentos.html` leen `SCENARIOS`, `CHECKS`, `CHECKS_LEGO`, `GUIAS` y
`function rubrica(scn){` de `index.html` con un recorte de llaves balanceadas (el mismo que
usa `pruebas/rubrica.test.mjs`). **Mantené esas declaraciones con esa forma exacta** o esas
páginas se quedan sin datos.

## Mapa de `index.html`

Todo el contenido editable está arriba del `<script>`, con nombres en castellano:

- `SCENARIOS` — los escenarios fijos. Campos: `id`, `fam`, `title`, `card` (bajada de la
  tarjeta), `scene` (lo que ve el alumno), `addr` (la ubicación real donde está parado,
  que es justamente lo que tiene que saber transmitir), `zona` (la localidad que conoce
  el operador), `guia` (cuál de las `GUIAS` usa) y `notasInstructor` (el guion de cómo
  evoluciona la víctima, **para que lo cante el instructor presente**: la app no lo usa
  ni lo evalúa).
- `perfil` en cada escenario: `guardavidas` o `lego`. Filtra qué escenarios ve cada perfil
  y elige la rúbrica (`CHECKS` o `CHECKS_LEGO`), el contexto (`CONTEXTO` o `CONTEXTO_LEGO`),
  el glosario y las grillas (`ESENCIALES`/`EXTRAS` o `ESENCIALES_LEGO`/`EXTRAS_LEGO`).
- `GUIAS` — lo que cambia de un tipo de escenario a otro. Hoy existen `ahogamiento`, `pcr`,
  `trauma` (guardavidas), `lego-rcp` (sólo compresiones) y `lego-ahogamiento` (con
  ventilaciones: chicos y ahogados). La de ahogamiento tiene:
  `escala` (los grados de Szpilman), `clasificar` (el Bloque 2 del interrogatorio),
  `circunstancial` (el Bloque 3), `saber` (lo que el operador sabe del cuadro y le cambia
  lo que indica), `cambia` (ajustes a criterios globales de la rúbrica) y `checks`
  (criterios propios). Un escenario sin `guia` funciona igual, sólo con el Bloque 1.
- `CADENCIA` y `ARRIBOS` — cada cuánto el operador vuelve a controlar a la víctima, y
  los rangos de cuánto tarda el móvil en llegar.
- `ESENCIALES` — lo que el operador tiene que saber ANTES de anunciar que el SEM sale.
  Mientras falte algo, la app se lo dice en cada turno y no lo deja despachar. Incluye
  `acceso` (dónde frena el móvil y quién lo espera), que el instructor puso al mismo nivel
  que la ubicación: es lo que de verdad le sirve a la ambulancia, a diferencia del detalle
  clínico fino.
- `EXTRAS` — lo que pregunta después del anuncio. **Son muy pocos a propósito**: hoy
  identificación, acceso y el resultado del DEA. La guía del escenario suma los suyos con
  `extras`. Agotados, la llamada pasa a espera sola.
- `TOPE_EXTRAS` — turnos que puede gastar después del aviso de despacho (2). Pasados
  esos, entra en espera aunque queden extras sin preguntar.
- `CHECKS` — los diez criterios de la rúbrica de guardavidas (`CHECKS_LEGO`, los diez del
  perfil lego, que sí suman 100). Cada uno tiene `peso` (cuánto suma sobre
  100), `critico` (si sin ese dato no sale el móvil) y la vara de corrección escrita:
  qué cuenta como `logrado` y qué como `parcial`. Si agregás o sacás uno, la pantalla de
  devolución y el informe descargable se actualizan solos. Los pesos se normalizan en
  `puntuar()`, porque cada guía suma los suyos.
- `TOPE_CRITICO` — el puntaje máximo cuando falta un criterio crítico (hoy 40).
  Ojo con dos criterios que cambiaron de sentido: `material` (qué equipamiento hay en el
  lugar, el DEA ante todo) es distinto de `maniobras` (qué están haciendo), y
  `indicaciones` dejó de ser "siguió las indicaciones" —que se quedó sin objeto cuando el
  operador dejó de indicar— y pasó a ser "contestó concreto lo que le preguntaron".
- `DIFF_TXT` y el bloque `tone` dentro de `instrucciones()` — los tres niveles de
  operador: Guía, Real, Exigente.
- `instrucciones()` — el prompt de sistema del operador. Es el archivo donde se afina el
  realismo: orden del interrogatorio, cuándo repregunta, cuándo da RCP guiada, cuándo
  cierra. Devuelve `{ fijo, variable }`: lo fijo va primero (se puede cachear) y el estado
  de la llamada al final, en cada turno. En lego lo arman `promptFijoLego()` y
  `estadoLlamadaLego()`.
- `APERTURA` — la frase con la que atiende.
- `NUMEROS` — el teclado del teléfono. `107` arranca la llamada; el resto no, y cada uno
  explica por qué. El mensaje del 911 dice cuál es el número que corresponde, no que esté
  mal llamar: en muchas jurisdicciones el 911 atiende y deriva.
- `GLOSARIO` — vocabulario del ámbito prehospitalario y de guardavidas, para que el
  operador entienda al alumno cuando habla técnico en vez de hacerlo repetir. **No le
  dice nada de la escena**: es comprensión, no información.
- `CONTEXTO` — quién es el operador y cómo trabaja. Lo más importante que vive acá: si
  el alumno se identifica como guardavidas, el operador cambia de registro y le pide lo
  que sólo un entrenado puede dar (tiempo de sumersión, si ya está comprimiendo, si
  colocó el DEA). Los recursos y nombres del sistema local están pendientes de confirmar
  con el instructor.

Fase de seguimiento: `estadoLlamada()` arma, en cada turno, el bloque que le dice al
modelo en qué minuto va y si el móvil llegó. `sondear()` hace que el operador vuelva a
preguntar solo cuando pasó la cadencia sin que nadie hable. El operador marca su
clasificación con `[[GRADO:n]]` (sólo si la guía tiene `escala`). La evolución de la
víctima ya no la muestra la app: la canta el instructor con `notasInstructor`, que el
panel muestra en la clase en vivo.

Terminar la llamada y pasar a la devolución son dos pasos distintos. `endCall()` deja la
llamada terminada en `v-call`, con la conversación a la vista y el botón **Ver la
devolución**; la evaluación arranca ahí mismo en segundo plano, así el informe ya está
listo cuando el alumno toca el botón. Antes saltaba derecho al informe y quedaba brusco:
cortaba la voz del operador en la última frase. Por eso ahora `speechSynthesis.cancel()`
sólo se llama si el que cortó fue el alumno.

Pantallas: `v-gate` (la entrada: alumnos e instructores) → `v-setup` → `v-nuevo` (escenario propio) →
`v-brief` → `v-dial` (el teclado del teléfono) → `v-call` → `v-debrief`. Se muestran con
`show(nombre)`.

El paso por el teclado es parte del ejercicio: el alumno tiene que saber a qué número
llamar. Marcar cualquier otro no arranca la llamada, le explica cuál corresponde y lo
deja volver a marcar. `iniciarLlamada()` dejó de estar pegada al botón del escenario
justamente para que la dispare el teclado.

## Decisiones de diseño que conviene no romper

- **El operador es ciego a la escena.** Sólo sabe lo que el alumno le dice. Nunca debe
  mencionar un dato que no le dieron: es el corazón del ejercicio. Si lo hace, el alumno
  aprueba sin haber transmitido nada.
- **La apertura es una frase fija**, no una llamada al modelo: sale al instante, como una
  llamada real, y ahorra una llamada por práctica.
- **El micrófono se cierra mientras el operador habla.** Si queda abierto, el reconocedor
  transcribe la voz sintetizada y la conversación se degrada. Se puede interrumpir
  **tocando** la franja de estado (`interrumpir()` corta la voz y abre el micrófono);
  interrumpir **hablando** necesita cancelación de eco o una API de voz en tiempo real,
  no un ajuste de tiempos.
- **Manos libres es el modo por defecto**: apretar un botón por turno rompe el protocolo
  que se está entrenando. El turno se cierra por silencio (`S.pausa`, configurable:
  900 / 1500 / 2400 ms). Queda el modo botón para ambientes ruidosos (natatorio).
- **Si el reconocedor se reinicia más de 12 veces en 10 s**, la app cae sola a modo botón
  y avisa, en vez de quedar en bucle.
- **La clave de API nunca toca el navegador.** Va en variables de entorno de Vercel y se
  usa sólo dentro de `api/chat.js`. No la escribas en ningún archivo del repo.
- **El prompt del operador NO se puede truncar.** Hoy `TOPE_PROMPT` es 40.000 y, si el
  prompt lo supera, el servidor contesta 413 `prompt_largo` en vez de recortarlo; el prompt
  real mide unos 16.450 caracteres y `pruebas/ui.test.mjs` avisa si se acerca al tope.
  Historia: `api/chat.js` lo recortaba a 8.000
  caracteres cuando el prompt real mide ~15.100: se perdía el 47% final, o sea la base de
  conocimiento, el bloque de estado dinámico, los marcadores y el nivel de dificultad. La
  app no se caía, porque las garantías viven en su propio código, pero **todo lo que el
  prompt intenta enseñarle al operador no le llegaba**. El tope quedó en 24.000 por
  seguridad: **si el prompt crece, hay que subirlo**. Se descubrió probando ocho perfiles
  de alumno contra producción; era la causa de casi todos los comportamientos raros.
- **Al evaluador hay que apagarle el razonamiento.** El presupuesto de "pensar" de Gemini
  se descuenta de `maxTokens`: con 1.800 el modelo lo gastaba razonando en voz alta y lo
  cortaban antes de escribir el JSON, así que **ocho de ocho prácticas terminaban sin
  devolución**. Ahora pide `thinkingBudget: 0` y tiene 4.000 tokens. Si un modelo no acepta
  ese ajuste, `viaGemini` reintenta una vez sin pedirlo.
- **`api/chat.js` prueba varios modelos en orden** hasta dar con uno que la cuenta acepte,
  y recuerda cuál anduvo. Un 404 de modelo no es un error: es "probá el siguiente".
- **El puntaje lo calcula la app, no el modelo.** El evaluador sólo decide, criterio por
  criterio, si está logrado / a medias / faltó; `puntuar()` suma los pesos. Se hizo así
  porque un modelo al que se le pide un 0-100 es blando: una llamada mala sacaba un
  número aprobatorio. No vuelvas a pedirle el puntaje al modelo.
- **La app decide cuándo termina el interrogatorio, no el modelo.** Se probó pedírselo en
  el prompt ("cuando ya no te falte nada, callate") y no lo cumple: sigue abriendo
  preguntas nuevas en cada turno (espuma, temperatura, ritmo de compresiones) hasta que la
  práctica se vuelve un examen. Lo decide `enEspera()` a partir de dos grillas,
  `ESENCIALES` y `EXTRAS`: mientras falte algo de la primera, el operador pregunta por eso
  y NO puede anunciar el despacho; completada la primera, anuncia y va por los extras de a
  uno; agotados los dos, entra en espera y tiene prohibido preguntar. El operador declara
  lo que ya averiguó con `[[DATOS:id,id]]` y la app **acumula**, así que si un turno se
  olvida de listar algo, no se pierde.
- **El anuncio del despacho se detecta del TEXTO, no de la marca.** `anuncioDeDespacho()`
  busca en lo que dijo el operador. Hubo que hacerlo porque el modelo anuncia que el móvil
  sale por su cuenta pero no siempre manda `[[DATOS:...]]`: la grilla quedaba vacía, la app
  se creía todavía en interrogatorio y el tope de turnos no arrancaba nunca. Regla general:
  **no atar una transición a que el modelo coopere con una marca** si el mismo hecho se
  puede leer de lo que dijo.
- **La ubicación no se le cree al modelo: la verifica la app.** Probando ocho perfiles
  contra producción, con un alumno que contestaba con preguntas, el operador declaró en
  `[[DATOS:...]]` una ubicación que nunca le dieron y despachó a ningún lado. Ahora
  `dijoUbicacion()` acepta `ubicacion` sólo si en lo que dijo el alumno hay algo que un
  móvil pueda buscar: un número que no sea edad ni tiempo, una palabra de
  `PISTAS_UBICACION` o una palabra de la dirección del escenario (`addr`, `zona`). Si el
  operador anuncia el móvil sin eso, el anuncio no cuenta (`S.anuncioSinUbicacion`) y el
  turno siguiente se le hace aclarar que sin dirección no sale nada. Si es exacta o no lo
  juzga la devolución; esto sólo mira que exista. Los demás datos se le siguen creyendo.
- **"El móvil está en camino" se le dice al operador recién después del despacho.** Antes
  `estadoLlamada()` lo decía en todos los turnos, pegado al "no anuncies todavía": dos
  instrucciones contradictorias que lo empujaban a anunciar sin los datos. Sin despacho,
  `llegoMovil()` da falso también en guardavidas.
- **Una grilla larga de extras alarga el interrogatorio, no lo acorta.** La primera
  versión tenía ocho extras y el efecto fue el contrario al buscado: la app le pasaba al
  operador la lista de los que faltaban y él la iba cumpliendo con disciplina, así que
  seguía preguntando (rescatistas, testigos, temperatura del agua) cuando ya tendría que
  estar callado. Quedaron tres, más `TOPE_EXTRAS`. Lo que el alumno cuente por su cuenta
  se le evalúa igual en la rúbrica: que el operador no lo pregunte es el punto, no un
  problema.
- **La primera versión de esto cortaba por cantidad de turnos y estaba mal.** No miraba si
  el operador tenía la información: con un alumno escueto lo callaba sin haber averiguado
  nada, y con uno locuaz lo dejaba interrogando de más. `TOPE_MINUTOS` (5) quedó sólo como
  red de seguridad por si el modelo nunca manda `[[DATOS:...]]`, no como el mecanismo.
  Hoy vale 4 (`TOPE_MINUTOS_LEGO`, 12: en lego el operador se queda en línea).
- **Las prohibiciones al modelo van con la frase textual.** "No le dictes maniobras" no
  alcanzó: seguía cerrando con "seguí con el ciclo 15:2" o "continúen con las
  compresiones". Hubo que listar esas frases y prohibirlas una por una. Si aparece una
  muletilla nueva, se agrega a la lista de `CONTEXTO`, no se reescribe la regla general.
- **El operador es despachador, no instructor.** No le dicta maniobras ni le marca el
  ritmo al guardavidas: se supone que ya sabe. Pregunta si las acciones YA se están
  haciendo y con qué material cuentan, con el DEA como prioridad. Sólo indica algo si se
  lo piden o si le cuentan una maniobra peligrosa, y ahí en una frase. El interrogatorio
  está escrito en cinco fases dentro de `instrucciones()`: esencial → acciones y material
  → aviso de despacho → el resto → espera.
- **Si el que llama no colabora, el operador abandona.** Antes repetía la misma pregunta
  hasta nueve veces y la llamada no terminaba nunca. `S.sinAvance` cuenta los turnos
  seguidos sin arrancarle un dato nuevo: a los 2 se le pide que cambie el enfoque, a los 4
  (`TOPE_SIN_AVANCE`) cierra explicando que sin ese dato no puede mandar el móvil. Para el
  alumno esa es la lección del ejercicio, y `abandona()` es un cierre válido aunque nunca
  haya despachado: ahí la despedida dice otra cosa, porque prometerle una ambulancia que
  no salió sería mentirle.
- **Si le toca cerrar y no cierra, cierra la app y la despedida la dice ella.** El modelo
  se resiste a colgarle el teléfono a alguien que está reanimando: en las prácticas
  contestaba "Seguimos en línea" o abría otra pregunta. Cuando pasa, `textoDeCierre()`
  pone la despedida; si lo último que dijo fue una pregunta, **se la reemplaza**, porque
  dejarla colgando y cortar es peor que no haberla hecho.
- **El cierre forzado se decide con `tocaCerrar`, calculado ANTES de pedirle la
  respuesta.** Así sólo se fuerza en un turno donde la instrucción ya le decía que
  cerrara. Calcularlo después lo adelantaba un turno y la llamada terminaba sobre la
  última pregunta legítima, sin que el alumno pudiera contestarla.
- **Avisar que corta y cortar van en el MISMO mensaje.** La instrucción decía "cuando ya
  despachaste... y le avisaste que cortás", y eso se leía como avisar en un turno y
  cortar en otro. De ahí salía el "seguimos en línea".
- **El operador corta apenas despachó, no espera al móvil.** Decisión de dos instructores
  después de probarlo: despachada la ambulancia y llena la planilla, un operador real
  corta, porque tiene otras llamadas. Antes de cortar avisa que corta y dice en qué caso
  hay que volver a llamar al 107; eso depende del estado en que quedó la víctima, y la app
  se lo indica según `S.grado`. **En grado 6 no se pide avisar si empeora**: ya está en
  paro, no hay empeoramiento posible, y pedirlo delata que el operador no entendió.
  El cierre sigue bloqueado mientras no haya despachado: `[[CERRAR]]` antes de eso se
  ignora y la llamada sigue.
- **Esto reemplazó a un diseño donde el operador se quedaba en línea hasta que llegaba el
  móvil.** Aquel venía del documento de seguimiento y cierre del instructor; quedó sin
  efecto al probarlo en la cancha.
- **La escena no cambia dentro de la app.** Hubo una versión que le mostraba al alumno
  cómo evolucionaba la víctima, cronometrado, para que él lo transmitiera. Se sacó: durante
  la llamada el guardavidas tiene las manos en la víctima y no está mirando el teléfono,
  así que era pedirle algo que no iba a hacer. Ahora eso lo canta en voz alta el instructor
  presente, y el guion quedó en `notasInstructor` dentro del escenario, que la app no usa.
  De paso se ahorran unos 11.000 tokens por práctica, porque cada cambio en pantalla
  provocaba un turno más del operador.
- **El tiempo de arribo se sortea** dentro del rango elegido y se le dice al alumno como
  estimación de llegada; lo que no se dice es que salió de un sorteo.
- **La rúbrica efectiva se recalcula al terminar la llamada**, no al empezarla. El
  criterio de reportar los cambios de escena sólo se puede exigir si la escena alcanzó a
  cambiar, y eso recién se sabe al final. Calcularlo al arrancar lo excluía siempre.
- **El modelo no tiene noción del tiempo.** Hay que decírselo en cada turno; eso hace
  `estadoLlamada()`. No se puede confiar en que lo deduzca de la transcripción.
- **Lo que cambia en la escena, el operador no lo sabe.** Hoy la evolución la canta el
  instructor en voz alta (ver `notasInstructor`); si algún día la app la vuelve a mostrar,
  tiene que ser SÓLO al alumno. Si el operador la supiera, se rompe lo de que es ciego y
  el alumno aprueba sin transmitir nada.
- **La base de conocimiento está destilada, no copiada.** Los manuales no entran en un
  prompt que se manda en cada turno, y además son material publicado de terceros. Lo que
  hay en `GUIAS.ahogamiento.saber` son los hechos reescritos que le cambian al operador
  lo que dice. No pegues capítulos de los manuales acá.
- **Sin frameworks, sin build, sin dependencias.** Se despliega tal cual. Mantenerlo así.
  Anthropic y Upstash se llaman con `fetch` directo por lo mismo.

### Decisiones de septiembre de 2026 (producto)

- **Modo lego con RCP guiada por teléfono (T-CPR).** Sólo compresiones en adultos (AHA
  2025); 5 ventilaciones y 30:2 en chicos y ahogados (ERC 2025, AHA/AAP 2024). A diferencia
  del guardavidas, el operador **se queda en línea** alentando hasta que llega el móvil, y
  el reloj del arribo arranca en el despacho (`S.tDespacho`), no al atender. La devolución
  mide `tRcpMs`, el momento en que dijo que empezó a comprimir (meta AHA: antes de 150 s).
- **Rotación ante cuota agotada.** Un 429 enfría ese modelo el tiempo que dice
  `retryDelay` (una cuota diaria, al menos una hora) y se prueba el siguiente. Si todos
  fallaron y alguno fue por cuota, el error final es 429 `cuota`, no 502. Con 8 grupos en
  la capa gratuita, lo seguro es que llamen de a 4; los topes reales de cada modelo se ven
  en aistudio.google.com/rate-limit (Google no los publica para los 3.x).
- **El servidor recalcula el puntaje** con la rúbrica que manda la app (`puntuar()`
  repetido en los dos archivos de `api/`). El registro guarda la práctica aunque la
  evaluación falle, y el reintento reusa `practicaId` para no duplicarla.
- **Revisión a ciegas.** En el panel, una práctica sin revisar se abre con lo de la IA
  oculto y los criterios sin marcar. La primera revisión a ciegas se guarda aparte
  (`revision.itemsCiegos`) y no se pisa; la pestaña Calidad calcula el kappa sólo con
  esas. Pre-llenar con el juicio de la IA inflaba el acuerdo: no volver a hacerlo.
- **Códigos.** Alfabeto sin 0/O ni 1/I (se dictan en voz alta). Tipos: administrador
  (`CODIGO_ADMIN`), alumnos de la cuenta principal (`CODIGO_ACCESO`), alumnos e instructor
  de cada cuenta (`cod:`, `codi:`) y clase en vivo (`sala:`, seis letras, vence sola). Una
  clase cerrada sigue existiendo 6 h para que el que llega tarde lea "esa clase terminó".
  30 códigos errados en 10 minutos desde la misma IP (con hash) frenan los intentos.
- **Datos personales.** Se practica con alias o nombre de grupo; no se guarda audio; las
  prácticas vencen a los 400 días. El reconocimiento de voz de Chrome manda el audio a
  Google, y la capa gratuita de Gemini puede usar el contenido: por eso los avisos.
  **Nunca escribas datos personales del titular en el repo**: salen de `TITULAR_*` y
  `CONTACTO_*` vía `/api/datos?info=1`, y si faltan la página lo dice.
- **`CODIGO_DEMO` sólo se publica si es un código de alumnos** de alguna cuenta (se
  verifica en la base): si por error cargan el de administración o uno de instructor, no
  sale en la página.
- **Precios ocultos hasta el plan pago.** Vercel Hobby no admite uso comercial:
  `MOSTRAR_PRECIOS=1` recién después de pasar a Vercel Pro. Los precios viven en `PLANES`,
  al principio del script de `instructores.html` (Instructor $29.000, Institución
  $89.000, septiembre de 2026; el razonamiento está en la planilla de precios del Drive).
- **El tablero de la clase se refresca cada 10 s y sólo con la pestaña visible.** Cada
  consulta gasta unos diez comandos de Upstash y la capa gratuita trae 500.000 por mes.
- **Fuentes verificadas en PubMed.** `fundamentos.html` tiene 29 referencias con DOI. El
  "7-10% por minuto" que circula no sale de Larsen 1993 (5,5 puntos por minuto sin
  tratamiento); Ecker se cita como Resuscitation 2020 (en línea en 2019). Si agregás una
  afirmación clínica, que tenga su fuente ahí.

### Auditoría de octubre de 2026

Una auditoría con verificación independiente (clínica, código y operativa) encontró 38
problemas reales; estos son los arreglos que conviene no deshacer.

Clínica (fuentes: AHA 2025 adulto y pediátrica, ERC 2025 adulto y pediátrica):
- **La técnica de la RCP guiada cambia con la víctima: `listaRcp()`.** Adulto sin
  ahogamiento: `RCP_COMPRESIONES`. Adulto ahogado: `RCP_VENTILACIONES_ADULTO` (talón de
  la mano, unos 5 cm: un tercio del pecho de un adulto pasa los 6 cm). Chico:
  `RCP_VENTILACIONES` (un tercio, unos 5 cm, una o dos manos). Lactante (`victima:
  "lactante"`, el panel ya lo ofrece): `RCP_VENTILACIONES_LACTANTE`, boca a boca y nariz,
  cabeza derecha sin hiperextender, dos pulgares, unos 4 cm. Un lactante lleva siempre
  ventilaciones, aunque la guía sea `lego-rcp`.
- En `GUIAS.ahogamiento.saber`: no existe la regla "una sola mano de 1 a 9 años"; la
  evaluación de pulso y respiración dura hasta 10 s y sólo se estira a un minuto con
  hipotermia marcada (agua fría, helado).
- En los guiones, la recuperación se canta con "respira normalmente" o "tose", nunca con
  "boquea" o "respira con ruido", que son respiración agónica.
- La referencia de 150 s hasta la primera compresión guiada es de la AHA para las
  centrales (mediana, desde que atiende), no "internacional". Por eso `S.t0` se reinicia
  cuando atiende la central, después del tono de llamada y del permiso del micrófono.

Llamada (lego):
- **El operador no le corta nunca a quien está reanimando.** `abandona()` da falso en
  lego con la RCP en marcha o con el paro reconocido (conciencia y respiración). Si a los
  `TOPE_MINUTOS_LEGO` no hubo despacho, termina la app con un aviso (`endCall("tiempo")`,
  `cortoPor: "tiempo"`), no la voz del operador.
- Si la dirección se demora, el estado le pide reconocer el paro primero: la RCP guiada no
  espera a la dirección.
- Si ya comprimía antes de que el operador tuviera lo esencial, la rama "YA ESTÁ HACIENDO
  LA RCP" le pide anunciar la ambulancia. En lego, `sinAvance` no sube con lo esencial
  completo y `turnosPost` cuenta desde el despacho.
- **`empezoRCP()` sólo lee afirmaciones.** Preguntas ("¿dónde comprimo?"), negaciones
  ("no le estoy haciendo RCP") y el conteo de los 5 soplidos no cuentan; por voz no llegan
  los signos. La marca `rcp` del modelo se acepta sólo con `confirmaRcp()`. Casos en
  `pruebas/llamada.test.mjs`.
- Guardavidas: sin despacho, ni `[[ESPERA]]` ni `TOPE_MINUTOS` cierran (antes el estado le
  decía "ya despachaste" sin ubicación).
- Una respuesta del operador que llega después de cortar se descarta; `sendTurn` no manda
  con un pedido en curso y `rec.onresult` ignora lo que llega después de `stop()`.
- Ante un 429 por saturación, la app reintenta sola dos veces (8 s y 20 s) antes de
  pedirle al alumno que repita. `api()` corta a los 75 s (`sin_respuesta`).
- El `practicaId` lo arma la app al empezar (`nuevoIdPractica()`); el servidor lo acepta si
  es nuevo o de la misma cuenta, así el reintento de una devolución que se guardó pero no
  llegó al celular no duplica la práctica ni el cupo. `S.guardada` dice si de verdad quedó.

Servidor:
- **Clase cerrada o vencida.** La clave `sala:` vive 6 h más que la clase y `salainfo:`
  90 días: un código de clase vieja se lee como `sala_cerrada` ("esa clase terminó"), nunca
  como código equivocado. Durante `GRACIA_SALA_MS` (20 min) desde el cierre o el
  vencimiento, una llamada ya empezada (turnos sin `inicio` y la evaluación) termina y se
  guarda; nadie nuevo entra.
- **El freno por IP cuenta códigos distintos** (`SADD`/`SCARD` en `rl:<freno>:<ip>`), no
  pedidos, y el de los alumnos (`alumnos`) va aparte del del panel (`panel`): en un aula
  todos salen por la misma IP y un celular que reintentaba con un código viejo dejaba
  afuera a todos, instructor incluido. `sala-estado` pasa por el mismo freno.
- Un aviso "evaluando" que llega tarde no pisa un "terminada" o "sin devolución" reciente;
  el servidor escribe "evaluando" él mismo al empezar la evaluación.
- Rotación: también pasan al siguiente modelo un 500, 502, 504, un 403 (modelo
  restringido), la red caída, el tiempo agotado y un JSON inválido del evaluador. Tope de
  45 s por pedido (`PRESUPUESTO_MS`) y por modelo (`TOPE_MODELO_MS`), para contestar antes
  de que Vercel corte a los 60 s. Ya no se pone primero "el que anduvo": tras un desborde
  el operador quedaba pegado al Flash de reserva y se comía la cuota del evaluador. La
  lista no tiene alias `-latest` y el desborde del operador (3.6 y 3.7 Flash) no es el
  del evaluador (3.8, 3.5 y 2.5 Flash).
- `contarFalla()` cuenta en `usog:` los pedidos sin respuesta (`sinRespuesta`, `sinCuota`):
  es la señal para pasar al plan pago, y el panel la muestra.
- **Cron diario** (`vercel.json`, `/api/datos?vivo=1`): una escritura real en Upstash,
  que archiva las bases gratuitas a los 30 días sin actividad. En Hobby, una vez por día.

Panel:
- Una clase cerrada queda a la vista con su resumen (`P.salaVista`) hasta tocar "Volver";
  las clases anteriores tienen "ver resumen". El tablero sigue actualizándose mientras haya
  grupos terminando, hasta 45 minutos después del cierre.
- El guion que se muestra es el de cada escenario que los grupos tienen ahora, no el más
  usado en la clase.
- A ciegas también en la tabla de Prácticas y en el recuadro de la ubicación.
- Prácticas paginadas de a 500 (hasta 5.000 por período) y el CSV respeta la búsqueda.
- Plan Prueba: 30 prácticas por mes y vencimiento a 30 días.
- `/activar` muestra la prueba real de `/api/chat?diag=1` (la base responde, la IA
  contesta), no sólo si las variables están cargadas.

## Variables de entorno (en Vercel, no en el repo)

| Variable | Para qué |
|---|---|
| `GEMINI_API_KEY` | clave de Google AI Studio. Si está, se usa esta. **Es la que está en uso.** |
| `ANTHROPIC_API_KEY` | clave de Claude. Se usa si no hay clave de Gemini. |
| `CODIGO_ACCESO` | palabra que los alumnos ingresan una vez. Sin esto, cualquiera con el link gasta la cuota. |
| `MODELO_OPERADOR` / `MODELO_EVALUADOR` | uno o varios modelos, separados por comas y en orden, que se prueban antes que la lista del código |
| `GEMINI_SIN_PENSAR` | `1` manda `thinkingBudget: 0` en la conversación, para que el operador conteste más rápido |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (o `KV_REST_API_*`) | la base de datos; las carga Vercel al conectar Upstash. Sin esto, todo anda sin registro |
| `CODIGO_ADMIN` | código del administrador: abre el panel completo |
| `NOMBRE_PRINCIPAL` | nombre de la cuenta principal, la del titular (por defecto, Kalu Lab) |
| `TITULAR_NOMBRE` / `TITULAR_CUIT` / `TITULAR_DOMICILIO` | datos del titular para términos y privacidad |
| `CONTACTO_EMAIL` / `CONTACTO_WHATSAPP` | contacto público |
| `CODIGO_DEMO` | código de alumnos de la cuenta de demo pública |
| `MOSTRAR_PRECIOS` | `1` muestra los planes en /instructores (sólo con Vercel Pro) |

Diagnóstico: **`/api/chat?diag=1`** dice si la clave sirve, qué modelos hay disponibles,
el resultado de una llamada de prueba y si la base de datos responde. No expone la clave. Es lo primero que hay que
mirar cuando algo no responde.

## Cómo probar los cambios

Hay pruebas automáticas en `pruebas/`, sin dependencias del proyecto (Node 20+; la de
navegador usa el Playwright global y el Chromium del entorno):

```
node --test pruebas/api.test.mjs pruebas/rubrica.test.mjs pruebas/llamada.test.mjs   # servidor, rúbrica y llamada, sin red
NODE_PATH=$(npm root -g) node pruebas/ui.test.mjs            # punta a punta en Chromium
NODE_PATH=$(npm root -g) node pruebas/copia-claude.test.mjs  # la copia de Claude, con un Claude falso
RAPIDO=1 CON_BASE=1 node pruebas/servidor.mjs                # la app en localhost:8107
```

En la computadora del titular (Windows) hay una copia local del repositorio. Ahí Playwright
está instalado sin navegador propio, y las pruebas de navegador usan el Chrome instalado:
`CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe"`. El Chrome completo
pide `/favicon.ico` por su cuenta, y `copia-claude.test.mjs` ya lo tiene en cuenta. En un
clon de Windows hay que poner `git config core.autocrlf false`: con CRLF,
`herramientas/copia-claude.mjs` no encuentra los textos que reemplaza.

`pruebas/falsos.mjs`: `gemini.operador` reemplaza al operador falso en el medio de una
prueba (volverlo a `null` al terminar); así se prueba un operador que se porta mal.

El recorte de llaves balanceadas de `rubrica.test.mjs` y `llamada.test.mjs` no entiende
expresiones regulares: en las funciones que se recortan, una regex con un `[` o una `{`
sin cerrar (por ejemplo `/^\[silencio/`) hace que el recorte se pase de largo. Ahí usá
`startsWith` o `includes`.

`pruebas/falsos.mjs` tiene un Redis en memoria (sólo los comandos que se usan: si agregás
uno en `api/`, agregalo ahí) y un Gemini falso con cuotas, 404 y un operador que sigue el
ESTADO DE LA LLAMADA. `ui.test.mjs` recorre guardavidas, lego en una clase, una clase
cerrada, el panel completo (revisión a ciegas, kappa, CSV, altas) y las páginas públicas,
y falla si hay errores de JavaScript o si el prompt se acerca a `TOPE_PROMPT`. Las
fórmulas de las planillas del Drive se verificaron con la librería `formulas` de Python
(LibreOffice no abre archivos en la carpeta temporal de este entorno).

Lo que funcionó antes de tener la suite, y sigue sirviendo para explorar:

- **Sintaxis**: extraer el `<script>` de `index.html` a un archivo y `node --check`.
- **Rúbrica**: extraer `CHECKS`, `rubrica()` y `puntuar()` con un `new Function` y correr
  los casos borde sin navegador: todo faltó → 0; todo logrado → 100; sin ubicación y el
  resto perfecto → topeado en 40. Los pesos ya NO tienen que sumar 100: `puntuar()`
  normaliza, porque cada guía agrega los suyos.
- **Fase de seguimiento**: generar una copia de `index.html` con `CADENCIA` y `ARRIBOS` en
  segundos en vez de minutos y un operador falso que devuelve `[[GRADO:6]]` y `[[CERRAR]]`
  en todos los turnos. Servirla y manejarla desde el navegador. Así se ve la llamada
  entera en 30 segundos y se comprueba lo que importa: que los cierres previos al arribo
  queden bloqueados, que los sondeos salgan solos, que las novedades aparezcan a tiempo y
  que ninguna marca `[[...]]` se filtre a la pantalla. El `speechSynthesis` falso necesita
  `addEventListener`, si no el script aborta y no se engancha ningún botón.
- **Lógica del servidor**: importar `api/chat.js` con un `global.fetch` falso y un objeto
  `res` de mentira. Así se verificó el recorrido de modelos y el mapeo de roles a Gemini
  (`assistant` → `model`) sin tocar la red.
- **Turnos de voz**: Playwright con `addInitScript` que reemplaza `SpeechRecognition`,
  `speechSynthesis` (con `Object.defineProperty`, la asignación directa falla),
  `AudioContext`, `navigator.mediaDevices` y `fetch`. Se comprueba la secuencia esperada:
  `habla-inicio → habla-fin → mic-start → mic-stop → POST → habla-inicio…`, y que el
  micrófono no se abra durante el tono de llamada.
- Lo que no se puede probar así: voz real, ruido ambiente y latencia percibida. Eso lo
  prueba el usuario en el celular.

## Correcciones del instructor que pisan a la bibliografía

Cuando el aula y el manual no coinciden, gana el aula, pero queda anotado acá para que no
se "corrija" de vuelta desde el manual:

- **El guardavidas no administra oxígeno.** En Argentina no está en su alcance: el O2 que
  figura en la tabla de grados lo pone el SEM cuando llega. El operador no se lo pregunta
  ni se lo indica. Salió de una práctica real, donde el operador preguntó si la víctima
  tenía oxígeno suplementario y el instructor contestó que no es legal acá.
- **Relación de compresiones y ventilaciones.** El manual SVB Guardavidas dice, en dos
  lugares, "15x2 en todas las edades para situaciones de ahogamiento donde intervienen dos
  socorristas y 30x2 en solitario". El instructor corrigió que **15:2 se reserva a chicos
  y lactantes, y en adultos es 30:2**. Está aplicado así en `GUIAS.ahogamiento.saber`, con
  la discrepancia anotada en la misma línea.

## Pendiente

1. Probar en la cancha el operador y la rúbrica nuevos (es el piloto: ver el protocolo en
   el Drive). La aritmética ya está resuelta
   (una llamada sin dirección no pasa de 40 por más que todo lo demás esté bien), pero
   falta ver si el evaluador **aplica bien la vara** en llamadas reales, que es harina de
   otro costal. Prueba clave: una llamada deliberadamente mala tiene que dar bajo, y una
   buena de verdad tiene que llegar a 85+. Si una buena queda en 60, la vara está dura.
2. Hecho en septiembre de 2026: nueve escenarios (seis de guardavidas y tres lego), guías
   `pcr` y `trauma`, modo lego con su rúbrica, panel con escenarios compartidos por
   cuenta y registro de prácticas por alumno o grupo.
3. Interrumpir al operador **hablando** (hoy sólo tocando la franja de estado). Necesita
   cancelación de eco o una API de voz en tiempo real.
4. Conseguir el manual de operadores del SIES 107 de Santa Fe para afinar el
   interrogatorio con el protocolo local (existe; no fue accesible desde este entorno).
5. Hecho en septiembre de 2026: botón para borrar un contacto del formulario desde el
   panel (pestaña Contactos, sólo administrador; acción `contacto-borrar` de `api/datos.js`).
   Es para los pedidos de supresión de la Ley 25.326: borra del todo, no archiva.
6. Voz de mejor calidad vía API de voz (multiplica el costo, cambia mucho la experiencia).
7. Al pasar a planes pagos: sacar los avisos de etapa piloto de `terminos.html` y
   `privacidad.html` y sumar las condiciones de pago revisadas por un abogado.

## Convenciones

- Toda la interfaz y los comentarios del código, en castellano rioplatense.
- Nombres de variables y funciones nuevas, en castellano, como el resto.
- Los mensajes de error que ve el usuario dicen qué pasó y qué hacer, con el código
  técnico entre paréntesis cuando sirve para diagnosticar.
- El `README.md` está escrito para el instructor, no para un desarrollador: si cambiás
  algo que lo afecta, actualizalo en ese registro.
