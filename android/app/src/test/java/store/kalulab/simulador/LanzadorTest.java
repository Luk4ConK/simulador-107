package store.kalulab.simulador;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;
import static org.robolectric.Shadows.shadowOf;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Que la app abra sin cerrarse. La versión 1.0 se cerraba en cada celular real con Chrome
 * ("la app sigue fallando", 21/11/2026): la biblioteca activa ManageDataLauncherActivity
 * con setComponentEnabledSetting(), y Android tira una excepción si la pantalla no está
 * declarada en el manifiesto. Robolectric no es tan estricto, así que se controla aparte
 * que estén declaradas todas las pantallas que la biblioteca usa.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class LanzadorTest {
    private static final String[] PANTALLAS_DE_LA_BIBLIOTECA = {
        "com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity",
        "com.google.androidbrowserhelper.trusted.FocusActivity",
        "com.google.androidbrowserhelper.trusted.WebViewFallbackActivity",
    };

    @Test
    public void estanDeclaradasLasPantallasQueUsaLaBiblioteca() {
        Context ctx = ApplicationProvider.getApplicationContext();
        for (String clase : PANTALLAS_DE_LA_BIBLIOTECA) {
            try {
                ctx.getPackageManager().getActivityInfo(new ComponentName(ctx, clase), 0);
            } catch (PackageManager.NameNotFoundException e) {
                fail("Falta declarar en AndroidManifest.xml: " + clase);
            }
        }
    }

    @Test
    public void abreSinChrome() {
        assertNotNull(Robolectric.buildActivity(Lanzador.class).setup().get());
    }

    @Test
    public void abreConChrome() {
        PackageInfo chrome = new PackageInfo();
        chrome.packageName = "com.android.chrome";
        chrome.versionName = "131.0.6778.135";
        chrome.applicationInfo = new ApplicationInfo();
        chrome.applicationInfo.packageName = "com.android.chrome";
        chrome.applicationInfo.enabled = true;
        shadowOf(ApplicationProvider.getApplicationContext().getPackageManager()).installPackage(chrome);
        assertNotNull(Robolectric.buildActivity(Lanzador.class).setup().get());
    }
}
