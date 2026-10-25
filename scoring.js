// 경기 규칙과 점수 계산. 화면·저장과 분리해 두어 node --test 로 바로 검사한다.
//
// 좀비게임  6경기(팀마다 한 번 술래), 8분. 술래팀은 잡은 사람 1명당 2점, 나머지 팀은 생존자 1명당 5점
// 꼬리잡기  6팀이 한 판에 모두 참여, 3경기, 10분. 남은 인원 최다 팀 40점(공동 1위 모두),
//           시간 안에 나머지를 모두 전멸시키면 60점, 그 밖의 팀 10점
// 피구      팀당 한 번씩 3경기. 승리팀 60점, 패배팀 20점

export const T = [0, 1, 2, 3, 4, 5];

// 생존 인원은 { t0: 3, t1: 0, ... } 처럼 문자 키로 저장한다.
// 숫자 키를 쓰면 Firebase Realtime Database 가 배열로 바꿔 버리기 때문이다.
export const sv = (g, i) => (g.surv && Number.isFinite(g.surv['t' + i]) ? g.surv['t' + i] : null);

export function defaultState() {
  return {
    title: '학급 단합대회',
    // 35명 → 6명 5팀 + 5명 1팀. members 를 채우면 그 인원수가 n 대신 쓰인다
    teams: T.map(i => ({ name: (i + 1) + '팀', n: i === 5 ? 5 : 6, members: [] })),
    zombie: T.map(i => ({ tagger: i, surv: {} })),
    tail: [0, 1, 2].map(() => ({ surv: {} })),
    dodge: [{ a: 0, b: 5, w: null }, { a: 1, b: 4, w: null }, { a: 2, b: 3, w: null }],
    timer: { dur: 480, left: 480, endsAt: null, label: '좀비게임 1경기' },
  };
}

// 저장소에서 읽은 값을 언제나 완전한 모양으로 맞춘다 (Firebase 는 빈 객체·빈 배열·null 을 지운다)
export function normalize(d) {
  const base = defaultState();
  if (!d || typeof d !== 'object') return base;
  const arr = (x, len) => Array.from({ length: len }, (_, i) => (x && x[i]) || null);
  const surv = s => {
    const o = {};
    if (s && typeof s === 'object') T.forEach(i => { const v = s['t' + i]; if (Number.isFinite(v)) o['t' + i] = v; });
    return o;
  };
  const team = (t, i) => ({
    name: (t && typeof t.name === 'string' && t.name) || base.teams[i].name,
    n: t && Number.isFinite(t.n) ? t.n : base.teams[i].n,
    members: t && t.members ? Object.values(t.members).filter(m => typeof m === 'string' && m) : [],
  });
  const idx = (v, d) => (Number.isInteger(v) && v >= 0 && v < 6 ? v : d);
  return {
    title: (typeof d.title === 'string' && d.title) || base.title,
    teams: arr(d.teams, 6).map(team),
    zombie: arr(d.zombie, 6).map((g, i) => ({ tagger: idx(g && g.tagger, i), surv: surv(g && g.surv) })),
    tail: arr(d.tail, 3).map(g => ({ surv: surv(g && g.surv) })),
    dodge: arr(d.dodge, 3).map((m, k) => ({
      a: idx(m && m.a, base.dodge[k].a), b: idx(m && m.b, base.dodge[k].b),
      w: m && (m.w === 'a' || m.w === 'b') ? m.w : null,
    })),
    timer: Object.assign(base.timer, d.timer || {}, { endsAt: (d.timer && d.timer.endsAt) || null }),
  };
}

export const teamSize = t => (t.members && t.members.length) || t.n;

export function zombieDone(g, teams) {
  return teams.every((_, i) => i === g.tagger || sv(g, i) !== null);
}
export function zombieStarted(g) {
  return T.some(i => i !== g.tagger && sv(g, i) !== null);
}
export function zombieCaught(g, teams) {
  let c = 0;
  teams.forEach((t, i) => { if (i !== g.tagger && sv(g, i) !== null) c += Math.max(0, teamSize(t) - sv(g, i)); });
  return c;
}

// 6팀 인원이 다 들어가야 결과가 난다
export function tailResult(g) {
  if (!T.every(i => sv(g, i) !== null)) return null;
  const max = Math.max(...T.map(i => sv(g, i)));
  if (max <= 0) return null;
  const winners = T.filter(i => sv(g, i) === max);
  return { winners, wipe: winners.length === 1 && T.every(i => winners.includes(i) || sv(g, i) === 0) };
}

export function scores(s) {
  const out = s.teams.map(() => ({ zombie: 0, tail: 0, dodge: 0, total: 0 }));
  s.zombie.forEach(g => {
    if (!zombieStarted(g)) return;
    out[g.tagger].zombie += 2 * zombieCaught(g, s.teams);
    T.forEach(i => { if (i !== g.tagger && sv(g, i) !== null) out[i].zombie += 5 * sv(g, i); });
  });
  s.tail.forEach(g => {
    const r = tailResult(g); if (!r) return;
    T.forEach(i => { out[i].tail += r.winners.includes(i) ? (r.wipe ? 60 : 40) : 10; });
  });
  s.dodge.forEach(m => {
    if (!m.w || m.a === m.b) return;
    out[m.w === 'a' ? m.a : m.b].dodge += 60;
    out[m.w === 'a' ? m.b : m.a].dodge += 20;
  });
  out.forEach(o => { o.total = o.zombie + o.tail + o.dodge; });
  return out;
}

// 6팀이 정확히 한 번씩 나오는 피구 대진인지
export function pairingOk(ms) {
  const seen = ms.flatMap(m => [m.a, m.b]);
  return seen.length === 6 && new Set(seen).size === 6;
}
export function drawPairs(rand = Math.random) {
  const t = [...T];
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return [0, 2, 4].map(k => ({ a: t[k], b: t[k + 1], w: null }));
}

// 명단 입력칸: 줄바꿈이나 쉼표로 나눈다
export function parseMembers(text) {
  return String(text).split(/[\n,]/).map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 20);
}
