# Dependency patches

Patches applied via pnpm (`patchedDependencies` in `package.json`). They are reapplied
automatically on `pnpm install`.

## `react-native-tcp-socket.patch` (v6.4.1)

**What it fixes:** a native iOS crash (`SIGABRT`):

```
*** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[0]
ParaApp  -[TcpSockets onConnect:]  (TcpSockets.m)
ParaApp  -[TcpSocketClient socket:didConnectToHost:port:]
```

`ios/TcpSockets.m` builds the `connect` / `listening` / `connection` event dictionaries
with `[socket localHost]` and `[socket connectedHost]` and **no nil-guard**. Those
methods can return `nil` when the connect callback fires after the socket state was torn
down — notably on a background→foreground transition while a connection is in flight.
Inserting `nil` into an `NSDictionary` literal aborts the process.

We hit this through `src/api/avalon.ts` (Canaan Avalon CGMiner, TCP port 4028), which
opens many short-lived connections during miner discovery and polling. The patch
coalesces the host fields to `@""` in `onConnect:`, `onListen:`, and
`onSocketConnection:`.

**Upstream:** Rapsssito/react-native-tcp-socket#127 (open as of the 6.4.1 patch — the
library does not nil-guard these dictionaries).

**Removal condition:** delete this patch (and its `patchedDependencies` entry) once an
upstream release nil-guards the connect/listen/connection event dictionaries. On any
`react-native-tcp-socket` upgrade, re-check `ios/TcpSockets.m` `onConnect:` /
`onListen:` / `onSocketConnection:`; if upstream now coalesces `localHost`/
`connectedHost`, drop the patch — otherwise re-create it against the new version
(`pnpm patch react-native-tcp-socket`).

## `react-native-android-widget.patch` (v0.20.3)

**What it fixes:** a native Android `NullPointerException` when a widget is removed from
the home screen:

```
java.lang.NullPointerException
  java.util.Objects.requireNonNull(Objects.java:207)
  com.reactnativeandroidwidget.RNWidgetImageProvider.deleteImages(RNWidgetImageProvider.java:81)
  com.reactnativeandroidwidget.RNWidgetProvider.onDeleted(RNWidgetProvider.java:71)
```

`RNWidgetImageProvider.deleteImages()` calls `folder.listFiles(...)` on the
`widget_images/` cache directory and wraps the result in `Objects.requireNonNull(files)`.
`listFiles()` returns `null` — not an empty array — when the folder is absent or
unreadable. That happens when a widget is deleted before any render wrote an image, after
app data is cleared, and under the Android 16 behavior in the upstream report.

This matters more than a stray cache-cleanup failure: `deleteImages` runs inside
`AppWidgetProvider.onDeleted`, which executes on the app's **main process**, and it runs
*before* `RNWidgetJsCommunication.startBackgroundTask(...)`. So the NPE both crashes the
app process and prevents the `WIDGET_DELETED` headless task from ever running.

The patch null-guards `files` (early-return) and drops the now-unused `java.util.Objects`
import. Both our Android widgets are text-only, but the library still renders every widget
to a PNG (`RNWidget.saveBitmapToDisk`, light + dark), so `widget_images/` normally exists
and the crash is conditional rather than universal.

**Upstream:** sAleksovski/react-native-android-widget#143 (open as of 0.20.3, which is the
latest release — the unsafe `requireNonNull` is still present).

**Removal condition:** delete this patch (and its `patchedDependencies` entry) once an
upstream release null-guards `deleteImages`. On any `react-native-android-widget` upgrade,
re-check `android/src/main/java/com/reactnativeandroidwidget/RNWidgetImageProvider.java`;
if upstream now handles `listFiles() == null`, drop the patch — otherwise re-create it
against the new version (`pnpm patch react-native-android-widget`).
