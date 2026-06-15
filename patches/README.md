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
