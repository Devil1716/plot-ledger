package com.devil1716.plotledger;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native app updates for a sideloaded APK: download the new APK (with progress events),
 * verify its SHA-256, and hand it to Android's package installer. Android always shows
 * its own "Install" confirmation for apps that don't come from a store; this plugin gets
 * the user straight to that dialog.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String expected = call.getString("sha256", "");
        final String version = call.getString("version", "update");
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https URL is required");
            return;
        }
        if (expected == null || !expected.matches("^[0-9a-fA-F]{64}$")) {
            call.reject("A SHA-256 checksum is required");
            return;
        }
        executor.execute(() -> {
            File dir = new File(getContext().getCacheDir(), "apk-updates");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File file : old) //noinspection ResultOfMethodCallIgnored
                file.delete();
            File target = new File(dir, "plot-ledger-" + version.replaceAll("[^0-9A-Za-z._-]", "") + ".apk");
            HttpURLConnection connection = null;
            try {
                connection = open(url, 0);
                long total = connection.getContentLengthLong();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long done = 0;
                int lastPercent = -1;
                long lastEmit = 0;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        done += read;
                        int percent = total > 0 ? (int) (done * 100 / total) : -1;
                        long now = System.currentTimeMillis();
                        if (percent != lastPercent && now - lastEmit > 120) {
                            lastPercent = percent;
                            lastEmit = now;
                            JSObject progress = new JSObject();
                            progress.put("bytes", done);
                            progress.put("total", total);
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
                if (!hex.toString().equalsIgnoreCase(expected)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("The download was corrupted (checksum mismatch). Try again.");
                    return;
                }
                JSObject progress = new JSObject();
                progress.put("bytes", done);
                progress.put("total", done);
                progress.put("percent", 100);
                notifyListeners("progress", progress);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("bytes", done);
                call.resolve(result);
            } catch (Exception error) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
                call.reject("Download failed: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    /** Follows GitHub's redirect to its asset CDN (https only). */
    private HttpURLConnection open(String url, int hops) throws Exception {
        if (hops > 5) throw new Exception("Too many redirects");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/octet-stream");
        int status = connection.getResponseCode();
        if (status >= 300 && status < 400) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || !location.startsWith("https://")) throw new Exception("Bad redirect");
            return open(location, hops + 1);
        }
        if (status != 200) {
            connection.disconnect();
            throw new Exception("HTTP " + status);
        }
        return connection;
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    /** Opens "Install unknown apps" for this app (a one-time switch Android requires). */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Opens Android's installer for the downloaded APK. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        File file = new File(path);
        File allowedDir = new File(getContext().getCacheDir(), "apk-updates");
        try {
            if (!file.getCanonicalPath().startsWith(allowedDir.getCanonicalPath() + File.separator) || !file.exists()) {
                call.reject("Unknown update file");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Couldn't open the installer: " + error.getMessage(), error);
        }
    }
}
