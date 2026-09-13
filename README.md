# Simulador 107 — cómo publicarlo

App web donde el alumno llama al sistema de emergencias y habla en voz alta con un operador simulado. Al cortar recibe la devolución sobre qué datos del protocolo pasó y cuáles faltaron.

Publicado en Vercel, el micrófono funciona sin peleas, se instala en el celular como una app más, y la clave de API queda en el servidor: los alumnos nunca la ven ni la pueden copiar.

---

## 1. Sacar la clave de API

Hay dos opciones y el código acepta las dos. Con una alcanza.

**Opción gratis — Google Gemini.** Entrá a **https://aistudio.google.com/apikey** con una cuenta de Google, creá una clave y copiala. La capa gratuita no pide tarjeta y alcanza de sobra para probar y para un curso chico. Tiene topes de llamadas por minuto y por día: si varios alumnos practican al mismo tiempo, alguno puede recibir un "esperá unos segundos". Para afinar guiones y para las primeras prácticas, sobra.

**Opción paga — Claude.** Entrá a **https://platform.claude.com/settings/keys** con la cuenta de la ONG, cargá crédito y creá una clave. Sale unos centavos por práctica (ver más abajo), no tiene topes molestos y el operador queda un poco más fino.

Lo razonable es **arrancar con Gemini** y pasar a Claude si notás que el operador se queda corto. El cambio es borrar una variable y agregar la otra: no se toca una línea de código.

En los dos casos la clave se muestra una sola vez. Copiala antes de cerrar.

**La clave no va nunca en un archivo de este proyecto, ni en un chat, ni en un mensaje.** Va únicamente en las variables de entorno de Vercel (paso 3). Si alguna vez quedó escrita en otro lado, borrala desde el panel donde la creaste y generá una nueva: una clave filtrada la puede usar cualquiera a costa de la ONG.

## 2. Subir el proyecto a Vercel

Descomprimí la carpeta `simulador-107` y subila como proyecto nuevo. Dos caminos:

**Camino corto (sin instalar nada):** entrá a vercel.com → *Add New* → *Project* → *Deploy* y arrastrá la carpeta.

**Camino con GitHub (recomendado si después querés ir cambiando escenarios):** subí la carpeta a un repositorio nuevo y en Vercel elegí *Import Git Repository*. Cada cambio que subas se publica solo.

No hay que elegir framework ni comando de build: es HTML suelto más una función. Si Vercel pregunta, dejá *Other* y todo en blanco.

## 3. Cargar las variables de entorno

En Vercel: *Settings* → *Environment Variables*. Agregá:

| Nombre | Valor | ¿Obligatoria? |
|---|---|---|
| `GEMINI_API_KEY` | la clave de Google AI Studio | Una de las dos |
| `ANTHROPIC_API_KEY` | la clave de Claude | Una de las dos |
| `CODIGO_ACCESO` | una palabra o número que le das a los alumnos, ej. `GV2027` | No, pero conviene |

Si cargás las dos, manda Gemini. Para pasarte a Claude, borrá `GEMINI_API_KEY`.

Variables opcionales para ajustar sin tocar código: `MODELO_OPERADOR` y `MODELO_EVALUADOR` (por si querés otro modelo), y `GEMINI_SIN_PENSAR=1` si con Gemini notás que el operador tarda demasiado en contestar.

Si ponés `CODIGO_ACCESO`, la app pide ese código la primera vez y lo recuerda en ese celular. Sin código, cualquiera con el link puede practicar y gastar el crédito de la ONG.

**Después de agregar variables hay que volver a desplegar** (*Deployments* → los tres puntos del último → *Redeploy*), si no la función sigue sin verlas.

## 4. Comprobar que la clave quedó bien

Antes de probar la app, abrí en el navegador:

```
https://TU-APP.vercel.app/api/chat?diag=1
```

Te devuelve un texto corto que dice si la clave está cargada, qué modelos puede usar tu cuenta, y el resultado de una llamada de prueba. Si `prueba.ok` es `true`, está todo listo. Si dice `claveCargada: false`, falta cargar la variable o falta redeployar después de cargarla.

Esa dirección no muestra la clave, solo si funciona.

Sobre los modelos: la app prueba varios en orden y se queda con el primero que tu cuenta acepte, así que no tenés que averiguar cuál te toca. Si querés forzar uno de la lista que devuelve el diagnóstico, cargalo en `MODELO_OPERADOR`.

## 5. Probarlo

Abrí el link que te da Vercel (algo como `simulador-107.vercel.app`) desde el celular, en Chrome. La primera vez que toques *Llamar al 107* el navegador pide el micrófono: aceptá.

Para instalarla como app: en Chrome, menú de los tres puntos → *Agregar a pantalla principal*. En iPhone, Safari → *Compartir* → *Agregar a inicio*.

---

## Qué le pasás a los alumnos

El link y el código de acceso. Nada más. No necesitan cuenta, ni instalar nada, ni que vos estés presente.

## Cargar escenarios sin tocar código

En la pantalla de inicio hay una tarjeta **"+ Cargar un escenario propio"**. Completás nombre, situación que ve el alumno, ubicación real y localidad, y queda guardado en ese navegador, listo para practicar. Se puede editar y borrar.

Sirve para probar un guion nuevo en el momento. Ojo: queda **solo en ese celular o esa computadora** — no lo ven los alumnos. Cuando un escenario ya esté aceitado, tocá *Exportar mis escenarios*, y pegá lo que sale dentro de la lista `SCENARIOS` en `index.html`. Ahí sí lo ve todo el mundo.

## Cuánto cuesta

Cada llamada practicada usa dos modelos: uno rápido y barato para la conversación (`claude-haiku-4-5`) y uno más criterioso para la devolución final (`claude-sonnet-5`).

Una práctica completa de 6 a 8 intercambios sale alrededor de **3 centavos de dólar**. Un curso de 15 alumnos haciendo 3 prácticas cada uno: menos de 2 dólares. Vercel, en plan gratuito, aguanta este uso de sobra.

Conviene igual poner un límite de gasto mensual en el panel de la API, por las dudas.

---

## Qué toca si querés cambiar algo

Todo el contenido vive en `index.html`, arriba del todo del `<script>`:

- **`SCENARIOS`** — los escenarios. Copiá uno y cambiale el texto: `title` (nombre), `card` (la bajada de la tarjeta), `scene` (lo que el alumno "ve"), `addr` (la dirección real donde está parado) y `zona` (la localidad que conoce el operador).
- **`CHECKS`** — los criterios de la rúbrica. Si agregás o sacás uno, se actualizan solos la pantalla de devolución y el informe descargable.
- **`instrucciones()`** — cómo se comporta el operador: el orden del interrogatorio, cuándo repregunta, cuándo da RCP guiada, cuándo cierra. Es el archivo donde afinar el realismo.
- **`DIFF_TXT`** y el bloque `tone` dentro de `instrucciones()` — los tres niveles de operador.
- **`APERTURA`** — la frase con la que atiende.

## Archivos

```
index.html               la app entera (pantallas, voz, rúbrica)
api/chat.js              la función del servidor: guarda la clave y habla con la API
manifest.webmanifest     datos para que se instale como app
sw.js                    hace que abra rápido; nunca cachea la conversación
vercel.json              permite que la evaluación tarde hasta 60 s
icons/                   íconos de la app
```

## Cosas que conviene saber

- **El operador siempre necesita internet.** La app se abre offline, pero sin señal no hay conversación ni devolución.
- **El reconocimiento de voz es el del navegador.** Anda muy bien en Chrome de Android. En iPhone funciona pero es más quisquilloso. Si falla, la app pasa sola a modo texto y el ejercicio se puede terminar igual.
- **La voz del operador es la del sistema operativo.** Suena a navegador. Si más adelante quieren que suene a operador de radio de verdad, el paso siguiente es una API de voz, que multiplica el costo por unas diez veces pero cambia bastante la experiencia.
- **No guarda nada.** Cada práctica vive en el celular del alumno hasta que descarga el informe. Si quieren registro por alumno (quién practicó, cuántas veces, cómo evolucionó), eso es una base de datos y es el próximo paso natural.
