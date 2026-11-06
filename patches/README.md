# Dependency patches

Patches applied via pnpm (`patchedDependencies` in `package.json`). They are reapplied
automatically on `pnpm install`.

## `react-native-tcp-socket.patch` (v6.4.3)

**What it fixes:** a native iOS crash (`SIGABRT`):

```
*** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[0]
ParaApp  -[TcpSockets onConnect:]  (TcpSockets.m)
ParaApp  -[TcpSocketClient socket:didConnectToHost:port:]
```

The original crash happened when native callbacks built a connection dictionary
with a nil host after a socket was disconnected. Upstream v6.4.2 now emits an
error from `onConnect:` when either host is missing; v6.4.3 retains that fix.

The rebased patch preserves upstream's `onConnect:` handling and adds the remaining
nil guards to `onListen:` and `onSocketConnection:`. Those callbacks still use raw
host values in upstream v6.4.3. Avalon polling continues to use short-lived TCP
connections through `src/api/avalon.ts`.

**Upstream:** Rapsssito/react-native-tcp-socket#235 (connect fix).

**Removal condition:** delete this patch (and its `patchedDependencies` entry) once an
upstream release nil-guards the connect/listen/connection event dictionaries. On any
`react-native-tcp-socket` upgrade, re-check `ios/TcpSockets.m` `onConnect:` /
`onListen:` / `onSocketConnection:`; if upstream now coalesces `localHost`/
`connectedHost`, drop the patch — otherwise re-create it against the new version
(`pnpm patch react-native-tcp-socket`).

## Android widget deletion fix — upstream

`react-native-android-widget` now includes the null guard for missing widget image
folders (upstream v0.21.0). The app uses v0.26.0, and the redundant local patch has
been removed after checking `RNWidgetImageProvider.deleteImages()`.
