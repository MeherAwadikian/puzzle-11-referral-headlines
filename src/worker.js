// Puzzle #11 — headline changes by referral source (?ref=), DB-backed via Cloudflare D1.
// Routes:
//   GET  /              -> landing page, reads ?ref= client-side, calls /api/copy
//   GET  /api/copy?ref= -> JSON lookup from D1 (falls back to 'default' row)
//   GET  /admin         -> minimal admin UI to list/add/edit ref->copy rows
//   GET  /api/admin/list        -> JSON list of all rows
//   POST /api/admin/upsert      -> { ref_key, headline, subheadline, cta_label } insert-or-replace
//   POST /api/admin/delete      -> { ref_key } delete a row (default row protected)

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Referral-Aware Landing Page</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0b0d12; color: #f2f3f5; min-height: 100vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px; text-align: center;
  }
  .badge {
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    background: rgba(99,102,241,0.15); color: #a5b4fc; font-size: 13px;
    letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 20px;
  }
  h1 { font-size: clamp(28px, 5vw, 48px); max-width: 820px; margin: 0 0 16px; line-height: 1.15; }
  p.sub { font-size: clamp(16px, 2.2vw, 20px); color: #b7bac2; max-width: 620px; margin: 0 0 28px; }
  .cta {
    display: inline-block; background: #6366f1; color: white; padding: 14px 32px;
    border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 16px;
  }
  .meta { margin-top: 48px; font-size: 13px; color: #5c606b; max-width: 500px; }
  .meta code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; }
  .loading { opacity: 0.4; }
  a.admin-link { color: #5c606b; font-size: 12px; margin-top: 8px; display: inline-block; }
</style>
</head>
<body>
  <div class="badge" id="badge">loading referral source&hellip;</div>
  <h1 id="headline" class="loading">&nbsp;</h1>
  <p class="sub" id="subheadline"></p>
  <a class="cta" id="cta" href="#">Get Started</a>
  <div class="meta">
    This page's headline is looked up from a Cloudflare D1 database row keyed by the
    <code>?ref=</code> query parameter &mdash; nothing below is hardcoded in this page's JS.
    Try <code>?ref=google</code>, <code>?ref=linkedin</code>, <code>?ref=tiktok</code>, or no param at all.
    <br><a class="admin-link" href="/admin">admin: manage referral mappings &rarr;</a>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref') || '';
    document.getElementById('badge').textContent = ref ? 'ref = ' + ref : 'ref = (none, showing default)';
    fetch('/api/copy?ref=' + encodeURIComponent(ref))
      .then(r => r.json())
      .then(data => {
        document.getElementById('headline').textContent = data.headline;
        document.getElementById('headline').classList.remove('loading');
        document.getElementById('subheadline').textContent = data.subheadline;
        document.getElementById('cta').textContent = data.cta_label;
        document.getElementById('badge').textContent = 'ref = ' + (ref || '(none)') +
          '  |  matched row: ' + data.matched_key + (data.matched_key !== (ref || 'default') ? ' (fallback)' : '');
      })
      .catch(() => {
        document.getElementById('headline').textContent = 'Could not load copy from the database.';
        document.getElementById('headline').classList.remove('loading');
      });
  </script>
</body>
</html>`;

function adminHtml(rows) {
  const rowsHtml = rows.map(r => `
    <tr>
      <td><code>${escapeHtml(r.ref_key)}</code></td>
      <td>${escapeHtml(r.headline)}</td>
      <td>${escapeHtml(r.subheadline)}</td>
      <td>${escapeHtml(r.cta_label)}</td>
      <td>${escapeHtml(r.updated_at)}</td>
      <td>${r.ref_key === 'default' ? '' : `<button class="del" data-key="${escapeHtml(r.ref_key)}">delete</button>`}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — Referral Copy</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; background:#0b0d12; color:#f2f3f5; padding: 32px; max-width: 980px; margin: 0 auto; }
  h1 { font-size: 22px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
  th, td { border: 1px solid #2a2d35; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #16181f; }
  code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; }
  form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background:#14161c; padding: 20px; border-radius: 10px; margin-top: 24px; }
  form label { font-size: 12px; color:#9aa0ab; display:block; margin-bottom: 4px; }
  input, textarea { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #333842; background:#0b0d12; color:#f2f3f5; font-size: 14px; }
  .full { grid-column: 1 / -1; }
  button[type=submit] { grid-column: 1 / -1; background:#6366f1; color:white; border:none; padding: 10px; border-radius: 8px; font-weight:600; cursor:pointer; }
  button.del { background:#3a1d22; color:#f3a0a8; border: 1px solid #5c2a31; border-radius:6px; padding: 4px 10px; cursor:pointer; }
  a { color: #a5b4fc; }
  #status { margin-top: 10px; font-size: 13px; }
</style>
</head>
<body>
  <p><a href="/">&larr; back to landing page</a></p>
  <h1>Referral &rarr; Copy mappings (live from D1, no redeploy needed)</h1>
  <table>
    <thead><tr><th>ref_key</th><th>headline</th><th>subheadline</th><th>cta_label</th><th>updated_at</th><th></th></tr></thead>
    <tbody id="rows">${rowsHtml}</tbody>
  </table>

  <form id="upsert-form">
    <div><label>ref_key (e.g. "reddit")</label><input name="ref_key" required pattern="[a-z0-9_-]+"></div>
    <div><label>cta_label</label><input name="cta_label" value="Get Started"></div>
    <div class="full"><label>headline</label><input name="headline" required></div>
    <div class="full"><label>subheadline</label><textarea name="subheadline" rows="2" required></textarea></div>
    <button type="submit">Save mapping (insert or update)</button>
  </form>
  <div id="status"></div>

<script>
document.getElementById('upsert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const res = await fetch('/api/admin/upsert', { method: 'POST', body: JSON.stringify(body), headers: {'content-type':'application/json'} });
  const data = await res.json();
  document.getElementById('status').textContent = res.ok ? 'Saved. Reloading...' : ('Error: ' + (data.error || res.status));
  if (res.ok) setTimeout(() => location.reload(), 500);
});
document.querySelectorAll('button.del').forEach(btn => {
  btn.addEventListener('click', async () => {
    const key = btn.dataset.key;
    if (!confirm('Delete mapping for "' + key + '"?')) return;
    await fetch('/api/admin/delete', { method: 'POST', body: JSON.stringify({ ref_key: key }), headers: {'content-type':'application/json'} });
    location.reload();
  });
});
</script>
</body>
</html>`;
}

// --- Supabase (PostgREST) data layer ---
// Reads hit the table directly (RLS allows public SELECT).
// Writes go through SECURITY DEFINER RPC functions (upsert_referral_copy /
// delete_referral_copy) so the anon key never gets direct table write access.

function sb(env, path, init = {}) {
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    "content-type": "application/json",
    ...(init.headers || {}),
  };
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers });
}

async function fetchRow(env, refKey) {
  const res = await sb(
    env,
    `/rest/v1/referral_copy?ref_key=eq.${encodeURIComponent(refKey)}&select=ref_key,headline,subheadline,cta_label`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" && request.method === "GET") {
      return new Response(LANDING_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/api/copy" && request.method === "GET") {
      const ref = (url.searchParams.get("ref") || "").trim().toLowerCase();
      let row = ref ? await fetchRow(env, ref) : null;
      if (!row) row = await fetchRow(env, "default");
      if (!row) row = { ref_key: "default", headline: "Welcome", subheadline: "", cta_label: "Get Started" };
      return Response.json({
        requested_ref: ref || null,
        matched_key: row.ref_key,
        headline: row.headline,
        subheadline: row.subheadline,
        cta_label: row.cta_label,
      });
    }

    if (pathname === "/admin" && request.method === "GET") {
      const res = await sb(env, "/rest/v1/referral_copy?select=ref_key,headline,subheadline,cta_label,updated_at&order=ref_key");
      const rows = res.ok ? await res.json() : [];
      return new Response(adminHtml(rows), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/api/admin/list" && request.method === "GET") {
      const res = await sb(env, "/rest/v1/referral_copy?select=ref_key,headline,subheadline,cta_label,updated_at&order=ref_key");
      const rows = res.ok ? await res.json() : [];
      return Response.json({ rows });
    }

    if (pathname === "/api/admin/upsert" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
      const ref_key = String(body.ref_key || "").trim().toLowerCase();
      const headline = String(body.headline || "").trim();
      const subheadline = String(body.subheadline || "").trim();
      const cta_label = String(body.cta_label || "Get Started").trim();
      if (!ref_key || !/^[a-z0-9_-]+$/.test(ref_key) || !headline || !subheadline) {
        return Response.json({ error: "ref_key, headline, subheadline required; ref_key must be [a-z0-9_-]+" }, { status: 400 });
      }
      const res = await sb(env, "/rest/v1/rpc/upsert_referral_copy", {
        method: "POST",
        body: JSON.stringify({
          p_ref_key: ref_key, p_headline: headline, p_subheadline: subheadline, p_cta_label: cta_label,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return Response.json({ error: errText }, { status: 400 });
      }
      return Response.json({ ok: true, ref_key });
    }

    if (pathname === "/api/admin/delete" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
      const ref_key = String(body.ref_key || "").trim().toLowerCase();
      if (ref_key === "default") return Response.json({ error: "cannot delete default row" }, { status: 400 });
      const res = await sb(env, "/rest/v1/rpc/delete_referral_copy", {
        method: "POST",
        body: JSON.stringify({ p_ref_key: ref_key }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return Response.json({ error: errText }, { status: 400 });
      }
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
};
