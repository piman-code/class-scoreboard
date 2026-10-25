import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, normalize, scores, tailResult, pairingOk, drawPairs, parseMembers } from '../scoring.js';

const totals = s => scores(s).map(x => x.total);

test('좀비게임: 술래는 잡은 사람당 2점, 생존팀은 1명당 5점', () => {
  const s = defaultState();
  s.zombie[2].surv = { t0: 1, t1: 0, t3: 6, t4: 2, t5: 5 };
  // 잡힌 사람: (6-1)+(6-0)+(6-6)+(6-2)+(5-5) = 15
  assert.deepEqual(scores(s).map(x => x.zombie), [5, 0, 30, 30, 10, 25]);
});

test('좀비게임: 명단을 넣으면 그 인원수로 잡힌 사람을 센다', () => {
  const s = defaultState();
  s.teams[1].members = ['가', '나', '다', '라', '마', '바', '사'];
  s.zombie[0].surv = { t1: 2 };
  assert.equal(scores(s)[0].zombie, 2 * 5);
});

test('꼬리잡기: 최다 생존 40점, 공동 1위 모두 40점, 나머지 10점', () => {
  const s = defaultState();
  s.tail[0].surv = { t0: 3, t1: 0, t2: 2, t3: 3, t4: 1, t5: 0 };
  assert.deepEqual(scores(s).map(x => x.tail), [40, 10, 10, 40, 10, 10]);
});

test('꼬리잡기: 나머지가 모두 0명이면 전멸승 60점', () => {
  const s = defaultState();
  s.tail[1].surv = { t0: 0, t1: 4, t2: 0, t3: 0, t4: 0, t5: 0 };
  assert.deepEqual(scores(s).map(x => x.tail), [10, 60, 10, 10, 10, 10]);
});

test('꼬리잡기: 6팀을 다 넣기 전에는 점수가 없다', () => {
  const s = defaultState();
  s.tail[2].surv = { t0: 1, t1: 2 };
  assert.equal(tailResult(s.tail[2]), null);
  assert.deepEqual(totals(s), [0, 0, 0, 0, 0, 0]);
});

test('피구: 승리 60점, 패배 20점', () => {
  const s = defaultState();
  s.dodge[2].w = 'b'; // 3팀 vs 4팀 → 4팀(인덱스 3) 승
  assert.deepEqual(scores(s).map(x => x.dodge), [0, 0, 20, 60, 0, 0]);
});

test('피구 추첨은 언제나 6팀을 한 번씩 배정한다', () => {
  for (let i = 0; i < 300; i++) assert.ok(pairingOk(drawPairs()));
  assert.equal(pairingOk([{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 4, b: 5 }]), false);
});

test('Firebase가 빈 값을 지운 데이터도 완전한 모양으로 복원한다', () => {
  const s = normalize({ title: '3반', teams: [{ name: '호랑이', n: 6 }], zombie: [{ tagger: 0 }], dodge: [null, { a: 1, b: 4, w: 'a' }] });
  assert.equal(s.teams.length, 6);
  assert.equal(s.teams[0].name, '호랑이');
  assert.deepEqual(s.teams[0].members, []);
  assert.deepEqual(s.zombie[0].surv, {});
  assert.equal(s.tail.length, 3);
  assert.equal(s.dodge[1].w, 'a');
  assert.equal(s.timer.endsAt, null);
});

test('명단 입력은 줄바꿈과 쉼표로 나눈다', () => {
  assert.deepEqual(parseMembers('김민준\n 이서연 ,박지호,,\n'), ['김민준', '이서연', '박지호']);
});
