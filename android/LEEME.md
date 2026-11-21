# La app de Android del Simulador 107

Es una **Trusted Web Activity (TWA)**: no es otra versión del simulador, sino una app que
abre `https://simulador.kalulab.store` con Chrome, a pantalla completa y sin barra de
direcciones. Se hizo porque algunos navegadores nunca dan el micrófono ni el parlante (el
de adentro de WhatsApp o Instagram, Samsung Internet, Firefox): la app usa **siempre Chrome**
si está instalado (`Lanzador.java`), aunque el navegador preferido del celular sea otro.

- Lo que se publica: `descargas/simulador-107.apk` (lo baja la página `/app`).
- Lo que la vincula con la web: `/.well-known/assetlinks.json`, con la huella SHA-256 de la
  llave de firma. Si la huella no coincide, la app igual abre, pero con una barra de
  dirección arriba y sin quedarse con los links que llegan por WhatsApp.
- Cada cambio de la web llega solo a la app: no hace falta un APK nuevo para eso.
- Un APK nuevo hace falta sólo si cambia algo de acá (el ícono, el nombre, la dirección).
  En ese caso, subir `versionCode` y `versionName` en `app/build.gradle` y la versión que
  dice `app.html`.

## La llave de firma (importante)

La llave **no está en el repositorio** y no tiene que estar nunca. La tiene el titular:
`simulador-107-firma.jks` y su clave. Sin esa llave no se puede publicar un APK que se
instale ENCIMA del que la gente ya tiene (tendrían que desinstalar e instalar de nuevo,
y habría que sumar la huella nueva a `assetlinks.json`).

## Cómo se arma (para quien programe)

Hace falta Java 17 o más nuevo y el Android SDK (plataforma 36). Al instalar el SDK se
acepta la licencia de Google. Con la llave en esta carpeta, un archivo
`android/firma.properties` (ignorado por git):

```
archivo=simulador-107-firma.jks
clave=LA_CLAVE
alias=simulador107
```

y después:

```
cd android
ANDROID_HOME=/ruta/al/sdk ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../descargas/simulador-107.apk
```

La huella para `assetlinks.json` se ve con
`keytool -list -v -keystore simulador-107-firma.jks -alias simulador107`.

Antes de publicar un APK, correr las pruebas (Robolectric, en `app/src/test`):

```
ANDROID_HOME=/ruta/al/sdk ./gradlew testReleaseUnitTest
```

**Lección de la versión 1.0:** se cerraba sola en cada celular real con Chrome ("la app
sigue fallando"), porque faltaba declarar `ManageDataLauncherActivity` en el manifiesto: la
biblioteca la activa al abrir, y Android tira una excepción si no está declarada. Ni la
compilación ni Robolectric lo notan; por eso `LanzadorTest` controla que estén declaradas
todas las pantallas que usa la biblioteca. Si se actualiza `androidbrowserhelper`, comparar
el manifiesto con el de la plantilla de Bubblewrap (GoogleChromeLabs/bubblewrap).

Detalles: `minSdk` 24 (Android 7.0, lo que pide `androidbrowserhelper` 2.7.4) y
`compileSdk` 36 (lo pide `androidx.browser` 1.10). La app abre `/?app=android`, y la web
usa esa marca para no ofrecer bajar la app adentro de la app.
