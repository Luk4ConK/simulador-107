package store.kalulab.simulador;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

/**
 * Abre el simulador SIEMPRE con Chrome si está instalado.
 *
 * La biblioteca, por defecto, usa el navegador preferido del celular si sabe abrir una
 * TWA (Samsung Internet, Firefox, Edge…). Justamente esos son los que a veces no dan el
 * micrófono o no reconocen la voz, que es el problema que esta app viene a resolver. Sin
 * Chrome (o con Chrome desactivado), se deja elegir a la biblioteca; si cae en un
 * navegador sin voz, la web lo detecta y ofrece abrir Chrome.
 */
public class Lanzador extends LauncherActivity {
    private static final String CHROME = "com.android.chrome";

    @Override
    protected TwaLauncher createTwaLauncher() {
        return chromeDisponible() ? new TwaLauncher(this, CHROME) : super.createTwaLauncher();
    }

    private boolean chromeDisponible() {
        try {
            ApplicationInfo info = getPackageManager().getApplicationInfo(CHROME, 0);
            return info.enabled;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
