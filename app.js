import { firebaseConfig, ADMIN_EMAIL } from './firebase-config.js';
import {
  T, sv, defaultState, normalize, teamSize, scores, tailResult,
  zombieDone, zombieStarted, zombieCaught, pairingOk, drawPairs, parseMembers,
} from './scoring.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLORS = T.map(i => 'var(--t' + i + ')');
const LS = 'class-scoreboard-local';
const $ = id => document.getElementById(id);

let state = defaultState();
let mode = 'local';          // 'local' | 'firebase'
let isAdmin = true;          // 로컬 모드에서는 이 기기 사용자가 곧 관리자
let fb = null;               // { db, auth, ref, set, signIn, signOut }
let serverOffset = 0;        // Firebase 서버 시계와의 차이(ms). 휴대폰마다 타이머가 어긋나지 않게
let loginError = '';
let view = 'board';

const now = () => Date.now() + serverOffset;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const chip = (i, cls) => '<span class="chip' + (cls || '') + '" style="--tc:' + COLORS[i] + '"><i></i>' + esc(state.teams[i].name) + '</span>';

/* ---------- 저장 · 동기화 ---------- */
function setSync(live, text) {
  $('syncdot').classList.toggle('live', !!live);
  $('synctext').textContent = text;
}

// 점수 입력 화면 위쪽에 잠깐 띄우는 안내 (저장 실패는 사라지지 않게 둔다)
let flash = null, flashTimer = null;
function setFlash(text, bad) {
  flash = { text, bad: !!bad };
  clearTimeout(flashTimer);
  if (!bad) flashTimer = setTimeout(() => { flash = null; renderAdmin(); }, 3000);
}

function save(doneText) {
  if (!isAdmin) return;
  if (mode === 'firebase') {
    fb.set(fb.ref(fb.db, 'board'), JSON.parse(JSON.stringify(state)))
      .then(() => { if (doneText) { setFlash(doneText); renderAdmin(); } })
      .catch(e => {
        setFlash(e && e.code === 'PERMISSION_DENIED'
          ? '저장되지 않았어요. 관리자 권한이 없습니다. 로그아웃 후 다시 로그인하세요.'
          : '저장되지 않았어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', true);
        renderAdmin();
      });
  } else {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
    if (doneText) setFlash(doneText);
  }
  render();
}

async function connect() {
  if (!firebaseConfig) {
    try { const raw = localStorage.getItem(LS); if (raw) state = normalize(JSON.parse(raw)); } catch (e) {}
    setSync(false, '이 기기에만 저장');
    window.addEventListener('storage', e => { if (e.key === LS) { try { state = normalize(JSON.parse(e.newValue)); } catch (_) {} render(); } });
    render();
    return;
  }
  mode = 'firebase'; isAdmin = false;
  render();
  try {
    const [{ initializeApp }, dbm, authm] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-database.js'), import(FB + 'firebase-auth.js'),
    ]);
    const app = initializeApp(firebaseConfig);
    const db = dbm.getDatabase(app), auth = authm.getAuth(app);
    fb = {
      db, auth, ref: dbm.ref, set: dbm.set,
      signIn: pw => authm.signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw),
      signOut: () => authm.signOut(auth),
    };
    dbm.onValue(dbm.ref(db, '.info/serverTimeOffset'), s => { serverOffset = s.val() || 0; });
    dbm.onValue(dbm.ref(db, '.info/connected'), s => setSync(s.val(), s.val() ? '실시간 연결됨' : '연결 끊김 · 다시 연결하는 중'));
    dbm.onValue(dbm.ref(db, 'board'), s => { state = normalize(s.val()); render(); },
      () => setSync(false, '점수를 불러오지 못했어요'));
    authm.onAuthStateChanged(auth, u => {
      isAdmin = !!u && (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
      render();
    });
  } catch (e) {
    setSync(false, 'Firebase에 연결하지 못했어요 · 인터넷을 확인하세요');
  }
}

/* ---------- 타이머 ---------- */
function timeLeft() {
  const t = state.timer;
  return t.endsAt ? Math.max(0, (t.endsAt - now()) / 1000) : t.left;
}
const fmt = sec => { sec = Math.ceil(sec); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
function timerToggle() {
  const t = state.timer;
  if (t.endsAt) { t.left = timeLeft(); t.endsAt = null; }
  else { if (t.left <= 0) t.left = t.dur; t.endsAt = now() + t.left * 1000; }
}
let audioCtx = null, buzzed = false;
function buzz() {
  if (!audioCtx) return;
  [0, 0.35, 0.7].forEach(d => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = 660; g.gain.value = 0.15;
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.25);
  });
}
function tick() {
  const left = timeLeft(), t = state.timer, clock = $('b-clock');
  $('b-time').textContent = fmt(left);
  $('b-clocklabel').textContent = t.label || '';
  clock.classList.toggle('paused', !t.endsAt && left > 0);
  clock.classList.toggle('warn', !!t.endsAt && left <= 60 && left > 0);
  clock.classList.toggle('over', left <= 0);
  const big = $('i-time'); if (big) big.textContent = fmt(left);
  if (t.endsAt && left <= 0 && !buzzed) { buzzed = true; buzz(); }
  if (left > 0) buzzed = false;
}
setInterval(tick, 250);

/* ---------- 전광판 ---------- */
let painted = false;
function renderBoard() {
  $('b-title').textContent = state.title;
  document.title = state.title + ' 전광판';
  const sc = scores(state);
  const order = T.slice().sort((a, b) => sc[b].total - sc[a].total || a - b);
  const max = Math.max(1, ...sc.map(s => s.total));
  const box = $('b-ranks');
  T.forEach(i => {
    let row = box.querySelector('[data-team="' + i + '"]');
    if (!row) {
      row = document.createElement('div'); row.className = 'row'; row.dataset.team = i;
      row.innerHTML = '<div class="rank"></div><div class="tname"><span class="bib"></span><div><b></b><div class="mini"></div></div></div>' +
        '<div class="parts"><div class="part"><small>좀비</small><span data-k="zombie"></span></div><div class="part"><small>꼬리잡기</small><span data-k="tail"></span></div><div class="part"><small>피구</small><span data-k="dodge"></span></div></div>' +
        '<div class="total"></div>';
      box.appendChild(row);
    }
    const s = sc[i], rank = 1 + sc.filter(x => x.total > s.total).length;
    row.style.setProperty('--pos', order.indexOf(i));
    row.style.setProperty('--tc', COLORS[i]);
    row.style.setProperty('--fill', (s.total / max * 100) + '%');
    row.dataset.rank = s.total > 0 ? rank : '';
    row.querySelector('.rank').textContent = rank;
    row.querySelector('.tname b').textContent = state.teams[i].name;
    row.querySelector('.mini').textContent = '좀비 ' + s.zombie + ' · 꼬리 ' + s.tail + ' · 피구 ' + s.dodge;
    ['zombie', 'tail', 'dodge'].forEach(k => { row.querySelector('[data-k="' + k + '"]').textContent = s[k]; });
    const tot = row.querySelector('.total');
    if (tot.textContent !== String(s.total)) {
      tot.textContent = s.total;
      if (painted) { tot.classList.remove('bump'); void tot.offsetWidth; tot.classList.add('bump'); }
    }
  });
  painted = true;

  const zList = state.zombie.map((g, gi) => {
    const started = zombieStarted(g), done = zombieDone(g, state.teams);
    return '<li class="z"><em>' + (gi + 1) + '경기</em>' + chip(g.tagger) + '<span class="res' + (started ? ' on' : '') + '">' +
      (started ? zombieCaught(g, state.teams) + '명 잡음' + (done ? '' : '…') : '술래') + '</span></li>';
  }).join('');
  const tList = state.tail.map((g, gi) => {
    const r = tailResult(g);
    return '<li class="z"><em>' + (gi + 1) + '경기</em>' +
      (r ? '<span class="chips">' + r.winners.map(i => chip(i, ' win')).join('') + '</span>' : '<span class="chip" style="color:var(--muted)">진행 전</span>') +
      '<span class="res' + (r ? ' on' : '') + '">' + (r ? (r.wipe ? '전멸승 60' : '승 40') : '') + '</span></li>';
  }).join('');
  const dList = state.dodge.map(m => {
    const win = m.w ? (m.w === 'a' ? m.a : m.b) : null;
    const cls = i => (win === null ? '' : i === win ? ' win' : ' lose');
    return '<li>' + chip(m.a, cls(m.a)) + '<em>vs</em>' + chip(m.b, cls(m.b)) + '<span class="res' + (m.w ? ' on' : '') + '">' + (m.w ? '승' : '대기') + '</span></li>';
  }).join('');
  const count = (arr, f) => arr.filter(f).length + ' / ' + arr.length;
  $('b-progress').innerHTML =
    '<div class="prog"><h3><span>좀비게임 · 8분</span><span class="num">' + count(state.zombie, g => zombieDone(g, state.teams)) + '</span></h3><ul>' + zList + '</ul><p class="note">술래: 잡은 사람당 2 · 생존: 1명당 5</p></div>' +
    '<div class="prog"><h3><span>꼬리잡기 · 10분 · 6팀 동시</span><span class="num">' + count(state.tail, g => tailResult(g)) + '</span></h3><ul>' + tList + '</ul><p class="note">남은 인원 최다 40 · 모두 전멸시키면 60 · 나머지 10</p></div>' +
    '<div class="prog"><h3><span>피구 대진표</span><span class="num">' + count(state.dodge, m => m.w) + '</span></h3><ul>' + dList + '</ul><p class="note">승 60 · 패 20</p></div>';
  $('b-keys').hidden = !isAdmin;
}

/* ---------- 팀 명단 ---------- */
function renderRoster() {
  const sc = scores(state);
  const any = state.teams.some(t => t.members.length);
  $('roster').innerHTML = (any ? '' : '<div class="empty">아직 명단이 없어요. 관리자가 점수 입력 화면의 "팀 · 명단 설정"에서 입력하면 여기에 나옵니다.</div>') +
    state.teams.map((t, i) => '<div class="rcard" style="--tc:' + COLORS[i] + '"><h2>' + esc(t.name) + '<small>' + teamSize(t) + '명 · ' + sc[i].total + '점</small></h2>' +
      (t.members.length ? '<ul>' + t.members.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '<p>명단 미입력</p>') + '</div>').join('');
}

/* ---------- 관리자 ---------- */
const teamOptions = sel => state.teams.map((t, i) => '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('');
const stepper = (act, gi, i, v) =>
  '<span class="stepper"><button data-act="' + act + '" data-g="' + gi + '" data-t="' + i + '" data-d="-1" aria-label="' + esc(state.teams[i].name) + ' 1명 빼기">−</button>' +
  '<output>' + (v === null ? '–' : v) + '</output>' +
  '<button data-act="' + act + '" data-g="' + gi + '" data-t="' + i + '" data-d="1" aria-label="' + esc(state.teams[i].name) + ' 1명 더하기">+</button></span>';

// 확인이 필요한 버튼(초기화·재추첨)은 시간 제한 없이 화면 안에서 "지우기 / 취소"를 고르게 한다
let confirming = null; // null | 'reset' | 'draw'
let pointerDown = false, adminPending = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
const pointerEnd = () => setTimeout(() => { pointerDown = false; if (adminPending) renderAdmin(); }, 0);
document.addEventListener('pointerup', pointerEnd, true);
document.addEventListener('pointercancel', pointerEnd, true);

// 입력칸 하나를 화면이 다시 그려져도 다시 찾을 수 있게 하는 이름
const fieldKey = x => x.id || (x.dataset.team !== undefined ? 'team' + x.dataset.team + x.dataset.f : null);

function renderAdmin() {
  const el = $('admin');

  if (!isAdmin) {
    // 비밀번호를 치는 중에 다시 그리면 입력이 지워지므로 로그인 화면은 한 번만 만든다
    if (!$('loginform')) {
      el.innerHTML = '<form class="login" id="loginform"><h2>관리자 로그인</h2>' +
        '<p>점수 입력은 관리자 비밀번호가 있어야 할 수 있어요. 학생들은 전광판과 팀 명단만 볼 수 있습니다.</p>' +
        '<input type="password" id="pw" autocomplete="current-password" placeholder="관리자 비밀번호" aria-label="관리자 비밀번호" required>' +
        '<button class="btn primary" type="submit">로그인</button><div class="err" id="loginerr"></div></form>';
    }
    $('loginerr').textContent = loginError;
    return;
  }

  // 버튼을 누르는 도중(손가락·마우스를 떼기 전)에 화면을 갈아 끼우면 그 클릭이 사라진다.
  // 예: 글자칸을 고친 뒤 바로 초기화 버튼을 누르면 칸이 저장되며 다시 그려져 버튼 클릭이 무시됐다
  if (pointerDown) { adminPending = true; return; }
  adminPending = false;

  // 항상 최신 점수로 다시 그리되, 글자를 치던 칸은 쓰던 내용과 커서를 그대로 살린다
  const a = document.activeElement;
  const typing = a && el.contains(a) && a.matches('input, textarea') ? {
    key: fieldKey(a), value: a.value,
    start: a.selectionStart, end: a.selectionEnd,
  } : null;
  el.innerHTML = adminHtml();
  if (typing && typing.key) {
    const x = [...el.querySelectorAll('input, textarea')].find(n => fieldKey(n) === typing.key);
    if (x) {
      x.value = typing.value; x.focus();
      try { x.setSelectionRange(typing.start, typing.end); } catch (e) {}
    }
  }
}

function adminHtml() {
  const sc = scores(state), t = state.timer;
  let h = '<div class="adminbar">' + (mode === 'local'
    ? '<div class="notice">Firebase가 연결되지 않아 이 기기에만 저장됩니다. 휴대폰에서 함께 보려면 README의 Firebase 연결을 먼저 하세요.</div>'
    : '<span class="rule">관리자로 로그인됨 · 입력하면 모든 화면에 바로 반영됩니다</span><button class="small" data-act="logout">로그아웃</button>') + '</div>';
  if (flash) h += '<div class="notice' + (flash.bad ? ' warn' : ' ok') + '" role="status">' + esc(flash.text) + '</div>';

  h += '<section class="block"><header><h2>타이머</h2><span class="rule">전광판에 크게 표시됩니다 · 노트북에서는 Space 키로 시작·정지</span></header>' +
    '<div class="timerctl"><span class="big" id="i-time">' + fmt(timeLeft()) + '</span>' +
    (t.endsAt ? '<button class="btn" data-act="t-toggle">일시정지</button>' : '<button class="btn primary" data-act="t-toggle">시작</button>') +
    '<button class="btn" data-act="t-reset">처음으로</button>' +
    '<button class="small" data-act="t-set" data-v="480">8분</button><button class="small" data-act="t-set" data-v="600">10분</button>' +
    '<button class="small" data-act="t-add" data-v="60">+1분</button><button class="small" data-act="t-add" data-v="-60">−1분</button></div>' +
    '<label class="line"><span class="rule">전광판 표시 문구</span><input type="text" id="t-label" value="' + esc(t.label) + '" maxlength="30" style="flex:1;max-width:320px"></label></section>';

  h += '<section class="block"><header><h2>좀비게임</h2><span class="rule">경기 끝나고 팀별 생존 인원을 넣으세요 · 술래팀 잡은 사람당 2점 · 생존자 1명당 5점</span></header><div class="grid">';
  state.zombie.forEach((g, gi) => {
    const caught = zombieCaught(g, state.teams);
    h += '<div class="card' + (zombieDone(g, state.teams) ? ' done' : '') + '"><h4>' + (gi + 1) + '경기 <label class="chip">술래 <select data-z="' + gi + '">' + teamOptions(g.tagger) + '</select></label></h4>';
    T.forEach(i => { if (i !== g.tagger) h += '<div class="line">' + chip(i) + '<span class="rule">생존</span>' + stepper('z-step', gi, i, sv(g, i)) + '</div>'; });
    h += '<div class="sum"><span>술래 ' + esc(state.teams[g.tagger].name) + ' 잡은 사람 ' + caught + '명 → <b>' + caught * 2 + '점</b></span><button class="small" data-act="z-clear" data-g="' + gi + '">지우기</button></div></div>';
  });
  h += '</div></section>';

  h += '<section class="block"><header><h2>꼬리잡기</h2><span class="rule">6팀 한 판 · 경기 끝나고 팀별 남은 인원을 넣으세요 · 최다 40점(공동 1위 모두) · 모두 전멸시키면 60점 · 나머지 10점</span></header><div class="grid">';
  state.tail.forEach((g, gi) => {
    const r = tailResult(g);
    h += '<div class="card' + (r ? ' done' : '') + '"><h4>' + (gi + 1) + '경기 <span class="rule">남은 인원</span></h4>';
    T.forEach(i => { h += '<div class="line">' + chip(i) + stepper('tail-step', gi, i, sv(g, i)) + '</div>'; });
    h += '<div class="sum"><span>' + (r ? '승리 ' + r.winners.map(i => esc(state.teams[i].name)).join(', ') + ' → <b>' + (r.wipe ? '전멸승 60점' : '40점') + '</b>' : '6팀을 모두 넣으면 결과가 나옵니다') +
      '</span><button class="small" data-act="tail-clear" data-g="' + gi + '">지우기</button></div></div>';
  });
  h += '</div></section>';

  h += '<section class="block"><header><h2>피구</h2><span class="rule">팀당 한 번씩 3경기 · 승리팀 60점 · 패배팀 20점</span></header>' +
    '<div class="line" style="justify-content:flex-start;flex-wrap:wrap">' +
    (confirming === 'draw'
      ? '<span class="rule" style="color:var(--fg)">입력한 피구 결과가 지워집니다. 다시 추첨할까요?</span><button class="btn danger" data-act="draw-yes">다시 추첨</button><button class="btn" data-act="cancel">취소</button>'
      : '<button class="btn" data-act="draw">대진 무작위 추첨</button>') +
    (pairingOk(state.dodge) ? '<span class="rule">6팀 모두 한 번씩 배정됨</span>' : '<span class="rule" style="color:var(--bad)">한 팀이 두 번 나오거나 빠졌어요. 대진을 확인하세요</span>') + '</div><div class="grid">';
  state.dodge.forEach((m, mi) => {
    const A = esc(state.teams[m.a].name), B = esc(state.teams[m.b].name);
    h += '<div class="card' + (m.w ? ' done' : '') + '"><h4>' + (mi + 1) + '경기</h4>' +
      '<div class="vs"><select data-m="' + mi + '" data-f="a" aria-label="' + (mi + 1) + '경기 첫 팀">' + teamOptions(m.a) + '</select><span>vs</span><select data-m="' + mi + '" data-f="b" aria-label="' + (mi + 1) + '경기 둘째 팀">' + teamOptions(m.b) + '</select></div>' +
      '<div class="results">' + [['a', A + ' 승'], ['b', B + ' 승']].map(([k, l]) =>
        '<button data-act="dodge-w" data-m="' + mi + '" data-v="' + k + '" aria-pressed="' + (m.w === k) + '">' + l + '</button>').join('') + '</div></div>';
  });
  h += '</div></section>';

  h += '<section class="block"><header><h2>팀 · 명단 설정</h2><span class="rule">명단을 넣으면 그 인원수로 좀비게임·꼬리잡기 인원을 셉니다 · 명단은 학생 화면에 공개됩니다</span></header>' +
    '<label class="line"><span class="rule">대회 이름</span><input type="text" id="cfg-title" value="' + esc(state.title) + '" maxlength="30" style="flex:1;max-width:360px"></label><div class="teams">';
  state.teams.forEach((tm, i) => {
    h += '<div class="tset" style="--tc:' + COLORS[i] + '"><label>팀 이름<input type="text" data-team="' + i + '" data-f="name" value="' + esc(tm.name) + '" maxlength="12"></label>' +
      '<label>명단 (한 줄에 한 명, 또는 쉼표로 구분)<textarea data-team="' + i + '" data-f="members" placeholder="예) 김민준&#10;이서연">' + esc(tm.members.join('\n')) + '</textarea></label>' +
      (tm.members.length
        ? '<span class="rule">' + tm.members.length + '명 · 총 ' + sc[i].total + '점</span>'
        : '<label class="line" style="flex-direction:row">명단 없이 인원만<input type="number" min="1" max="20" data-team="' + i + '" data-f="n" value="' + tm.n + '">명</label>') +
      '</div>';
  });
  h += '</div><div class="line" style="justify-content:flex-start;flex-wrap:wrap">' +
    (confirming === 'reset'
      ? '<span class="rule" style="color:var(--fg)">좀비게임·꼬리잡기·피구 결과와 타이머를 모두 지울까요?</span><button class="btn danger" data-act="reset-yes">모두 지우기</button><button class="btn" data-act="cancel">취소</button>'
      : '<button class="btn danger" data-act="reset">모든 점수 초기화</button>') +
    '<span class="rule">팀 이름과 명단은 남습니다</span></div></section>';
  return h;
}

function render() { renderBoard(); renderRoster(); renderAdmin(); tick(); }

/* ---------- 입력 이벤트 ---------- */
const adminEl = $('admin');
adminEl.addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('pw').value;
  if (!fb) { loginError = 'Firebase에 아직 연결되지 않았어요. 잠시 후 다시 시도하세요.'; $('loginerr').textContent = loginError; return; }
  loginError = '';
  try { await fb.signIn(pw); }
  catch (err) {
    const c = err && err.code;
    loginError = c === 'auth/too-many-requests' ? '여러 번 틀려서 잠시 막혔어요. 조금 뒤에 다시 시도하세요.'
      : c === 'auth/network-request-failed' ? '인터넷 연결을 확인하세요.'
      : '비밀번호가 맞지 않아요.';
    const box = $('loginerr'); if (box) box.textContent = loginError;
  }
});

adminEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act, t = state.timer;
  if (act === 'logout') { fb && fb.signOut(); return; }
  if (!isAdmin) return;
  const step = (g, i, d) => {
    const n = teamSize(state.teams[i]), v = sv(g, i);
    // 빈칸(–)에서 + 는 전체 인원, − 는 0. 0에서 한 번 더 − 를 누르면 다시 빈칸(미입력)
    if (v === 0 && d < 0) delete g.surv['t' + i];
    else g.surv['t' + i] = v !== null ? Math.min(n, Math.max(0, v + d)) : (d > 0 ? n : 0);
  };
  if (act === 'cancel') { confirming = null; renderAdmin(); return; }
  if (act === 'reset') { confirming = 'reset'; renderAdmin(); return; }
  if (act === 'draw' && state.dodge.some(m => m.w)) { confirming = 'draw'; renderAdmin(); return; }
  if (act === 'reset-yes') {
    confirming = null;
    state = Object.assign(defaultState(), { title: state.title, teams: state.teams });
    save('모든 점수를 지웠습니다.');
    return;
  }
  if (act === 'draw' || act === 'draw-yes') {
    confirming = null;
    state.dodge = drawPairs();
    save('피구 대진을 새로 추첨했습니다.');
    return;
  }
  if (act === 't-toggle') timerToggle();
  else if (act === 't-reset') { t.endsAt = null; t.left = t.dur; }
  else if (act === 't-set') { t.dur = +b.dataset.v; t.left = t.dur; t.endsAt = null; }
  else if (act === 't-add') {
    const d = +b.dataset.v;
    if (t.endsAt) t.endsAt = Math.max(now(), t.endsAt + d * 1000); else t.left = Math.max(0, t.left + d);
  }
  else if (act === 'z-step') step(state.zombie[+b.dataset.g], +b.dataset.t, +b.dataset.d);
  else if (act === 'z-clear') state.zombie[+b.dataset.g].surv = {};
  else if (act === 'tail-step') step(state.tail[+b.dataset.g], +b.dataset.t, +b.dataset.d);
  else if (act === 'tail-clear') state.tail[+b.dataset.g].surv = {};
  else if (act === 'dodge-w') { const m = state.dodge[+b.dataset.m]; m.w = m.w === b.dataset.v ? null : b.dataset.v; }
  else return;
  save();
});

adminEl.addEventListener('change', e => {
  const x = e.target; if (!isAdmin) return;
  if (x.dataset.z !== undefined) { const g = state.zombie[+x.dataset.z]; g.tagger = +x.value; delete g.surv['t' + g.tagger]; }
  else if (x.dataset.m !== undefined) state.dodge[+x.dataset.m][x.dataset.f] = +x.value;
  else if (x.dataset.team !== undefined) {
    const i = +x.dataset.team, tm = state.teams[i];
    if (x.dataset.f === 'name') tm.name = x.value.trim().slice(0, 12) || (i + 1) + '팀';
    else if (x.dataset.f === 'members') tm.members = parseMembers(x.value);
    else tm.n = Math.min(20, Math.max(1, Math.round(+x.value) || 6));
  }
  else if (x.id === 'cfg-title') state.title = x.value.trim().slice(0, 30) || '학급 단합대회';
  else if (x.id === 't-label') state.timer.label = x.value.trim().slice(0, 30);
  else return;
  x.blur(); save();
});
adminEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="number"]')) e.target.blur(); });

/* ---------- 탭 · 전체 화면 · 단축키 ---------- */
function show(v) {
  view = v;
  ['board', 'roster', 'admin'].forEach(k => {
    $(k).hidden = k !== v;
    $('tab-' + k).setAttribute('aria-selected', k === v);
  });
  try { history.replaceState(null, '', v === 'board' ? location.pathname : '#' + v); } catch (e) {}
  if (v === 'admin' && !isAdmin) setTimeout(() => { const p = $('pw'); if (p) p.focus(); }, 0);
}
document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => show(b.dataset.view); });

function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
}
async function toggleFs() {
  unlockAudio(); show('board');
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (e) {}
}
$('fs').onclick = toggleFs;
// 소리는 화면을 한 번 누른 뒤부터 낼 수 있다 (타이머 종료 부저)
document.addEventListener('pointerdown', unlockAudio, { once: true });

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' && isAdmin) { e.preventDefault(); timerToggle(); save(); }
  else if (k === 'r' && isAdmin) { state.timer.endsAt = null; state.timer.left = state.timer.dur; save(); }
  else if (k === 'i') show('admin');
  else if (k === 'b') show('board');
  else if (k === 'f') toggleFs();
});

const viewFromHash = () => (['roster', 'admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'board');
window.addEventListener('hashchange', () => show(viewFromHash()));
show(viewFromHash());
connect();
