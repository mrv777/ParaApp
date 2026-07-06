/**
 * Self-contained admin console for the chat. Served (unauthenticated) at
 * GET /chat/admin; the secret entered here is sent as X-Admin-Secret on every
 * ADMIN_SECRET-guarded /chat/admin/* call and cached in sessionStorage so a
 * refresh doesn't drop the session (cleared when the tab closes or on logout).
 *
 * Everything is inline (no build step, no external assets/fonts — the page is
 * returned as one string): a terminal-styled, tabbed console with toast
 * feedback and a custom (non-blocking) confirm/prompt modal. Tabs:
 *   - Announcement  banner editor + live readout + char counter
 *   - Nicknames     assign/clear handles + a list of current handles
 *   - Messages      recent-message browser (open /chat/history read) with
 *                   client-side filter + per-row delete / ban-sender /
 *                   set-nickname / copy-id (the moderation actions run through
 *                   message-id endpoints so full addresses stay server-side)
 *   - Reports       the report queue + optional 20s auto-refresh
 *   - Bans          list + unban + manual ban-by-address
 *
 * Security posture: the page HTML is public; every mutating call requires the
 * secret. All dynamic values are HTML-escaped via esc(); dynamic rows use
 * delegated handlers (no inline JS built from data).
 */
export function adminPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>chat/admin</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #000; --panel: #0a0a0b; --panel2: #111114;
    --line: rgba(255,255,255,.14); --line2: rgba(255,255,255,.07);
    --text: #f4f4f5; --muted: #7d7d82; --dim: #55555a;
    --danger: #ff5247; --warn: #facc15; --ok: #4ade80;
    --mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 13px/1.6 var(--mono);
    -webkit-font-smoothing: antialiased; min-height: 100vh;
  }
  /* faint scanline texture for the terminal feel — kept subtle for legibility */
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 999;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,.016) 0 1px, transparent 1px 3px);
  }
  a { color: inherit; }
  strong { font-weight: 600; }

  header {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap;
    padding: 12px 18px;
    background: rgba(0,0,0,.86); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .brand {
    display: flex; align-items: center; gap: 9px;
    font-weight: 600; letter-spacing: .12em; text-transform: uppercase; font-size: 12px;
    white-space: nowrap;
  }
  .brand .mark { color: var(--danger); letter-spacing: -.1em; font-size: 14px; }
  .brand .slash { color: var(--dim); }
  .led {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--dim); transition: .3s; margin-left: 2px;
  }
  .led.on { background: var(--ok); box-shadow: 0 0 9px 1px rgba(74,222,128,.6); animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .auth { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; justify-content: flex-end; flex-wrap: wrap; }
  #secret { flex: 1 1 200px; min-width: 0; max-width: 300px; }
  #status { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .online { display: none; align-items: center; gap: 5px; color: var(--muted); font-size: 11px; letter-spacing: .06em; white-space: nowrap; }
  .online.on { display: inline-flex; }
  .online .dot { color: var(--ok); font-size: 8px; }

  main { max-width: 920px; margin: 0 auto; padding: 22px 18px 90px; }

  .tabs { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
  .tab {
    appearance: none; background: none; border: 1px solid transparent; border-bottom: none;
    color: var(--muted); padding: 9px 15px; font: inherit; cursor: pointer;
    text-transform: lowercase; letter-spacing: .04em; position: relative; top: 1px;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--text); border-color: var(--line); background: var(--panel); }
  .badge {
    margin-left: 8px; display: inline-block; min-width: 17px; padding: 0 5px;
    background: var(--danger); color: #000; font-size: 10px; font-weight: 700;
    text-align: center; vertical-align: middle;
  }

  .panel { display: none; }
  .panel.active { display: block; animation: fade .2s ease; }
  @keyframes fade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

  .eyebrow { color: var(--dim); font-size: 12px; margin: 0 0 12px; }
  .subhead {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin: 22px 0 10px; color: var(--muted); text-transform: uppercase;
    letter-spacing: .06em; font-size: 11px; border-top: 1px solid var(--line2); padding-top: 15px;
  }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  input[type=text], input[type=password], textarea {
    background: var(--panel); color: var(--text); border: 1px solid var(--line);
    padding: 9px 11px; font: inherit; border-radius: 0; outline: none;
  }
  input[type=text]:focus, input[type=password]:focus, textarea:focus { border-color: rgba(255,255,255,.42); }
  input::placeholder, textarea::placeholder { color: var(--dim); }
  textarea { width: 100%; resize: vertical; }
  input, button { max-width: 100%; }

  select {
    background: var(--panel); color: var(--text); border: 1px solid var(--line);
    padding: 8px 10px; font: inherit; border-radius: 0; outline: none; cursor: pointer;
  }
  select:focus { border-color: rgba(255,255,255,.42); }

  button {
    background: var(--panel); color: var(--text); border: 1px solid var(--line);
    padding: 8px 14px; font: inherit; cursor: pointer; border-radius: 0;
    text-transform: lowercase; letter-spacing: .02em; transition: background .12s, border-color .12s;
  }
  button:hover { background: var(--panel2); border-color: rgba(255,255,255,.36); }
  button:disabled { opacity: .4; cursor: not-allowed; }
  button.primary { border-color: rgba(255,255,255,.5); }
  button.danger { border-color: rgba(255,82,71,.55); color: var(--danger); }
  button.danger:hover { background: rgba(255,82,71,.12); border-color: var(--danger); }
  button.mini { padding: 4px 9px; font-size: 11px; }

  .check { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; cursor: pointer; user-select: none; }
  .check input { accent-color: var(--danger); }

  .card { border: 1px solid var(--line); background: var(--panel); padding: 13px 14px; margin: 0 0 10px; }
  .card .meta { display: flex; gap: 8px 10px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; }
  .card .body { background: #000; border-left: 2px solid var(--line); padding: 9px 11px; margin: 9px 0; white-space: pre-wrap; word-break: break-word; }
  .card .addr { color: var(--dim); font-size: 11.5px; word-break: break-all; margin-top: 2px; }
  .card .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .copy { cursor: pointer; border-bottom: 1px dotted var(--line); }
  .copy:hover { color: var(--text); }
  .ok-mark { color: var(--ok); }
  .dim { color: var(--dim); }

  .chip { display: inline-block; padding: 1px 7px; border: 1px solid var(--line); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .chip.warn { color: var(--warn); border-color: rgba(250,204,21,.4); }
  .chip.plain { color: var(--dim); }
  .chip.ban { color: var(--danger); border-color: rgba(255,82,71,.4); }

  .live { margin-top: 14px; padding: 10px 12px; border: 1px dashed var(--line); font-size: 12.5px; word-break: break-word; }
  .live.off { color: var(--dim); }
  .empty { color: var(--dim); font-size: 12.5px; padding: 12px 0; }

  .gate { padding: 72px 18px; text-align: center; color: var(--muted); }
  .gate .m { font-size: 30px; letter-spacing: .25em; color: var(--danger); margin-bottom: 16px; opacity: .85; }
  .gate .t { color: var(--text); }

  #toasts { position: fixed; top: 14px; right: 14px; z-index: 200; display: flex; flex-direction: column; gap: 8px; max-width: min(340px, 92vw); }
  .toast {
    display: flex; align-items: flex-start; gap: 10px;
    border: 1px solid var(--line); border-left-width: 3px; background: var(--panel2);
    padding: 10px 13px; font-size: 12.5px; word-break: break-word;
    box-shadow: 0 10px 30px rgba(0,0,0,.55); animation: tIn .2s ease;
  }
  .toast-msg { flex: 1 1 auto; }
  .toast-x { flex: 0 0 auto; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; font: inherit; line-height: 1.3; }
  .toast-x:hover { color: var(--text); }
  .toast.ok { border-left-color: var(--ok); }
  .toast.err { border-left-color: var(--danger); }
  .toast.out { animation: tOut .25s ease forwards; }
  @keyframes tIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
  @keyframes tOut { to { opacity: 0; transform: translateX(14px); } }

  #modal { position: fixed; inset: 0; z-index: 300; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.72); backdrop-filter: blur(2px); padding: 18px; }
  #modal.show { display: flex; }
  #modalBox { width: min(430px, 100%); border: 1px solid var(--line); background: var(--panel); padding: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.6); animation: tIn .16s ease; }
  #modalBox h3 { margin: 0 0 9px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
  #modalBox p { margin: 0 0 15px; color: var(--muted); font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
  #modalBox input { width: 100%; margin-bottom: 15px; }
  #modalBox select { width: 100%; margin-bottom: 12px; }
  .mlabel { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .modal-acts { display: flex; justify-content: flex-end; gap: 8px; }

  /* Soft-deleted rows in the admin message search (undelete available). */
  .card.deleted { opacity: .6; }
  .card.deleted .body { text-decoration: line-through; text-decoration-color: var(--dim); }
</style>
</head>
<body>
<div id="toasts"></div>
<div id="modal"><div id="modalBox"></div></div>

<header>
  <div class="brand"><span class="mark">&#9622;&#9630;</span> chat<span class="slash">/</span>admin <span id="led" class="led"></span></div>
  <span id="online" class="online" title="viewers connected to chat"></span>
  <div class="auth">
    <input id="secret" type="password" placeholder="ADMIN_SECRET" autocomplete="off" spellcheck="false" />
    <button id="loginBtn" class="primary" onclick="login()">connect</button>
    <button id="logoutBtn" onclick="logout()" style="display:none">disconnect</button>
    <span id="status"></span>
  </div>
</header>

<div id="gate" class="gate">
  <div class="m">&#9622;&#9630;</div>
  <div>enter the <span class="t">ADMIN_SECRET</span> above and connect</div>
</div>

<main id="console" style="display:none">
  <nav class="tabs">
    <button class="tab active" data-tab="announcement" onclick="showTab('announcement')">announcement</button>
    <button class="tab" data-tab="nicknames" onclick="showTab('nicknames')">nicknames</button>
    <button class="tab" data-tab="messages" onclick="showTab('messages')">messages</button>
    <button class="tab" data-tab="reports" onclick="showTab('reports')">reports<span id="reportsBadge" class="badge" style="display:none">0</span></button>
    <button class="tab" data-tab="bans" onclick="showTab('bans')">bans<span id="bansBadge" class="badge" style="display:none">0</span></button>
    <button class="tab" data-tab="audit" onclick="showTab('audit')">audit</button>
  </nav>

  <section id="tab-announcement" class="panel active">
    <div class="eyebrow">// banner shown at the top of chat for everyone (max 280 chars)</div>
    <textarea id="ann" rows="3" maxlength="280" placeholder="Welcome to Parasite Chat…"></textarea>
    <div class="row" style="justify-content:space-between;margin-top:7px">
      <div class="row"><button class="primary" onclick="saveAnn()">save</button><button class="danger" onclick="clearAnn()">clear</button></div>
      <span id="annCount" class="eyebrow" style="margin:0">0/280</span>
    </div>
    <div id="annLive" class="live off"><span class="dim">live:</span> —</div>
  </section>

  <section id="tab-nicknames" class="panel">
    <div class="eyebrow">// set an authoritative handle for an address. official = locked (users can't take or overwrite it). blank name clears it.</div>
    <div class="row">
      <input id="nickAddr" type="text" placeholder="address" style="flex:1 1 260px" />
      <input id="nickName" type="text" placeholder="nickname (blank = clear)" maxlength="24" style="flex:1 1 150px" />
      <label class="check"><input id="nickOfficial" type="checkbox" checked /> official</label>
      <button class="primary" onclick="assignNick()">assign</button>
    </div>
    <div class="subhead"><span>assigned handles</span><button class="mini" onclick="loadProfiles()">refresh</button></div>
    <div id="profiles"></div>
  </section>

  <section id="tab-messages" class="panel">
    <div class="row">
      <input id="msgQuery" type="text" placeholder="search text across all history…" style="flex:1 1 200px" />
      <input id="msgAddr" type="text" placeholder="sender address (optional)" style="flex:1 1 200px" />
      <label class="check"><input id="msgDeleted" type="checkbox" /> incl. deleted</label>
      <button class="mini primary" onclick="runSearch()">search</button>
      <button class="mini" onclick="loadMessages()">live</button>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="delId" type="text" placeholder="delete by message id" style="flex:1 1 260px" />
      <button class="mini danger" onclick="delById()">delete by id</button>
    </div>
    <div id="msgMode" class="eyebrow" style="margin-top:9px">// live — newest messages, updating in real time</div>
    <div id="messages"></div>
    <div class="row" style="justify-content:center;margin-top:4px"><button id="loadOlder" class="mini" style="display:none" onclick="loadOlder()">load older</button></div>
  </section>

  <section id="tab-reports" class="panel">
    <div class="row" style="justify-content:space-between">
      <button class="mini" onclick="loadReports()">refresh</button>
      <label class="check"><input id="autoReports" type="checkbox" onchange="toggleAutoReports()" /> auto-refresh (20s)</label>
    </div>
    <div id="reports" style="margin-top:12px"></div>
  </section>

  <section id="tab-bans" class="panel">
    <div class="eyebrow">// banned addresses are rejected at session + post time. unban to lift. temp bans self-expire.</div>
    <div class="row">
      <input id="banAddr" type="text" placeholder="address" style="flex:1 1 220px" />
      <input id="banReason" type="text" placeholder="reason (optional)" style="flex:1 1 130px" />
      <select id="banDuration">
        <option value="">permanent</option>
        <option value="3600">1 hour</option>
        <option value="21600">6 hours</option>
        <option value="86400">24 hours</option>
        <option value="604800">7 days</option>
        <option value="2592000">30 days</option>
      </select>
      <label class="check"><input id="banPurge" type="checkbox" /> purge msgs</label>
      <button class="danger" onclick="banManual()">ban</button>
    </div>
    <div class="subhead"><span>current bans</span><button class="mini" onclick="loadBans()">refresh</button></div>
    <div id="bans"></div>
  </section>

  <section id="tab-audit" class="panel">
    <div class="row" style="justify-content:space-between">
      <div class="eyebrow" style="margin:0">// recent moderation actions (90-day retention)</div>
      <button class="mini" onclick="loadAudit()">refresh</button>
    </div>
    <div id="audit" style="margin-top:12px"></div>
  </section>
</main>

<script>
  var SS_KEY = 'parasite_admin_secret';
  var loggedIn = false;

  function el(id) { return document.getElementById(id); }
  function secret() { return el('secret').value; }
  function setStatus(m) { el('status').textContent = m || ''; }
  function setLed(on) { el('led').classList.toggle('on', !!on); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[c];
    });
  }
  function fmtSec(s) { return new Date(s * 1000).toLocaleString(); }
  function fmtMs(ms) { return new Date(ms).toLocaleString(); }
  function shortAddr(a) { a = String(a || ''); return a.length > 20 ? a.slice(0, 10) + '…' + a.slice(-6) : a; }

  function toast(msg, kind) {
    var isErr = kind === 'err';
    // Errors persist until dismissed; de-dupe so a repeating failure (e.g. an
    // auto-refresh hitting the same network error) can't stack indefinitely.
    if (isErr) {
      var open = el('toasts').querySelectorAll('.toast.err');
      for (var i = 0; i < open.length; i++) if (open[i].dataset.msg === msg) return;
    }
    var t = document.createElement('div');
    t.className = 'toast ' + (isErr ? 'err' : 'ok');
    if (isErr) t.dataset.msg = msg;
    var span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = msg;
    t.appendChild(span);
    function dismiss() { t.classList.add('out'); setTimeout(function () { t.remove(); }, 250); }
    if (isErr) {
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'toast-x';
      x.setAttribute('aria-label', 'dismiss');
      x.textContent = '✕';
      x.onclick = dismiss;
      t.appendChild(x);
    } else {
      setTimeout(dismiss, 3200);
    }
    el('toasts').appendChild(t);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('copied'); }, function () { toast('copy failed', 'err'); });
    } else { toast('clipboard unavailable', 'err'); }
  }

  // ---- Non-blocking modal (replaces confirm/prompt so nothing freezes) -------
  var modalResolve = null;
  function closeModal(val) {
    el('modal').classList.remove('show');
    var r = modalResolve; modalResolve = null;
    if (r) r(val);
  }
  function openModal(opts) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      var hasInput = !!opts.input;
      var html = '<h3>' + esc(opts.title || 'Confirm') + '</h3>';
      if (opts.message) html += '<p>' + esc(opts.message) + '</p>';
      if (hasInput) html += '<input id="modalInput" type="text" placeholder="' + esc(opts.input.placeholder || '') + '" maxlength="' + (opts.input.maxlength || 200) + '" />';
      html += '<div class="modal-acts"><button id="modalCancel">cancel</button>' +
        '<button id="modalOk" class="' + (opts.danger ? 'danger' : 'primary') + '">' + esc(opts.confirmLabel || 'confirm') + '</button></div>';
      el('modalBox').innerHTML = html;
      el('modal').classList.add('show');
      var input = el('modalInput');
      el('modalCancel').onclick = function () { closeModal(false); };
      el('modalOk').onclick = function () { closeModal(hasInput ? input.value : true); };
      if (input) {
        input.value = opts.input.value || '';
        input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); closeModal(input.value); } };
        setTimeout(function () { input.focus(); }, 30);
      }
    });
  }
  function confirmAction(title, message, danger) { return openModal({ title: title, message: message, danger: danger, confirmLabel: danger ? 'confirm' : 'ok' }); }
  function promptAction(title, message, value, maxlength) { return openModal({ title: title, message: message, input: { value: value, maxlength: maxlength }, confirmLabel: 'save' }); }

  // Purpose-built ban modal: pick a duration (blank = permanent) and whether to
  // purge the sender's messages. Resolves { durationSec, purge } on confirm, or a
  // falsy value on cancel / backdrop / Escape (callers guard with "if (!opts)").
  function openBanModal(title, message) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      el('modalBox').innerHTML =
        '<h3>' + esc(title) + '</h3>' +
        (message ? '<p>' + esc(message) + '</p>' : '') +
        '<label class="mlabel">duration</label>' +
        '<select id="banModalDur">' +
          '<option value="">permanent</option>' +
          '<option value="3600">1 hour</option>' +
          '<option value="21600">6 hours</option>' +
          '<option value="86400">24 hours</option>' +
          '<option value="604800">7 days</option>' +
          '<option value="2592000">30 days</option>' +
        '</select>' +
        '<label class="check" style="margin-bottom:14px"><input id="banModalPurge" type="checkbox" /> also delete all their messages</label>' +
        '<div class="modal-acts"><button id="modalCancel">cancel</button>' +
        '<button id="modalOk" class="danger">ban</button></div>';
      el('modal').classList.add('show');
      el('modalCancel').onclick = function () { closeModal(null); };
      el('modalOk').onclick = function () {
        var dur = el('banModalDur').value;
        closeModal({ durationSec: dur ? parseInt(dur, 10) : null, purge: el('banModalPurge').checked });
      };
    });
  }

  // A 401 on any call while logged in means the secret was rotated (or the
  // worker redeployed) — the LED shouldn't keep claiming "connected". Drop the
  // session once and prompt to reconnect; guard so concurrent calls don't stack.
  var sessionExpired = false;
  function handleUnauthorized() {
    if (sessionExpired || !loggedIn) return;
    sessionExpired = true;
    sessionStorage.removeItem(SS_KEY);
    stopAutoReports();
    disconnectLive();
    setLoggedIn(false);
    setStatus('session expired');
    toast('session expired — reconnect', 'err');
    el('secret').disabled = false;
    el('secret').focus();
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'X-Admin-Secret': secret(), 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      if (res.status === 401) handleUnauthorized();
      return res;
    });
  }

  // ---- Auth -----------------------------------------------------------------
  function setLoggedIn(v) {
    loggedIn = v;
    if (v) sessionExpired = false;
    el('console').style.display = v ? 'block' : 'none';
    el('gate').style.display = v ? 'none' : 'block';
    el('logoutBtn').style.display = v ? 'inline-block' : 'none';
    el('loginBtn').style.display = v ? 'none' : 'inline-block';
    el('secret').disabled = v;
    setLed(v);
  }

  async function login() {
    if (!secret()) { toast('enter the admin secret', 'err'); el('secret').focus(); return; }
    setStatus('connecting…');
    var res;
    try { res = await api('/chat/admin/reports'); }
    catch (e) { setStatus('offline'); toast('network error', 'err'); setLoggedIn(false); return; }
    if (!res.ok) { setStatus('offline'); toast(res.status === 401 ? 'wrong secret' : 'error ' + res.status, 'err'); setLoggedIn(false); return; }
    sessionStorage.setItem(SS_KEY, secret());
    setLoggedIn(true);
    setStatus('connected');
    connectLive();
    var j = await res.json();
    renderReports((j.data && j.data.reports) || []);
    loadAnnouncement(); loadProfiles(); loadMessages(); loadBans();
  }

  function logout() {
    sessionStorage.removeItem(SS_KEY);
    stopAutoReports();
    disconnectLive();
    el('secret').disabled = false;
    el('secret').value = '';
    setLoggedIn(false);
    setStatus('disconnected');
    ['messages', 'reports', 'bans', 'profiles', 'audit'].forEach(function (id) { if (el(id)) el(id).innerHTML = ''; });
    setBadge('reportsBadge', 0); setBadge('bansBadge', 0);
    loadedMessages = []; oldestTs = null; oldestId = null; searchMode = false;
    el('secret').focus();
  }

  // ---- Live feed (anonymous read-only WS) -----------------------------------
  // Opens the same public /chat/ws that viewers use (no token = read-only), so
  // the messages tab tails the room live and the header shows who's connected.
  // The admin secret never rides on this socket — it only receives the public
  // presence / msg / delete / announcement broadcasts the app already sends.
  var liveWs = null, liveRetry = null, livePing = null, liveWant = false;
  function liveWsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/chat/ws';
  }
  function setOnline(n) {
    var e = el('online');
    if (typeof n !== 'number' || n < 0) { e.classList.remove('on'); e.textContent = ''; return; }
    e.innerHTML = '<span class="dot">&#9679;</span> ' + n + ' online';
    e.classList.add('on');
  }
  function connectLive() {
    liveWant = true;
    if (liveWs && (liveWs.readyState === 0 || liveWs.readyState === 1)) return;
    var ws;
    try { ws = new WebSocket(liveWsUrl()); }
    catch (e) { return; }
    liveWs = ws;
    ws.onopen = function () {
      // App-level heartbeat: the runtime auto-answers 'ping'→'pong' without
      // waking the DO, so an idle admin socket isn't reaped.
      clearInterval(livePing);
      livePing = setInterval(function () { try { ws.send('ping'); } catch (e) {} }, 25000);
    };
    ws.onmessage = function (ev) {
      if (ev.data === 'pong') return;
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'presence') setOnline(m.online);
      else if (m.type === 'msg') onLiveMessage(m);
      else if (m.type === 'delete') onLiveDelete(m.id);
      else if (m.type === 'announcement') setAnnLive(m.body || '');
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onclose = function () {
      clearInterval(livePing); livePing = null;
      if (liveWs === ws) { liveWs = null; setOnline(-1); }
      if (liveWant) { clearTimeout(liveRetry); liveRetry = setTimeout(connectLive, 3000); }
    };
  }
  function disconnectLive() {
    liveWant = false;
    clearTimeout(liveRetry); liveRetry = null;
    clearInterval(livePing); livePing = null;
    setOnline(-1);
    if (liveWs) { try { liveWs.close(); } catch (e) {} liveWs = null; }
  }
  function onLiveMessage(m) {
    if (!m.id || searchMode) return; // don't pollute a search view with live msgs
    for (var i = 0; i < loadedMessages.length; i++) if (loadedMessages[i].id === m.id) return;
    loadedMessages.unshift(m); // history is newest-first, so live messages go on top
    if (loadedMessages.length > 500) loadedMessages = loadedMessages.slice(0, 500);
    renderMessages();
  }
  function onLiveDelete(id) {
    // In a search view a deleted row stays visible (flagged); in the live view it
    // is dropped.
    if (searchMode) { if (markDeletedLocal(id, true)) renderMessages(); return; }
    var before = loadedMessages.length;
    loadedMessages = loadedMessages.filter(function (m) { return m.id !== id; });
    if (loadedMessages.length !== before) renderMessages();
  }

  // ---- Tabs -----------------------------------------------------------------
  function showTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === name);
    var panels = document.querySelectorAll('.panel');
    for (var k = 0; k < panels.length; k++) panels[k].classList.toggle('active', panels[k].id === 'tab-' + name);
    if (name === 'audit') loadAudit(); // lazily loaded on first/each open
  }

  // ---- Announcement ---------------------------------------------------------
  function updateAnnCount() { el('annCount').textContent = el('ann').value.length + '/280'; }
  function setAnnLive(val) {
    var e = el('annLive');
    if (val) { e.innerHTML = '<span class="dim">live:</span> ' + esc(val); e.classList.remove('off'); }
    else { e.innerHTML = '<span class="dim">live:</span> none'; e.classList.add('off'); }
  }
  async function loadAnnouncement() {
    try {
      var a = await fetch('/chat/announcement');
      if (a.ok) { var j = await a.json(); var v = (j.data && j.data.announcement) || ''; el('ann').value = v; updateAnnCount(); setAnnLive(v); }
    } catch (e) { /* ignore */ }
  }
  async function saveAnn() {
    var body = el('ann').value.trim();
    if (!body) { toast('empty — use clear to remove', 'err'); return; }
    if (!(await confirmAction('Broadcast announcement', 'Show this banner to everyone in chat right now?', false))) return;
    var res;
    try { res = await api('/chat/admin/announcement', { method: 'POST', body: JSON.stringify({ body: body }) }); }
    catch (e) { toast('network error', 'err'); return; }
    // Re-read the stored value so the "live:" readout reflects what actually
    // persisted (the server trims/normalizes) rather than just the local draft.
    if (res.ok) { toast('announcement saved'); loadAnnouncement(); } else toast('save failed ' + res.status, 'err');
  }
  async function clearAnn() {
    if (!(await confirmAction('Clear announcement', 'Remove the banner for everyone?', true))) return;
    var res;
    try { res = await api('/chat/admin/announcement', { method: 'DELETE' }); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.ok) { el('ann').value = ''; updateAnnCount(); setAnnLive(''); toast('announcement cleared'); } else toast('clear failed ' + res.status, 'err');
  }

  // ---- Nicknames ------------------------------------------------------------
  function profileRow(p) {
    return '<div class="card">' +
      '<div class="meta"><strong>' + esc(p.nickname) + '</strong>' +
        (p.official ? '<span class="chip">official</span>' : '<span class="chip plain">plain</span>') +
        '<span class="dim">' + fmtSec(p.updated_at) + '</span></div>' +
      '<div class="addr"><span class="copy" data-copy="' + esc(p.address) + '" title="copy address">' + esc(shortAddr(p.address)) + '</span></div>' +
      '<div class="acts">' +
        '<button class="mini" data-act="editnick" data-addr="' + esc(p.address) + '" data-name="' + esc(p.nickname) + '" data-official="' + (p.official ? '1' : '0') + '">edit</button>' +
        '<button class="mini danger" data-act="clearnick" data-addr="' + esc(p.address) + '" data-name="' + esc(p.nickname) + '">clear</button>' +
      '</div></div>';
  }
  async function loadProfiles() {
    var res;
    try { res = await api('/chat/admin/profiles'); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('profiles error ' + res.status, 'err'); return; }
    var j = await res.json(); var list = (j.data && j.data.profiles) || [];
    el('profiles').innerHTML = list.length ? list.map(profileRow).join('') : '<div class="empty">// no assigned handles</div>';
  }
  async function assignNick() {
    var address = el('nickAddr').value.trim();
    if (!address) { toast('enter an address', 'err'); return; }
    var nickname = el('nickName').value.trim();
    var official = el('nickOfficial').checked;
    if (!nickname && !(await confirmAction('Clear handle', 'Clear the nickname for this address?', true))) return;
    var res;
    try { res = await api('/chat/admin/nickname', { method: 'POST', body: JSON.stringify({ address: address, nickname: nickname, official: official }) }); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.ok) { toast(nickname ? 'nickname assigned' : 'nickname cleared'); el('nickName').value = ''; loadProfiles(); loadMessages(); }
    else { var msg = 'assign failed ' + res.status; try { var jj = await res.json(); if (jj && typeof jj.error === 'string') msg = jj.error; } catch (e) { } toast(msg, 'err'); }
  }
  async function clearNick(addr, name) {
    if (!(await confirmAction('Clear handle', 'Clear "' + name + '"?', true))) return;
    var res;
    try { res = await api('/chat/admin/nickname', { method: 'POST', body: JSON.stringify({ address: addr, nickname: '', official: false }) }); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.ok) { toast('handle cleared'); loadProfiles(); loadMessages(); } else toast('clear failed ' + res.status, 'err');
  }

  // ---- Messages (live /chat/history + admin search + guarded id actions) ----
  var loadedMessages = [];
  var oldestTs = null, oldestId = null;
  // Search mode: viewing /chat/admin/messages results (server-side text/address
  // search, optionally including deleted rows) instead of the live history tail.
  var searchMode = false;
  var searchQ = '', searchAddr = '', searchIncl = false;

  function msgRow(m) {
    var who = m.nickname ? esc(m.nickname) + (m.official ? ' <span class="ok-mark">✓</span>' : '') : esc(shortAddr(m.address));
    var del = !!m.deleted;
    return '<div class="card' + (del ? ' deleted' : '') + '" id="msg-' + esc(m.id) + '">' +
      '<div class="meta"><strong>' + who + '</strong>' + (del ? '<span class="chip">deleted</span>' : '') + '<span class="dim">' + fmtMs(m.ts) + '</span></div>' +
      '<div class="body">' + esc(m.body) + '</div>' +
      '<div class="addr">' + esc(m.address) + ' <span class="dim">· ' + esc(m.id) + '</span></div>' +
      '<div class="acts">' +
        (del
          ? '<button class="mini" data-act="undelete" data-mid="' + esc(m.id) + '">undelete</button>'
          : '<button class="mini danger" data-act="del" data-mid="' + esc(m.id) + '">delete</button>') +
        '<button class="mini danger" data-act="ban" data-mid="' + esc(m.id) + '">ban sender</button>' +
        '<button class="mini" data-act="nick" data-mid="' + esc(m.id) + '" data-name="' + (m.nickname ? esc(m.nickname) : '') + '">set nickname</button>' +
        '<button class="mini" data-act="copyid" data-mid="' + esc(m.id) + '">copy id</button>' +
      '</div></div>';
  }
  function renderMessages() {
    el('messages').innerHTML = loadedMessages.length
      ? loadedMessages.map(msgRow).join('')
      : '<div class="empty">' + (searchMode ? '// no matches' : '// no messages') + '</div>';
  }
  function setMsgMode(text) { el('msgMode').textContent = text; }
  function updateOlderBtn(count) { el('loadOlder').style.display = count >= 50 ? 'inline-block' : 'none'; }

  // Live tail: the public history read (non-deleted, newest-first).
  async function fetchHistory(before, beforeId) {
    var url = '/chat/history?limit=50';
    if (before) { url += '&before=' + encodeURIComponent(before); if (beforeId) url += '&beforeId=' + encodeURIComponent(beforeId); }
    var res;
    try { res = await fetch(url); }
    catch (e) { toast('history network error', 'err'); return null; }
    if (!res.ok) { toast('history error ' + res.status, 'err'); return null; }
    var j = await res.json(); var msgs = (j.data && j.data.messages) || [];
    if (msgs.length) { oldestTs = msgs[msgs.length - 1].ts; oldestId = msgs[msgs.length - 1].id; }
    return msgs;
  }
  // Admin search read (secret-guarded): text and/or sender, optionally deleted.
  async function fetchSearch(before, beforeId) {
    var url = '/chat/admin/messages?limit=50';
    if (searchQ) url += '&q=' + encodeURIComponent(searchQ);
    if (searchAddr) url += '&address=' + encodeURIComponent(searchAddr);
    if (searchIncl) url += '&includeDeleted=1';
    if (before) { url += '&before=' + encodeURIComponent(before); if (beforeId) url += '&beforeId=' + encodeURIComponent(beforeId); }
    var res;
    try { res = await api(url); }
    catch (e) { toast('search network error', 'err'); return null; }
    if (!res.ok) { toast('search error ' + res.status, 'err'); return null; }
    var j = await res.json(); var msgs = (j.data && j.data.messages) || [];
    if (msgs.length) { oldestTs = msgs[msgs.length - 1].ts; oldestId = msgs[msgs.length - 1].id; }
    return msgs;
  }
  async function loadMessages() {
    searchMode = false;
    setMsgMode('// live — newest messages, updating in real time');
    oldestTs = null; oldestId = null;
    var msgs = await fetchHistory(); if (!msgs) return;
    loadedMessages = msgs; updateOlderBtn(msgs.length); renderMessages();
  }
  async function runSearch() {
    var q = el('msgQuery').value.trim();
    var addr = el('msgAddr').value.trim();
    if (!q && !addr) { toast('enter search text or a sender address', 'err'); return; }
    searchMode = true; searchQ = q; searchAddr = addr; searchIncl = el('msgDeleted').checked;
    oldestTs = null; oldestId = null;
    var msgs = await fetchSearch(); if (msgs == null) return;
    loadedMessages = msgs; updateOlderBtn(msgs.length);
    setMsgMode('// search: ' + (msgs.length >= 50 ? '50+' : msgs.length) + ' match' + (msgs.length === 1 ? '' : 'es') + (searchIncl ? ' · incl. deleted' : '') + ' — press “live” to return');
    renderMessages();
  }
  async function loadOlder() {
    if (oldestTs == null) return;
    var msgs = searchMode ? await fetchSearch(oldestTs, oldestId) : await fetchHistory(oldestTs, oldestId);
    if (!msgs) return;
    loadedMessages = loadedMessages.concat(msgs); updateOlderBtn(msgs.length); renderMessages();
  }
  // Reflect a delete/undelete in the loaded list: returns true if a row matched.
  function markDeletedLocal(id, deleted) {
    var hit = false;
    for (var i = 0; i < loadedMessages.length; i++) {
      if (loadedMessages[i].id === id) { loadedMessages[i].deleted = deleted; hit = true; }
    }
    return hit;
  }
  async function delMsg(id) {
    var res;
    try { res = await api('/chat/admin/message/' + encodeURIComponent(id), { method: 'DELETE' }); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('delete failed ' + res.status, 'err'); return; }
    var j = await res.json();
    // In search mode keep the row visible (flagged deleted, with undelete); in
    // the live view drop it.
    if (searchMode) markDeletedLocal(id, true);
    else loadedMessages = loadedMessages.filter(function (m) { return m.id !== id; });
    renderMessages();
    toast(j.data && j.data.deleted ? 'message deleted' : 'already deleted');
  }
  async function undeleteMsg(id) {
    var res;
    try { res = await api('/chat/admin/message/' + encodeURIComponent(id) + '/undelete', { method: 'POST' }); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('undelete failed ' + res.status, 'err'); return; }
    var j = await res.json();
    if (j.data && j.data.undeleted) { markDeletedLocal(id, false); renderMessages(); toast('message restored'); }
    else toast('not deleted', 'err');
  }
  async function banMsg(id, opts) {
    opts = opts || {};
    var body = { purge: !!opts.purge };
    if (opts.durationSec) body.durationSec = opts.durationSec;
    var res;
    try { res = await api('/chat/admin/message/' + encodeURIComponent(id) + '/ban', { method: 'POST', body: JSON.stringify(body) }); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast(res.status === 404 ? 'sender not found' : 'ban failed ' + res.status, 'err'); return; }
    var j = await res.json(); var d = j.data || {};
    toast('sender banned' + (d.purged ? ' · purged ' + d.purged : ''));
    loadBans();
  }
  async function setMsgNick(id, name) {
    name = name.trim();
    var res;
    try { res = await api('/chat/admin/message/' + encodeURIComponent(id) + '/nickname', { method: 'POST', body: JSON.stringify({ nickname: name, official: !!name }) }); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.ok) { toast(name ? 'nickname assigned' : 'nickname cleared'); loadProfiles(); refreshMessageView(); }
    else { var msg = 'assign failed ' + res.status; try { var jj = await res.json(); if (jj && typeof jj.error === 'string') msg = jj.error; } catch (e) { } toast(msg, 'err'); }
  }
  // Reload whichever message view is active (so a nickname change re-renders).
  // In search mode re-run with the stored params (not the input fields, which the
  // operator may have edited since).
  async function refreshMessageView() {
    if (!searchMode) { loadMessages(); return; }
    oldestTs = null; oldestId = null;
    var msgs = await fetchSearch(); if (msgs == null) return;
    loadedMessages = msgs; updateOlderBtn(msgs.length); renderMessages();
  }
  async function delById() {
    var id = el('delId').value.trim();
    if (!id) { toast('enter a message id', 'err'); return; }
    // Preview the message first so a mistyped id can't nuke the wrong one.
    var res;
    try { res = await api('/chat/admin/message/' + encodeURIComponent(id)); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.status === 404) { toast('no message with that id', 'err'); return; }
    if (!res.ok) { toast('lookup failed ' + res.status, 'err'); return; }
    var j = await res.json(); var m = j.data && j.data.message;
    if (!m) { toast('no message with that id', 'err'); return; }
    if (m.deleted) { toast('already deleted', 'err'); return; }
    if (!(await confirmAction('Delete message', 'Delete this message?\\n\\n' + (m.nickname || m.address) + ': ' + m.body, true))) return;
    await delMsg(id);
    el('delId').value = '';
  }

  // ---- Reports --------------------------------------------------------------
  function setBadge(id, n) { var b = el(id); if (!b) return; b.textContent = n; b.style.display = n > 0 ? 'inline-block' : 'none'; }
  // Collapse multiple reports of the same message into one card, so a pile-on
  // shows as "report ×N" with every reporter rather than N rows to triage.
  function groupReports(reports) {
    var map = {}, order = [];
    reports.forEach(function (r) {
      var k = r.message_id, g = map[k];
      if (!g) { g = map[k] = { message_id: k, body: r.body, message_address: r.message_address, created_at: r.created_at, ids: [], reporters: [], reasons: [] }; order.push(k); }
      g.ids.push(r.id);
      g.reporters.push(r.reporter);
      if (r.reason) g.reasons.push(r.reason);
      if (r.created_at < g.created_at) g.created_at = r.created_at; // oldest report in the group
      if (g.body == null && r.body != null) g.body = r.body;
      if (!g.message_address && r.message_address) g.message_address = r.message_address;
    });
    return order.map(function (k) { return map[k]; });
  }
  function reportRow(g) {
    var n = g.ids.length, rids = g.ids.join(',');
    return '<div class="card" id="report-' + esc(g.message_id) + '">' +
      '<div class="meta"><span class="chip warn">report' + (n > 1 ? ' &#215;' + n : '') + '</span><span class="dim">' + fmtSec(g.created_at) + '</span>' +
        (g.reasons.length ? '<span class="dim">reason: ' + esc(g.reasons.join(' · ')) + '</span>' : '') + '</div>' +
      '<div class="body">' + (g.body == null ? '<span class="dim">[message deleted or missing]</span>' : esc(g.body)) + '</div>' +
      '<div class="addr">sender: ' + (esc(g.message_address) || '—') + '</div>' +
      '<div class="addr">' + (n > 1 ? 'reporters (' + n + '): ' : 'reporter: ') + esc(g.reporters.join(', ')) + '</div>' +
      '<div class="acts">' +
        '<button class="mini danger" data-act="del" data-mid="' + esc(g.message_id) + '" data-rids="' + esc(rids) + '">delete message</button>' +
        '<button class="mini danger" data-act="ban" data-addr="' + esc(g.message_address) + '" data-rids="' + esc(rids) + '" ' + (g.message_address ? '' : 'disabled') + '>ban sender</button>' +
        '<button class="mini" data-act="resolve" data-rids="' + esc(rids) + '">dismiss' + (n > 1 ? ' all' : '') + '</button>' +
      '</div></div>';
  }
  function renderReports(reports) {
    setBadge('reportsBadge', reports.length);
    var groups = groupReports(reports);
    el('reports').innerHTML = groups.length ? groups.map(reportRow).join('') : '<div class="empty">// no open reports</div>';
  }
  async function loadReports() {
    var res;
    try { res = await api('/chat/admin/reports'); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('reports error ' + res.status, 'err'); return; }
    var j = await res.json(); renderReports((j.data && j.data.reports) || []);
  }
  // Resolve every report id in a group (best-effort); callers reload the queue.
  function resolveRids(rids) {
    return Promise.all(rids.map(function (rid) {
      return api('/chat/admin/reports/' + encodeURIComponent(rid) + '/resolve', { method: 'POST' }).catch(function () {});
    }));
  }
  var reportsTimer = null;
  function toggleAutoReports() {
    if (el('autoReports').checked) { reportsTimer = setInterval(loadReports, 20000); toast('auto-refresh on'); }
    else stopAutoReports();
  }
  function stopAutoReports() { if (reportsTimer) { clearInterval(reportsTimer); reportsTimer = null; } var cb = el('autoReports'); if (cb) cb.checked = false; }

  // ---- Bans -----------------------------------------------------------------
  function banRow(b) {
    var exp = b.expires_at
      ? '<span class="chip warn">until ' + esc(fmtSec(b.expires_at)) + '</span>'
      : '<span class="chip">permanent</span>';
    return '<div class="card">' +
      '<div class="meta"><span class="chip ban">banned</span>' + exp + '<span class="dim">' + fmtSec(b.created_at) + '</span></div>' +
      '<div class="addr"><span class="copy" data-copy="' + esc(b.address) + '" title="copy">' + esc(b.address) + '</span></div>' +
      (b.reason ? '<div class="addr">reason: ' + esc(b.reason) + '</div>' : '') +
      '<div class="acts"><button class="mini" data-act="unban" data-addr="' + esc(b.address) + '">unban</button></div>' +
    '</div>';
  }
  async function loadBans() {
    var res;
    try { res = await api('/chat/admin/bans'); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('bans error ' + res.status, 'err'); return; }
    var j = await res.json(); var list = (j.data && j.data.bans) || [];
    setBadge('bansBadge', list.length);
    el('bans').innerHTML = list.length ? list.map(banRow).join('') : '<div class="empty">// no active bans</div>';
  }
  async function unban(addr) {
    var res;
    try { res = await api('/chat/admin/ban/' + encodeURIComponent(addr), { method: 'DELETE' }); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('unban failed ' + res.status, 'err'); return; }
    var j = await res.json(); toast(j.data && j.data.unbanned ? 'ban lifted' : 'not found'); loadBans();
  }
  async function banManual() {
    var address = el('banAddr').value.trim();
    if (!address) { toast('enter an address', 'err'); return; }
    var reason = el('banReason').value.trim();
    var durRaw = el('banDuration').value;
    var purge = el('banPurge').checked;
    if (!(await confirmAction('Ban address', 'Ban ' + address + '?' + (purge ? '\\nAll of their messages will be deleted.' : ''), true))) return;
    var body = { address: address, purge: purge };
    if (reason) body.reason = reason;
    if (durRaw) body.durationSec = parseInt(durRaw, 10);
    var res;
    try { res = await api('/chat/admin/ban', { method: 'POST', body: JSON.stringify(body) }); }
    catch (e) { toast('network error', 'err'); return; }
    if (res.ok) {
      var j = await res.json();
      toast('address banned' + (j.data && j.data.purged ? ' · purged ' + j.data.purged : ''));
      el('banAddr').value = ''; el('banReason').value = ''; el('banPurge').checked = false; el('banDuration').value = '';
      loadBans();
    }
    else { var msg = 'ban failed ' + res.status; try { var jj = await res.json(); if (jj && typeof jj.error === 'string') msg = jj.error; } catch (e) { } toast(msg, 'err'); }
  }

  // ---- Audit ----------------------------------------------------------------
  function auditRow(a) {
    return '<div class="card">' +
      '<div class="meta"><span class="chip">' + esc(a.action) + '</span><span class="dim">' + fmtSec(a.created_at) + '</span></div>' +
      (a.target ? '<div class="addr">' + esc(a.target) + '</div>' : '') +
      (a.detail ? '<div class="addr dim">' + esc(a.detail) + '</div>' : '') +
    '</div>';
  }
  async function loadAudit() {
    var res;
    try { res = await api('/chat/admin/audit'); }
    catch (e) { toast('network error', 'err'); return; }
    if (!res.ok) { toast('audit error ' + res.status, 'err'); return; }
    var j = await res.json(); var list = (j.data && j.data.audit) || [];
    el('audit').innerHTML = list.length ? list.map(auditRow).join('') : '<div class="empty">// no admin actions logged</div>';
  }

  // ---- Delegated handlers (no inline JS built from row data) ----------------
  el('profiles').addEventListener('click', function (ev) {
    var cp = ev.target.closest('.copy'); if (cp) { copyText(cp.dataset.copy); return; }
    var btn = ev.target.closest('button[data-act]'); if (!btn) return;
    var d = btn.dataset;
    if (d.act === 'editnick') {
      el('nickAddr').value = d.addr; el('nickName').value = d.name; el('nickOfficial').checked = d.official === '1';
      el('nickName').focus(); toast('loaded into form');
    } else if (d.act === 'clearnick') { clearNick(d.addr, d.name); }
  });
  el('messages').addEventListener('click', async function (ev) {
    var btn = ev.target.closest('button[data-act]'); if (!btn) return;
    var id = btn.dataset.mid;
    var act = btn.dataset.act;
    if (act === 'del') { if (await confirmAction('Delete message', 'This hides it for everyone.', true)) delMsg(id); }
    else if (act === 'undelete') { if (await confirmAction('Undelete', 'Restore this message for everyone?', false)) undeleteMsg(id); }
    else if (act === 'ban') { var opts = await openBanModal('Ban sender', 'They can no longer post or react.'); if (opts) banMsg(id, opts); }
    else if (act === 'nick') { var name = await promptAction('Set nickname', 'Handle for this sender (blank clears):', btn.dataset.name || '', 24); if (name !== false) setMsgNick(id, name); }
    else if (act === 'copyid') { copyText(id); }
  });
  el('reports').addEventListener('click', async function (ev) {
    var btn = ev.target.closest('button[data-act]'); if (!btn) return;
    var d = btn.dataset;
    var rids = (d.rids || '').split(',').filter(Boolean);
    if (d.act === 'del') {
      if (!(await confirmAction('Delete message', 'Delete this reported message?', true))) return;
      var res = await api('/chat/admin/message/' + encodeURIComponent(d.mid), { method: 'DELETE' });
      if (res.ok) { toast('message deleted'); await resolveRids(rids); loadReports(); } else toast('delete failed ' + res.status, 'err');
    } else if (d.act === 'ban') {
      var opts = await openBanModal('Ban sender', 'Ban ' + d.addr + '?');
      if (!opts) return;
      var body = { address: d.addr, purge: !!opts.purge };
      if (opts.durationSec) body.durationSec = opts.durationSec;
      var r2 = await api('/chat/admin/ban', { method: 'POST', body: JSON.stringify(body) });
      if (r2.ok) {
        var jr = await r2.json();
        toast('sender banned' + (jr.data && jr.data.purged ? ' · purged ' + jr.data.purged : ''));
        loadBans(); await resolveRids(rids); loadReports();
      } else toast('ban failed ' + r2.status, 'err');
    } else if (d.act === 'resolve') { await resolveRids(rids); toast(rids.length > 1 ? 'dismissed ' + rids.length : 'dismissed'); loadReports(); }
  });
  el('bans').addEventListener('click', async function (ev) {
    var cp = ev.target.closest('.copy'); if (cp) { copyText(cp.dataset.copy); return; }
    var btn = ev.target.closest('button[data-act="unban"]'); if (!btn) return;
    if (await confirmAction('Unban', 'Lift the ban on this address?', false)) unban(btn.dataset.addr);
  });

  // ---- Init -----------------------------------------------------------------
  function bindEnter(id, fn) { var e = el(id); if (e) e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); fn(); } }); }
  window.addEventListener('DOMContentLoaded', function () {
    el('ann').addEventListener('input', updateAnnCount);
    bindEnter('secret', login);
    bindEnter('nickAddr', assignNick); bindEnter('nickName', assignNick);
    bindEnter('msgQuery', runSearch); bindEnter('msgAddr', runSearch);
    bindEnter('delId', delById);
    bindEnter('banAddr', banManual); bindEnter('banReason', banManual);
    el('modal').addEventListener('click', function (ev) { if (ev.target.id === 'modal') closeModal(false); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && el('modal').classList.contains('show')) closeModal(false); });
    var saved = sessionStorage.getItem(SS_KEY);
    if (saved) { el('secret').value = saved; login(); }
    else el('secret').focus();
  });
</script>
</body>
</html>`;
}
