# Simulador 107

App web donde un alumno de guardavidas practica la llamada al sistema de emergencias
hablando en voz alta con un operador simulado por IA. Al cortar recibe una devolución
sobre qué datos del protocolo transmitió y cuáles faltaron.

La usa la formación de guardavidas de **Sumar Salud** (Asociación Civil Sumar Salud,
Santa Fe capital, Argentina) en sus entrenamientos y en los cursos de RCP y primeros
auxilios. Hasta ahora, en las prácticas, llamar al 107 se resolvía diciendo en voz alta
"llamo al 107"; esta app reemplaza ese hueco.

El usuario es instructor de esa formación, no programador. Explicale los cambios en
castellano llano y evitá dejarlo con pasos que requieran terminal si hay alternativa.

## Estado

**En producción y funcionando.** Desplegada en Vercel, con la capa gratuita de Google
Gemini. Micrófono, voz del operador y evaluación andando en el celular.

Vercel está conectado a este repositorio: **todo push despliega solo**, conservando la
URL y las variables de entorno. No hay build: es HTML estático más una función.

Existe además una copia publicada como artifact de Claude, que se usa para escribir
guiones gratis (sin gastar API). Ahí el micrófono NO funciona — el contenedor de Claude
no le pasa el permiso, da `NotAllowedError` — así que esa copia se usa sólo en modo
texto y no tiene manos libres. Si cambiás escenarios o rúbrica, avisá que conviene
reflejarlo también en esa copia.

## Archivos

```
index.html            la app entera: pantallas, voz, rúbrica, estado. Sin frameworks.
api/chat.js           función del servidor: guarda la clave y habla con Gemini o Claude
manifest.webmanifest  para que se instale como app
sw.js                 service worker: abre rápido, nunca cachea /api/
vercel.json           maxDuration 60 s para la función; sw.js sin caché
icons/                íconos
README.md             guía de despliegue, escrita para el usuario
```

## Mapa de `index.html`

Todo el contenido editable está arriba del `<script>`, con nombres en castellano:

- `SCENARIOS` — los escenarios fijos. Campos: `id`, `fam`, `title`, `card` (bajada de la
  tarjeta), `scene` (lo que ve el alumno), `addr` (la ubicación real donde está parado,
  que es justamente lo que tiene que saber transmitir), `zona` (la localidad que conoce
  el operador), `guia` (cuál de las `GUIAS` usa) y `evolucion` (los cambios de la escena
  que se le muestran al alumno mientras espera el móvil: `[{min, texto}]`).
- `GUIAS` — lo que cambia de un tipo de escenario a otro. Hoy existe `ahogamiento`, con:
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
- `CHECKS` — los nueve criterios de la rúbrica. Cada uno tiene `peso` (cuánto suma sobre
  100), `critico` (si sin ese dato no sale el móvil) y la vara de corrección escrita:
  qué cuenta como `logrado` y qué como `parcial`. Si agregás o sacás uno, la pantalla de
  devolución y el informe descargable se actualizan solos, pero **los pesos tienen que
  seguir sumando 100**.
- `TOPE_CRITICO` — el puntaje máximo cuando falta un criterio crítico (hoy 40).
  Ojo con dos criterios que cambiaron de sentido: `material` (qué equipamiento hay en el
  lugar, el DEA ante todo) es distinto de `maniobras` (qué están haciendo), y
  `indicaciones` dejó de ser "siguió las indicaciones" —que se quedó sin objeto cuando el
  operador dejó de indicar— y pasó a ser "contestó concreto lo que le preguntaron".
- `DIFF_TXT` y el bloque `tone` dentro de `instrucciones()` — los tres niveles de
  operador: Guía, Real, Exigente.
- `instrucciones()` — el prompt de sistema del operador. Es el archivo donde se afina el
  realismo: orden del interrogatorio, cuándo repregunta, cuándo da RCP guiada, cuándo
  cierra.
- `APERTURA` — la frase con la que atiende.
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
preguntar solo cuando pasó la cadencia sin que nadie hable. `novedad()` le muestra al
alumno los cambios de la escena. El operador marca su clasificación con `[[GRADO:n]]`.

Pantallas: `v-gate` (código de acceso) → `v-setup` → `v-nuevo` (escenario propio) →
`v-brief` → `v-call` → `v-debrief`. Se muestran con `show(nombre)`.

## Decisiones de diseño que conviene no romper

- **El operador es ciego a la escena.** Sólo sabe lo que el alumno le dice. Nunca debe
  mencionar un dato que no le dieron: es el corazón del ejercicio. Si lo hace, el alumno
  aprueba sin haber transmitido nada.
- **La apertura es una frase fija**, no una llamada al modelo: sale al instante, como una
  llamada real, y ahorra una llamada por práctica.
- **El micrófono se cierra mientras el operador habla.** Si queda abierto, el reconocedor
  transcribe la voz sintetizada y la conversación se degrada. Por eso hoy no se puede
  interrumpir al operador; resolverlo bien necesita cancelación de eco o una API de voz
  en tiempo real, no un ajuste de tiempos.
- **Manos libres es el modo por defecto**: apretar un botón por turno rompe el protocolo
  que se está entrenando. El turno se cierra por silencio (`S.pausa`, configurable:
  900 / 1500 / 2400 ms). Queda el modo botón para ambientes ruidosos (natatorio).
- **Si el reconocedor se reinicia más de 12 veces en 10 s**, la app cae sola a modo botón
  y avisa, en vez de quedar en bucle.
- **La clave de API nunca toca el navegador.** Va en variables de entorno de Vercel y se
  usa sólo dentro de `api/chat.js`. No la escribas en ningún archivo del repo.
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
  efecto al probarlo en la cancha. Consecuencia a tener en cuenta: como las llamadas ahora
  terminan cerca de los 2 minutos, los cambios de escena de `evolucion` (escritos a los
  1,5 / 3 / 4,5 min) casi nunca llegan a dispararse, y los controles periódicos tampoco.
  Si se quiere recuperar esa parte de la práctica hay que adelantar los tiempos de
  `evolucion` o inventar un mecanismo de segunda llamada.
- **El tiempo de arribo se sortea** dentro del rango elegido y se le dice al alumno como
  estimación de llegada; lo que no se dice es que salió de un sorteo.
- **La rúbrica efectiva se recalcula al terminar la llamada**, no al empezarla. El
  criterio de reportar los cambios de escena sólo se puede exigir si la escena alcanzó a
  cambiar, y eso recién se sabe al final. Calcularlo al arrancar lo excluía siempre.
- **El modelo no tiene noción del tiempo.** Hay que decírselo en cada turno; eso hace
  `estadoLlamada()`. No se puede confiar en que lo deduzca de la transcripción.
- **La escena cambia sola, el operador no se entera.** Las novedades de `evolucion` se le
  muestran SÓLO al alumno. Si el operador las supiera, se rompe lo de que es ciego y el
  alumno aprueba sin transmitir nada.
- **La base de conocimiento está destilada, no copiada.** Los manuales no entran en un
  prompt que se manda en cada turno, y además son material publicado de terceros. Lo que
  hay en `GUIAS.ahogamiento.saber` son los hechos reescritos que le cambian al operador
  lo que dice. No pegues capítulos de los manuales acá.
- **Sin frameworks, sin build, sin dependencias.** Se despliega tal cual. Mantenerlo así.

## Variables de entorno (en Vercel, no en el repo)

| Variable | Para qué |
|---|---|
| `GEMINI_API_KEY` | clave de Google AI Studio. Si está, se usa esta. **Es la que está en uso.** |
| `ANTHROPIC_API_KEY` | clave de Claude. Se usa si no hay clave de Gemini. |
| `CODIGO_ACCESO` | palabra que los alumnos ingresan una vez. Sin esto, cualquiera con el link gasta la cuota. |
| `MODELO_OPERADOR` / `MODELO_EVALUADOR` | para forzar un modelo puntual |
| `GEMINI_SIN_PENSAR` | `1` manda `thinkingBudget: 0` en la conversación, para que el operador conteste más rápido |

Diagnóstico: **`/api/chat?diag=1`** dice si la clave sirve, qué modelos hay disponibles y
el resultado de una llamada de prueba. No expone la clave. Es lo primero que hay que
mirar cuando algo no responde.

## Cómo probar los cambios

No hay suite de tests. Lo que funcionó hasta ahora:

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

1. Probar en la cancha el operador y la rúbrica nuevos. La aritmética ya está resuelta
   (una llamada sin dirección no pasa de 40 por más que todo lo demás esté bien), pero
   falta ver si el evaluador **aplica bien la vara** en llamadas reales, que es harina de
   otro costal. Prueba clave: una llamada deliberadamente mala tiene que dar bajo, y una
   buena de verdad tiene que llegar a 85+. Si una buena queda en 60, la vara está dura.
2. Escenarios nuevos. El usuario los está escribiendo; los carga desde la app con
   "+ Cargar un escenario propio" (quedan en `localStorage`, se exportan con el botón
   Exportar) y después se pegan en `SCENARIOS`. Los tres escenarios viejos de ahogamiento
   ya usan la guía, pero les falta escribir la `evolucion`: hasta que la tengan, no se les
   evalúa el criterio de reportar cambios.
3. Una guía para PCR sin ahogamiento. El Bloque 1 se reutiliza tal cual; el Bloque 2
   cambia entero (dolor previo, medicación, si hay DEA cerca).
4. Modo lego, que es el otro público previsto. No alcanza con ablandar al operador: un
   lego no conoce el protocolo ni sabe nombrar lo que ve, así que necesita su propia guía
   y su propia rúbrica. El criterio de identificación, por ejemplo, vuelve a necesitar
   teléfono de contacto, que en el de guardavidas se sacó.
5. Poder interrumpir al operador mientras habla. Ahora importa más que antes: las
   llamadas duran varios minutos y el alumno tiene que poder avisar un cambio en el
   momento en que lo ve, no esperar a que el operador termine de hablar.
6. Panel de instructor: escenarios compartidos entre todos los alumnos, no por navegador.
   Requiere base de datos.
7. Registro de prácticas por alumno: quién practicó, cuántas veces, cómo evolucionó.
8. Voz de mejor calidad vía API de voz (multiplica el costo, cambia mucho la experiencia).

## Convenciones

- Toda la interfaz y los comentarios del código, en castellano rioplatense.
- Nombres de variables y funciones nuevas, en castellano, como el resto.
- Los mensajes de error que ve el usuario dicen qué pasó y qué hacer, con el código
  técnico entre paréntesis cuando sirve para diagnosticar.
- El `README.md` está escrito para el instructor, no para un desarrollador: si cambiás
  algo que lo afecta, actualizalo en ese registro.
