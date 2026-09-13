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
  el operador).
- `CHECKS` — los nueve criterios de la rúbrica. Si agregás o sacás uno, la pantalla de
  devolución y el informe descargable se actualizan solos.
- `DIFF_TXT` y el bloque `tone` dentro de `instrucciones()` — los tres niveles de
  operador: Guía, Real, Exigente.
- `instrucciones()` — el prompt de sistema del operador. Es el archivo donde se afina el
  realismo: orden del interrogatorio, cuándo repregunta, cuándo da RCP guiada, cuándo
  cierra.
- `APERTURA` — la frase con la que atiende.

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

## Pendiente

1. Afinar el prompt del operador y la rúbrica con las primeras prácticas reales. Prueba
   clave: una llamada deliberadamente mala (sin dar dirección, cortando enseguida) tiene
   que dar puntaje bajo. Si da alto, la rúbrica es demasiado blanda.
2. Escenarios nuevos. El usuario los está escribiendo; los carga desde la app con
   "+ Cargar un escenario propio" (quedan en `localStorage`, se exportan con el botón
   Exportar) y después se pegan en `SCENARIOS`.
3. Poder interrumpir al operador mientras habla.
4. Panel de instructor: escenarios compartidos entre todos los alumnos, no por navegador.
   Requiere base de datos.
5. Registro de prácticas por alumno: quién practicó, cuántas veces, cómo evolucionó.
6. Voz de mejor calidad vía API de voz (multiplica el costo, cambia mucho la experiencia).

## Convenciones

- Toda la interfaz y los comentarios del código, en castellano rioplatense.
- Nombres de variables y funciones nuevas, en castellano, como el resto.
- Los mensajes de error que ve el usuario dicen qué pasó y qué hacer, con el código
  técnico entre paréntesis cuando sirve para diagnosticar.
- El `README.md` está escrito para el instructor, no para un desarrollador: si cambiás
  algo que lo afecta, actualizalo en ese registro.
