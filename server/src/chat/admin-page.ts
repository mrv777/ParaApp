/**
 * Minimal self-contained admin page for triaging the chat report queue.
 * Served (unauthenticated) at GET /chat/admin; every action calls the
 * ADMIN_SECRET-guarded /chat/admin/* API with the secret entered here (kept only
 * in the page's memory, never persisted).
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
  input, button { font: inherit; }
  input[type=password] { background: #0a0a0b; color: #fff; border: 1px solid rgba(255,255,255,.2); padding: 8px; width: 280px; }
  button { background: #0a0a0b; color: #fff; border: 1px solid rgba(255,255,255,.2); padding: 6px 10px; cursor: pointer; }
  button:hover { background: #1c1c1e; }
  button.danger { border-color: #ff5247; color: #ff5247; }
  .report { border: 1px solid rgba(255,255,255,.13); padding: 12px; margin: 10px 0; }
  .muted { color: #8a8a8d; }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .body { background: #0a0a0b; border-left: 3px solid rgba(255,255,255,.2); padding: 8px; margin: 8px 0; white-space: pre-wrap; }
  #status { margin-left: 8px; }
</style>
</head>
<body>
<h1>Chat Admin — Reports</h1>
<div>
  <input id="secret" type="password" placeholder="ADMIN_SECRET" />
  <button onclick="load()">Load reports</button>
  <span id="status" class="muted"></span>
</div>
<div id="reports"></div>
<script>
  const secret = () => document.getElementById('secret').value;
  const setStatus = (m) => { document.getElementById('status').textContent = m; };
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'X-Admin-Secret': secret(), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return res;
  }
  async function load() {
    setStatus('loading…');
    const res = await api('/chat/admin/reports');
    if (!res.ok) { setStatus('error ' + res.status); return; }
    const { data } = await res.json();
    const reports = (data && data.reports) || [];
    setStatus(reports.length + ' open');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
    document.getElementById('reports').innerHTML = reports.map((r) => \`
      <div class="report" id="report-\${esc(r.id)}">
        <div class="muted">reported \${new Date(r.created_at * 1000).toLocaleString()} · reason: \${esc(r.reason) || '—'}</div>
        <div class="body">\${r.body == null ? '<i class="muted">[message deleted or missing]</i>' : esc(r.body)}</div>
        <div class="mono muted">sender: \${esc(r.message_address) || '—'}</div>
        <div class="mono muted">reporter: \${esc(r.reporter)}</div>
        <div class="row">
          <button class="danger" onclick="delMsg('\${esc(r.message_id)}','\${esc(r.id)}')">Delete message</button>
          <button class="danger" onclick="ban('\${esc(r.message_address)}','\${esc(r.id)}')" \${r.message_address ? '' : 'disabled'}>Ban sender</button>
          <button onclick="resolve('\${esc(r.id)}')">Dismiss</button>
        </div>
      </div>\`).join('') || '<p class="muted">No open reports.</p>';
  }
  async function delMsg(id, reportId) {
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
</script>
</body>
</html>`;
}
