/**
 * Minimal self-contained admin page for the chat. Served (unauthenticated) at
 * GET /chat/admin; the secret entered here is kept only in the page's memory
 * (never persisted) and sent as X-Admin-Secret on every ADMIN_SECRET-guarded
 * /chat/admin/* call.
 *
 * The tooling stays hidden until a successful login (a probe of
 * /chat/admin/reports): only the secret box shows until then. Once unlocked it
 * exposes the announcement banner, a recent-messages browser (delete any
 * message, reported or not — reuses the open /chat/history read), and the
 * report queue.
 */
export function adminPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Chat Admin</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #000; color: #fff; font: 14px/1.5 -apple-system, system-ui, sans-serif; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  h2 { font-size: 15px; margin: 22px 0 6px; }
  input, button { font: inherit; }
  input[type=password], input[type=text] { background: #0a0a0b; color: #fff; border: 1px solid rgba(255,255,255,.2); padding: 8px; }
  input[type=password] { width: 280px; }
  button { background: #0a0a0b; color: #fff; border: 1px solid rgba(255,255,255,.2); padding: 6px 10px; cursor: pointer; }
  button:hover { background: #1c1c1e; }
  button.danger { border-color: #ff5247; color: #ff5247; }
  .report { border: 1px solid rgba(255,255,255,.13); padding: 12px; margin: 10px 0; }
  .muted { color: #8a8a8d; }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .body { background: #0a0a0b; border-left: 3px solid rgba(255,255,255,.2); padding: 8px; margin: 8px 0; white-space: pre-wrap; }
  #status { margin-left: 8px; }
  #console { display: none; }
  #logout { display: none; }
</style>
</head>
<body>
<h1>Chat Admin</h1>
<div>
  <input id="secret" type="password" placeholder="ADMIN_SECRET" onkeydown="if(event.key==='Enter')login()" />
  <button id="loginBtn" onclick="login()">Log in</button>
  <button id="logout" onclick="logout()">Log out</button>
  <span id="status" class="muted"></span>
</div>

<div id="console">
  <h2>Announcement banner</h2>
  <textarea id="ann" rows="2" placeholder="Shown at the top of chat for everyone (max 280 chars)" style="width:100%;max-width:520px;background:#0a0a0b;color:#fff;border:1px solid rgba(255,255,255,.2);padding:8px" maxlength="280"></textarea>
  <div class="row">
    <button onclick="saveAnn()">Save announcement</button>
    <button class="danger" onclick="clearAnn()">Clear</button>
  </div>

  <h2>Recent messages</h2>
  <div class="row" style="margin-bottom:4px">
    <button onclick="loadMessages()">Refresh</button>
    <input id="delId" type="text" placeholder="delete by message id" style="width:280px" />
    <button class="danger" onclick="delById()">Delete by ID</button>
  </div>
  <div id="messages"></div>
  <div class="row">
    <button id="loadOlder" onclick="loadMessages(oldestTs)" style="display:none">Load older</button>
  </div>

  <h2>Reports</h2>
  <div id="reports"></div>
</div>

<script>
  const secretEl = () => document.getElementById('secret');
  const secret = () => secretEl().value;
  const setStatus = (m) => { document.getElementById('status').textContent = m; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&#34;',"'":'&#39;' }[c]));
  const shortAddr = (a) => { a = String(a || ''); return a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-4) : a; };
  let oldestTs = null;

  async function api(path, opts = {}) {
    return fetch(path, {
      ...opts,
      headers: { 'X-Admin-Secret': secret(), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }

  function setLoggedIn(v) {
    document.getElementById('console').style.display = v ? 'block' : 'none';
    document.getElementById('logout').style.display = v ? 'inline-block' : 'none';
    document.getElementById('loginBtn').style.display = v ? 'none' : 'inline-block';
  }

  // Login = probe the guarded reports endpoint. Reveal the console only on 200.
  async function login() {
    setStatus('logging in…');
    let res;
    try { res = await api('/chat/admin/reports'); }
    catch (e) { setStatus('network error'); setLoggedIn(false); return; }
    if (!res.ok) { setStatus(res.status === 401 ? 'wrong secret' : 'error ' + res.status); setLoggedIn(false); return; }
    setLoggedIn(true);
    const { data } = await res.json();
    const reports = (data && data.reports) || [];
    renderReports(reports);
    setStatus(reports.length + ' open report' + (reports.length === 1 ? '' : 's'));
    await loadAnnouncement();
    await loadMessages();
  }

  function logout() {
    secretEl().value = '';
    setLoggedIn(false);
    document.getElementById('messages').innerHTML = '';
    document.getElementById('reports').innerHTML = '';
    oldestTs = null;
    setStatus('logged out');
    secretEl().focus();
  }

  async function loadAnnouncement() {
    try {
      const a = await fetch('/chat/announcement');
      if (a.ok) { const j = await a.json(); document.getElementById('ann').value = (j.data && j.data.announcement) || ''; }
    } catch (e) { /* ignore */ }
  }

  async function saveAnn() {
    const body = document.getElementById('ann').value.trim();
    if (!body) { setStatus('announcement empty — use Clear to remove'); return; }
    const res = await api('/chat/admin/announcement', { method: 'POST', body: JSON.stringify({ body }) });
    setStatus(res.ok ? 'announcement saved' : 'save failed ' + res.status);
  }
  async function clearAnn() {
    const res = await api('/chat/admin/announcement', { method: 'DELETE' });
    if (res.ok) { document.getElementById('ann').value = ''; setStatus('announcement cleared'); }
    else setStatus('clear failed ' + res.status);
  }

  // ---- Recent messages (open /chat/history read + guarded delete) -----------
  function renderMsgRow(m) {
    const who = m.nickname ? esc(m.nickname) : esc(shortAddr(m.address));
    return \`
      <div class="report" id="msg-\${esc(m.id)}">
        <div class="muted">\${who} · \${new Date(m.ts).toLocaleString()}</div>
        <div class="body">\${esc(m.body)}</div>
        <div class="mono muted">\${esc(m.address)}</div>
        <div class="row">
          <button class="danger" data-act="delmsg" data-mid="\${esc(m.id)}">Delete</button>
        </div>
      </div>\`;
  }

  // No before-cursor → fresh load (replace); with a cursor → older page (append).
  // History excludes deleted messages, so a deleted row won't come back.
  async function loadMessages(before) {
    const url = '/chat/history?limit=50' + (before ? '&before=' + encodeURIComponent(before) : '');
    let res;
    try { res = await fetch(url); } catch (e) { setStatus('history network error'); return; }
    if (!res.ok) { setStatus('history error ' + res.status); return; }
    const { data } = await res.json();
    const msgs = (data && data.messages) || [];
    const container = document.getElementById('messages');
    const html = msgs.map(renderMsgRow).join('');
    if (before) container.insertAdjacentHTML('beforeend', html);
    else container.innerHTML = html || '<p class="muted">No messages.</p>';
    if (msgs.length) oldestTs = msgs[msgs.length - 1].ts;
    // A full page implies more history may exist.
    document.getElementById('loadOlder').style.display = msgs.length >= 50 ? 'inline-block' : 'none';
    if (!before) setStatus(msgs.length + ' recent message' + (msgs.length === 1 ? '' : 's'));
  }

  // Delete any message by id; drops the row if it's on screen. The server also
  // broadcasts the removal so it vanishes live for connected clients.
  async function delMsgById(id) {
    const res = await api('/chat/admin/message/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) { setStatus('delete failed ' + res.status); return; }
    const { data } = await res.json();
    const el = document.getElementById('msg-' + id);
    if (el) el.remove();
    setStatus(data && data.deleted ? 'message deleted' : 'not found (already deleted?)');
  }
  async function delById() {
    const id = document.getElementById('delId').value.trim();
    if (!id) { setStatus('enter a message id'); return; }
    if (!confirm('Delete message ' + id + '?')) return;
    await delMsgById(id);
    document.getElementById('delId').value = '';
  }
  document.getElementById('messages').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act="delmsg"]');
    if (!btn) return;
    if (confirm('Delete this message?')) delMsgById(btn.dataset.mid);
  });

  // ---- Reports --------------------------------------------------------------
  function renderReports(reports) {
    document.getElementById('reports').innerHTML = reports.map((r) => \`
      <div class="report" id="report-\${esc(r.id)}">
        <div class="muted">reported \${new Date(r.created_at * 1000).toLocaleString()} · reason: \${esc(r.reason) || '—'}</div>
        <div class="body">\${r.body == null ? '<i class="muted">[message deleted or missing]</i>' : esc(r.body)}</div>
        <div class="mono muted">sender: \${esc(r.message_address) || '—'}</div>
        <div class="mono muted">reporter: \${esc(r.reporter)}</div>
        <div class="row">
          <button class="danger" data-act="del" data-mid="\${esc(r.message_id)}" data-rid="\${esc(r.id)}">Delete message</button>
          <button class="danger" data-act="ban" data-addr="\${esc(r.message_address)}" data-rid="\${esc(r.id)}" \${r.message_address ? '' : 'disabled'}>Ban sender</button>
          <button data-act="resolve" data-rid="\${esc(r.id)}">Dismiss</button>
        </div>
      </div>\`).join('') || '<p class="muted">No open reports.</p>';
  }
  async function delReported(id, reportId) {
    if (!confirm('Delete this message?')) return;
    const res = await api('/chat/admin/message/' + encodeURIComponent(id), { method: 'DELETE' });
    if (res.ok) { await resolve(reportId, true); } else setStatus('delete failed ' + res.status);
  }
  async function ban(address, reportId) {
    if (!address || !confirm('Ban ' + address + '?')) return;
    const res = await api('/chat/admin/ban', { method: 'POST', body: JSON.stringify({ address }) });
    if (res.ok) { await resolve(reportId, true); } else setStatus('ban failed ' + res.status);
  }
  async function resolve(reportId, silent) {
    const res = await api('/chat/admin/reports/' + encodeURIComponent(reportId) + '/resolve', { method: 'POST' });
    if (res.ok) { const el = document.getElementById('report-' + reportId); if (el) el.remove(); if (!silent) setStatus('dismissed'); }
    else setStatus('resolve failed ' + res.status);
  }
  // Delegated handlers (no inline JS built from report data — avoids injection).
  document.getElementById('reports').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const d = btn.dataset;
    if (d.act === 'del') delReported(d.mid, d.rid);
    else if (d.act === 'ban') ban(d.addr, d.rid);
    else if (d.act === 'resolve') resolve(d.rid);
  });
</script>
</body>
</html>`;
}
