// ============================================================
// GET /api/auth/callback — magic-link landing page.
// GoTrue redirects here with tokens in the URL *hash fragment*
// (#access_token=…&refresh_token=…), which the server never
// sees — so this route serves a tiny HTML page whose inline
// script parses the fragment, POSTs the tokens to
// /api/auth/session (which validates + sets httpOnly cookies),
// then replaces location with "/". Errors fall back to /login.
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE = `<!doctype html>
<html lang="en" style="color-scheme:dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Signing you in…</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0b1120;color:#e8edf7;font:15px/1.5 Jost,ui-sans-serif,system-ui,sans-serif}
  .card{border:1px solid rgba(168,196,229,.12);background:#111a2e;border-radius:12px;
        padding:28px 32px;text-align:center;max-width:22rem}
  .k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8fa3c0;margin-bottom:8px}
  .msg{font-weight:600}
  .sub{margin-top:6px;font-size:13px;color:#8fa3c0}
  a{color:#c9995c}
</style>
</head>
<body>
<div class="card">
  <div class="k">VioX Command</div>
  <div class="msg" id="msg">Signing you in…</div>
  <div class="sub" id="sub">Validating your magic link.</div>
</div>
<script>
(function () {
  var msg = document.getElementById('msg');
  var sub = document.getElementById('sub');
  function fail(text) {
    msg.textContent = 'Sign-in failed';
    sub.innerHTML = text + ' <a href="/login">Back to sign-in</a>';
  }
  try {
    var params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    var access = params.get('access_token');
    var refresh = params.get('refresh_token');
    var err = params.get('error_description') || params.get('error');
    if (err) return fail(err + '.');
    if (!access || !refresh) return fail('The link is missing its sign-in tokens — it may have expired.');
    fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: access, refresh_token: refresh })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && d.ok !== false, d: d }; }); })
      .then(function (out) {
        if (out.ok) { window.location.replace('/'); }
        else { fail(out.d && out.d.error ? out.d.error : 'Could not establish a session.'); }
      })
      .catch(function () { fail('Network error while establishing the session.'); });
  } catch (e) {
    fail('Unexpected error.');
  }
})();
</script>
</body>
</html>`;

export async function GET(): Promise<Response> {
  return new Response(PAGE, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
