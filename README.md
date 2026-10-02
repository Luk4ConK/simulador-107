# Simulador 107 — cómo publicarlo

App web donde el alumno llama al sistema de emergencias y habla en voz alta con un operador simulado. Al cortar recibe la devolución sobre qué datos del protocolo pasó y cuáles faltaron. Es un producto de **Kalu Lab**.

Sirve para dos públicos: la formación de guardavidas (el operador le pide lo que sólo un entrenado sabe dar) y los cursos de RCP para la comunidad (el operador reconoce el paro y guía la RCP por teléfono). Con la base de datos conectada suma clases en vivo para varios grupos a la vez, registro de prácticas y un panel para los instructores.

Publicado en Vercel, el micrófono funciona sin peleas, se instala en el celular como una app más, y la clave de API queda en el servidor: los alumnos nunca la ven ni la pueden copiar.

## La dirección

**https://simulador.kalulab.store** — es la web principal y todo empieza ahí (**kalulab.store** lleva al mismo lugar, para dictarla corta; la dirección de Vercel, https://simulador-107.vercel.app, sigue andando). Mientras no esté conectado el dominio, usá la de Vercel. Abre en una entrada con dos puertas:

- **Soy alumno:** el alumno pone el código de la clase que le diste y entra a practicar.
- **Soy instructor:** ponés tu código y entrás al panel, donde abrís las clases y ves las prácticas.

Para activar el panel y las clases hay que hacer tres cosas en Vercel, una sola vez. La página **/activar** (por ejemplo, https://simulador-107.vercel.app/activar) revisa sola cuáles faltan, prueba que la base y la IA respondan, y tiene los pasos con los enlaces directos.

**El dominio de Kalu Lab.** Al final de esa misma página están los pasos para conectar el dominio (Vercel y GoDaddy). Entrá al panel siempre por **simulador.kalulab.store/panel**: los links que arma para cada clase y los mensajes de bienvenida salen con la dirección desde la que lo abrís.

---

## 1. Sacar la clave de API

Hay dos opciones y el código acepta las dos. Con una alcanza.

**Opción gratis — Google Gemini.** Entrá a **https://aistudio.google.com/apikey** con una cuenta de Google, creá una clave y copiala. La capa gratuita no pide tarjeta y alcanza de sobra para probar y para un curso chico. Tiene topes de llamadas por minuto y por día: si varios alumnos practican al mismo tiempo, alguno puede recibir un "esperá unos segundos". Para afinar guiones y para las primeras prácticas, sobra.

**Opción paga — Claude.** Entrá a **https://platform.claude.com/settings/keys** con la cuenta de Kalu Lab, cargá crédito y creá una clave. Sale unos centavos por práctica (ver más abajo), no tiene topes molestos y el operador queda un poco más fino.

Lo razonable es **arrancar con Gemini** y pasar a Claude si notás que el operador se queda corto. El cambio es borrar una variable y agregar la otra: no se toca una línea de código.

En los dos casos la clave se muestra una sola vez. Copiala antes de cerrar.

**La clave no va nunca en un archivo de este proyecto, ni en un chat, ni en un mensaje.** Va únicamente en las variables de entorno de Vercel (paso 3). Si alguna vez quedó escrita en otro lado, borrala desde el panel donde la creaste y generá una nueva: una clave filtrada la puede usar cualquiera a tu costa.

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
| `CODIGO_ADMIN` | tu código de administrador: largo y sólo tuyo. Abre todo el panel | Sí, para usar el panel |
| `TITULAR_NOMBRE`, `TITULAR_CUIT`, `TITULAR_DOMICILIO` | tus datos como titular del servicio. Salen en los términos y en la privacidad | Sí, antes de mostrar las páginas públicas |
| `CONTACTO_EMAIL`, `CONTACTO_WHATSAPP` | dónde te escriben los interesados | Al menos uno |
| `NOMBRE_PRINCIPAL` | el nombre de tu cuenta principal, si no querés que diga "Kalu Lab" | No |
| `CODIGO_DEMO` | el código de alumnos de una cuenta "Demo pública" creada en el panel. La página para instructores lo muestra | No |
| `MOSTRAR_PRECIOS` | `1` muestra los planes en la página para instructores. **Recién al pasar al plan pago de Vercel** | No |

Si cargás las dos claves, manda Gemini. Para pasarte a Claude, borrá `GEMINI_API_KEY`.

Variables opcionales para ajustar sin tocar código: `MODELO_OPERADOR` y `MODELO_EVALUADOR` (por si querés otro modelo), y `GEMINI_SIN_PENSAR=1` si con Gemini notás que el operador tarda demasiado en contestar.

Si ponés `CODIGO_ACCESO`, la app pide ese código la primera vez y lo recuerda en ese celular. Sin código, cualquiera con el link puede practicar y gastar la cuota.

**Después de agregar variables hay que volver a desplegar** (*Deployments* → los tres puntos del último → *Redeploy*), si no la función sigue sin verlas.

## 4. Conectar la base de datos

Sin base de datos el simulador anda igual que siempre, pero no hay clases en vivo, ni registro de prácticas, ni panel. Conectarla lleva cinco minutos y es gratis:

La página **/activar** del simulador revisa si ya quedó conectada, junto con el código de administrador.

1. En Vercel, en el proyecto: *Storage* → *Create Database* (o *Browse Marketplace*) → **Upstash for Redis** → plan gratuito.
2. Conectala al proyecto. Vercel carga solo las variables que necesita (`UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, o sus equivalentes `KV_REST_API_...`).
3. *Deployments* → *Redeploy*.

La capa gratuita de Upstash trae 500.000 comandos por mes; una clase de tres horas con el tablero abierto gasta menos de 11.000.

## 5. Comprobar que todo quedó bien

Antes de probar la app, abrí en el navegador:

```
https://TU-APP.vercel.app/api/chat?diag=1
```

Te devuelve un texto corto que dice si la clave está cargada, qué modelos puede usar tu cuenta, el resultado de una llamada de prueba y si la base de datos responde. Si `prueba.ok` es `true`, está todo listo. Si dice `claveCargada: false`, falta cargar la variable o falta redeployar después de cargarla.

Esa dirección no muestra la clave, solo si funciona.

Sobre los modelos: la app prueba varios en orden y se queda con el primero que tu cuenta acepte, así que no tenés que averiguar cuál te toca. Si un modelo gratuito se queda sin cuota en plena clase, pasa solo al siguiente. Si querés forzar uno de la lista que devuelve el diagnóstico, cargalo en `MODELO_OPERADOR`.

## 6. Probarlo

Abrí **https://simulador-107.vercel.app** desde el celular, en Chrome. La primera vez que toques *Llamar al 107* el navegador pide el micrófono: aceptá.

Para instalarla como app: en Chrome, menú de los tres puntos → *Agregar a pantalla principal*. En iPhone, Safari → *Compartir* → *Agregar a inicio*.

---

## El panel del instructor

Se entra desde la página principal, en *Soy instructor*, o directo en **https://simulador.kalulab.store/panel**. Se entra con `CODIGO_ADMIN` (vos) o con el código de instructor de cada cuenta. Desde ahí, sin tocar código ni Vercel:

- **Clase en vivo.** Abrís una clase y te da un código de seis caracteres para proyectar. Cada grupo entra con ese código desde su celular y escribe el nombre del grupo. Ves a todos en un tablero (quién está llamando, quién terminó y con cuánto), el guion para cantar la evolución de la víctima en cada escenario que se está llamando y, al final, qué criterio costó más en toda la clase. Al cerrar la clase, los grupos que estaban en una llamada la terminan y reciben su devolución, y el resumen queda a la vista para el cierre; el de una clase anterior se vuelve a ver con «ver resumen».
- **Prácticas.** Cada llamada queda con su transcripción. Podés revisarla criterio por criterio (a ciegas: lo que dijo la IA se ve recién después de marcar lo tuyo), borrarla o descargar todo en una planilla.
- **Alumnos.** La evolución del puntaje de cada grupo o alumno.
- **Calidad.** Cuánto coincide la IA con los instructores (kappa de Cohen), con las revisiones a ciegas.
- **Escenarios.** Escenarios propios de la cuenta, que ven todos sus alumnos en cualquier celular.
- **Mi cuenta.** Cómo se usa la cuenta (prácticas del mes contra el cupo, días de clase, puntaje promedio y tiempo hasta la ubicación, mes por mes) y los códigos de alumnos y de instructor, con cómo cambiarlos.
- **Instructores** (sólo el administrador). Todas las cuentas, una por instructor o institución: las prácticas del mes contra su cupo, las de los últimos 90 días, los días de clase (días con 3 prácticas o más), la última práctica, el vencimiento y si está activa. Arriba, la meta del piloto (5 instructores o instituciones con 2 días de clase o más) y las pruebas que vencen esa semana. Tocando una fila se abre su ficha: el puntaje promedio y el tiempo hasta la ubicación de sus alumnos, sus prácticas mes por mes, sus códigos, el mensaje de bienvenida y sus datos. También se descarga todo en una planilla.
- **Contactos y Uso y costos** (sólo el administrador): lo que llega del formulario de la página para instructores (con un botón para borrar a alguien que pide que se borren sus datos), y el uso diario con los pedidos que se quedaron sin respuesta (si aparecen más de dos días por mes, es la señal para pasar al plan pago de Gemini).

## Dar de alta a un instructor

1. Entrá al panel con tu código de administrador y abrí *Instructores*.
2. Tocá *Nuevo instructor o institución* y completá el nombre, el contacto, el tipo y el plan. La prueba gratuita ya viene con 30 prácticas por mes y vence a los 30 días.
3. Tocá *Guardar*. Se crean solos sus dos códigos: el de instructor, para entrar a su panel, y el de sus alumnos.
4. Copiá el mensaje de bienvenida y mandáselo por mail o por WhatsApp: tiene los links y los dos códigos.

Si pierde su código, o lo tiene alguien que no debería, abrí su ficha y tocá *Cambiar este código*: el viejo deja de andar en el momento y el mensaje sale con el nuevo. Para cortarle el acceso del todo, destildá *Cuenta activa* y guardá. Para ver sus prácticas y sus alumnos como los ve él, tocá *Ver sus alumnos y prácticas* en su ficha.

## Qué le pasás a los alumnos

Para una clase: la dirección de la web y el código de la clase en vivo, que ponen en *Soy alumno*; o directamente el link que copia el panel, que ya trae el código. Para practicar por su cuenta: el código de alumnos de tu cuenta, en la misma puerta. Nada más. No necesitan cuenta ni instalar nada.

Antes de practicar conviene leerles el aviso: es una simulación, usen el nombre del grupo y datos inventados, y la conversación queda guardada para que la revises (se borra sola a los 13 meses).

## Quién llama: guardavidas o persona sin formación

En la pantalla de inicio cada alumno elige si practica como guardavidas o como persona sin formación; en una clase en vivo lo fija el instructor. Como persona sin formación, el operador ayuda a reconocer el paro, pide el altavoz y guía la RCP hasta que llega la ambulancia (sólo compresiones en adultos, con ventilaciones en chicos y ahogados). La devolución mide cuánto tardó en empezar a comprimir.

## Cargar escenarios sin tocar código

Desde el panel, en *Escenarios*: quedan guardados en la base y los ven todos los alumnos de la cuenta.

En la pantalla de inicio del simulador sigue la tarjeta **"+ Cargar un escenario propio"**, que guarda el escenario sólo en ese navegador: sirve para probar un guion al momento. Cuando uno ya esté aceitado para todos los que usen el simulador, tocá *Exportar mis escenarios* y pegá lo que sale dentro de la lista `SCENARIOS` en `index.html`.

## Cuánto cuesta

Hoy corre en la capa gratuita de Gemini, de Vercel y de Upstash: **cero pesos**. La capa gratuita de Gemini tiene topes por modelo, por minuto y por día; la app reparte los pedidos entre varios modelos y, si se saturan un momento, reintenta sola. Con 8 grupos en la capa gratuita, lo seguro es que llamen de a 4 mientras los otros 4 observan; para que llamen los 8 a la vez sin esperas, se activa el plan pago de Gemini ese día (menos de un dólar por clase). Antes de la primera clase conviene mirar los topes reales de tu clave en https://aistudio.google.com/rate-limit.

Si fuera pago: unos **USD 0,036 por práctica** con Gemini (unos $67 con IVA, a septiembre de 2026), más USD 20 por mes de Vercel Pro, que es obligatorio el día que se le cobra a alguien, porque el plan gratuito de Vercel no admite uso comercial. Con Claude cuesta más por práctica, aunque el código usa caché del prompt para bajarlo.

El detalle, el plan de negocio, el paso a planes pagos y la operativa están en el Drive del titular, carpeta **«Simulador 107 · Operativa»**.

---

## Qué toca si querés cambiar algo

Todo el contenido vive en `index.html`, arriba del todo del `<script>`:

- **`SCENARIOS`**: los escenarios fijos, con su `perfil` (guardavidas o lego), la `guia` que usa el operador y `notasInstructor`, el guion que muestra el panel.
- **`CHECKS`** y **`CHECKS_LEGO`**: los criterios de la rúbrica para cada perfil. Cada guía suma los suyos en `GUIAS`.
- **`GUIAS`**: lo que cambia de un tipo de escenario a otro (ahogamiento, paro, trauma, y las dos de RCP guiada).
- **`instrucciones()`**: cómo se comporta el operador. Es el lugar donde afinar el realismo.
- **`APERTURA`**: la frase con la que atiende.

Si cambiás escenarios o rúbrica, conviene reflejarlo también en la copia del simulador publicada como artifact de Claude, la que se usa para escribir guiones.

## Archivos

```
index.html               la app de los alumnos (pantallas, voz, rúbrica)
panel.html               el panel del instructor y del administrador
instructores.html        la presentación para instructores, con formulario de contacto
fundamentos.html         por qué el simulador hace lo que hace, con las fuentes
terminos.html            términos de uso
privacidad.html          política de privacidad
publico.css, publico.js  estilo y datos del titular de las páginas públicas
api/chat.js              el operador y la devolución: guarda la clave y habla con la IA
api/datos.js             clases, registro, panel y contactos
manifest.webmanifest     datos para que se instale como app
sw.js                    hace que abra rápido; nunca cachea la conversación
vercel.json              tiempos de las funciones y direcciones cortas (/panel, /instructores…)
icons/                   íconos de la app
pruebas/                 pruebas automáticas (no se publican)
```

## Pruebas (para quien programe)

No hace falta instalar nada del proyecto; sólo Node 20 o más:

```
node --test pruebas/api.test.mjs pruebas/rubrica.test.mjs
NODE_PATH=$(npm root -g) node pruebas/ui.test.mjs      # necesita Playwright
CON_BASE=1 node pruebas/servidor.mjs                    # la app entera en http://localhost:8107, con IA y base de mentira
```

Las primeras prueban el servidor y la rúbrica sin red; la tercera recorre la app, el panel y las páginas públicas en un navegador real. Correlas antes de subir un cambio: Vercel publica cada push solo.

## Cosas que conviene saber

- **El operador siempre necesita internet.** La app se abre offline, pero sin señal no hay conversación ni devolución.
- **El reconocimiento de voz es el del navegador.** Anda muy bien en Chrome de Android. En iPhone funciona pero es más quisquilloso. Si falla, la app pasa sola a modo texto y el ejercicio se puede terminar igual. En Chrome, el audio lo transcribe Google; el simulador recibe sólo el texto y no guarda audio.
- **La voz del operador es la del sistema operativo.** Suena a navegador. Si más adelante quieren que suene a operador de radio de verdad, el paso siguiente es una API de voz, que multiplica el costo pero cambia bastante la experiencia.
- **Qué se guarda.** Con la base conectada, cada práctica queda con su transcripción y su devolución durante 13 meses, para que el instructor la revise. En la capa gratuita de Gemini, Google puede usar las conversaciones para mejorar sus productos: por eso se practica con nombres de grupo y datos inventados.
