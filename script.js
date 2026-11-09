let S = [], auth = null, token = sessionStorage.getItem('djt') || '', cur = { s: 'lead', v: 'role' }, q = '', edit = null, mo = false, M = [], sg = 'male';
const $ = i => document.getElementById(i), cl = i => $(i).classList.remove('on'), op = i => $(i).classList.add('on');
const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const can = id => auth && (auth === 'lead' || auth === id);
const sec = id => S.find(x => x.id === id);

async function api(p, o = {}) {
  const r = await fetch('/api' + p, {
    method: o.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    if (r.status === 401 && token) { token = ''; auth = null; sessionStorage.removeItem('djt'); }
    throw new Error(j.error || 'Error');
  }
  return j;
}

function nav() {
  $('nav').innerHTML = `<button class="btn" style="width:100%;text-align:left;margin-bottom:8px" onclick="mo=!mo;nav()">☰ Menu — Sectors ${mo ? '▲' : '▼'}</button>` + (!mo ? '' : S.map(s => `<details ${cur.s === s.id ? 'open' : ''}><summary>${s.name}</summary>
${[['role', 'Role & duties'], ['male', 'Male'], ['female', 'Female']].map(([v, l]) => `<a class="${cur.s === s.id && cur.v === v ? 'on' : ''}" onclick="go('${s.id}','${v}')">${l}${v !== 'role' ? ' (' + (s.counts[v] || 0) + ')' : ''}</a>`).join('')}</details>`).join(''));
  $('lb').textContent = auth ? 'Logout' : 'Login';
  $('cp').style.display = auth ? '' : 'none';
  $('who').textContent = auth ? 'Logged in: ' + sec(auth).name + (auth === 'lead' ? ' (can edit all)' : '') : 'Viewing only (not logged in)';
}

async function load() {
  S = await api('/sectors');
  if (cur.v !== 'role') M = await api('/members?sector=' + cur.s + '&gender=' + cur.v);
  render();
}
async function go(s, v) {
  cur = { s, v }; q = ''; mo = false; M = [];
  try { if (v !== 'role') M = await api('/members?sector=' + s + '&gender=' + v); } catch (e) { M = []; }
  render();
}

function render() {
  nav();
  const s = sec(cur.s); let h = '';
  if (cur.v === 'role') {
    h = `<div class="card"><h2>${s.name}</h2><span class="badge">${s.counts.male + s.counts.female} members</span>
<h3>Role & duties</h3><ul>${s.roles.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="card"><h3 style="margin-top:0">Sub-leaders</h3>${['male', 'female'].map(g => `<p><b>${g === 'male' ? 'Male' : 'Female'} sub-leader:</b> ${s.sub[g].n ? esc(s.sub[g].n) + ' — ' + esc(s.sub[g].p) : '<span class="mu">not assigned</span>'}
${can(s.id) ? ` <button class="btn o" onclick="subE('${g}')">Edit</button>` : ''}</p>`).join('')}</div>`;
  } else {
    const g = cur.v, sl = s.sub[g], L = M.filter(x => (x.name + x.dept + x.from + x.phone + x.year).toLowerCase().includes(q.toLowerCase()));
    h = `<div class="card"><h2>${s.name} — ${g === 'male' ? 'Male' : 'Female'}</h2>
<p>Sub-leader: <b>${sl.n ? esc(sl.n) + '</b> · ' + esc(sl.p) : '</b><span class="mu">not assigned</span>'}
${can(s.id) ? ` <button class="btn o" onclick="subE('${g}')">Edit</button>` : ''}</p>
<div class="bar"><input placeholder="Search members…" value="${esc(q)}" oninput="q=this.value;rl()" id="qs">
${can(s.id) ? '<button class="btn" onclick="mE()">+ Add member</button>' : ''}</div>
<div class="tw"><table><tr><th>#</th><th>Name</th><th>Department</th><th>Year</th><th>From</th><th>Phone</th>${can(s.id) ? '<th></th>' : ''}</tr>
${L.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.dept)}</td><td>${esc(x.year)}</td><td>${esc(x.from)}</td><td>${esc(x.phone)}</td>
${can(s.id) ? `<td style="white-space:nowrap"><button class="btn o" onclick="mE(${x.id})">Edit</button> <button class="btn d" onclick="mD(${x.id})">×</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="mu">No members yet.</td></tr>'}</table></div>
${can(s.id) ? '' : '<p class="mu" style="margin-bottom:0">Login as this sector (or Leadership) to add or update members.</p>'}</div>`;
  }
  $('main').innerHTML = h;
}
function rl() { const p = $('qs').selectionStart; render(); const e = $('qs'); e.focus(); e.setSelectionRange(p, p); }

$('lb').onclick = async () => {
  if (auth) {
    try { await api('/logout', { method: 'POST' }); } catch (e) {}
    token = ''; auth = null; sessionStorage.removeItem('djt'); render();
  } else { $('le').textContent = ''; $('lp').value = ''; op('m1'); }
};
async function login() {
  try {
    const r = await api('/login', { method: 'POST', body: { sector: $('ls').value, pin: $('lp').value } });
    token = r.token; auth = r.sector; sessionStorage.setItem('djt', token); cl('m1'); await go(auth, 'role');
  } catch (e) { $('le').textContent = e.message; }
}
$('cp').onclick = async () => {
  const t = auth === 'lead' ? cur.s : auth;
  const pin = prompt('New PIN for ' + sec(t).name + ' (4 to 12 digits)');
  if (!pin) return;
  try { await api('/pin', { method: 'POST', body: { sector: t, pin } }); alert('PIN changed.'); } catch (e) { alert(e.message); }
};

function mE(i) {
  if (!can(cur.s)) return; edit = i || null;
  const x = M.find(m => m.id === i) || {};
  $('mt').textContent = i ? 'Edit member' : 'Add member';
  $('fn').value = x.name || ''; $('fd').value = x.dept || ''; $('fy').value = x.year || ''; $('ff').value = x.from || ''; $('fp').value = x.phone || '';
  op('m2');
}
async function saveM() {
  if (!can(cur.s)) return;
  const n = $('fn').value.trim(); if (!n) return;
  const b = { sector: cur.s, gender: cur.v, name: n, dept: $('fd').value, year: $('fy').value, from: $('ff').value, phone: $('fp').value };
  try {
    if (edit) await api('/members/' + edit, { method: 'PUT', body: b });
    else await api('/members', { method: 'POST', body: b });
    cl('m2'); await load();
  } catch (e) { alert(e.message); render(); }
}
async function mD(i) {
  if (!can(cur.s) || !confirm('Delete this member?')) return;
  try { await api('/members/' + i, { method: 'DELETE' }); await load(); } catch (e) { alert(e.message); }
}
function subE(g) {
  if (!can(cur.s)) return; sg = g; const x = sec(cur.s).sub[g];
  $('st').textContent = (g === 'male' ? 'Male' : 'Female') + ' sub-leader'; $('sn').value = x.n; $('sp').value = x.p; op('m3');
}
async function saveS() {
  if (!can(cur.s)) return;
  try { await api('/sub', { method: 'PUT', body: { sector: cur.s, gender: sg, name: $('sn').value, phone: $('sp').value } }); cl('m3'); await load(); }
  catch (e) { alert(e.message); }
}

(async () => {
  try {
    S = await api('/sectors');
    $('ls').innerHTML = S.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (token) { try { auth = (await api('/me')).sector; } catch (e) {} }
    await go('lead', 'role');
  } catch (e) {
    $('main').innerHTML = '<div class="card"><h2>Cannot reach the server</h2><p>Start the system with <b>npm start</b> and open <b>http://localhost:3000</b>.</p></div>';
  }
})();
