# class-scoreboard

학급 단합대회(좀비게임 · 꼬리잡기 · 피구) 실시간 점수 전광판.

- **전광판**: 체육관 프로젝터에 띄우는 순위·타이머·대진 화면
- **팀 명단**: 학생들이 휴대폰으로 보는 팀별 명단
- **점수 입력**: 관리자 비밀번호로 로그인한 사람만 입력. 입력하면 모든 화면에 바로 반영

## 경기 규칙

| 종목 | 진행 | 점수 |
| --- | --- | --- |
| 좀비게임 | 6경기, 8분. 팀마다 한 번씩 술래 | 술래팀: 잡은 사람 1명당 2점 · 나머지 팀: 생존자 1명당 5점 |
| 꼬리잡기 | 6팀이 한 판에 모두 참여, 3경기, 10분 | 남은 인원 최다 팀 40점(공동 1위 모두) · 시간 안에 나머지를 모두 전멸시키면 60점 · 그 밖의 팀 10점 |
| 피구 | 팀당 한 번씩 3경기 (대진 추첨 가능) | 승리팀 60점 · 패배팀 20점 |

규칙 계산은 `scoring.js` 한 곳에 있고, `npm test`로 검사한다.

## 파일

- `index.html`, `style.css`, `app.js` — 화면
- `scoring.js` — 경기 규칙과 점수 계산
- `firebase-config.js` — Firebase 연결 값과 관리자 이메일
- `database.rules.json` — Firebase 보안 규칙 (누구나 읽기, 관리자만 쓰기)
- `tests/` — 점수 계산 테스트

## Firebase 연결 (휴대폰 실시간 보기와 관리자 비밀번호에 필요)

`firebase-config.js`가 `null`이면 Firebase 없이 그 기기 브라우저에만 저장된다(인터넷 없이 노트북 한 대로 쓸 때).

1. <https://console.firebase.google.com> 에서 **프로젝트 추가** → 이름 `class-scoreboard` (Google 애널리틱스는 꺼도 됨)
2. **빌드 → Realtime Database → 데이터베이스 만들기** → 위치 `싱가포르(asia-southeast1)` → **잠금 모드로 시작**
3. Realtime Database의 **규칙** 탭에 `database.rules.json` 내용을 붙여넣고 **게시**
4. **빌드 → Authentication → 시작하기 → 이메일/비밀번호** 사용 설정
5. Authentication **사용자** 탭 → **사용자 추가**
   - 이메일: `class-scoreboard-admin@example.com` (`firebase-config.js`의 `ADMIN_EMAIL`과 같아야 함)
   - 비밀번호: 관리자 비밀번호 (6자 이상). 화면에서는 이 비밀번호만 입력한다
6. Authentication **설정 → 사용자 작업**에서 **생성(가입) 사용 설정**을 끈다 (다른 사람이 계정을 만들지 못하게)
7. **프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹(</>)** 으로 앱 등록 → 나오는 `firebaseConfig` 값을 `firebase-config.js`의 `null` 자리에 붙여넣고 커밋·푸시

## 실행

```bash
npm start
```

브라우저에서 <http://localhost:8080> 을 연다. GitHub Pages에 올리면 `https://<사용자>.github.io/class-scoreboard/` 에서 열린다.

## 노트북 단축키 (관리자 로그인 상태)

`Space` 타이머 시작·정지 · `R` 타이머 처음으로 · `I` 점수 입력 · `B` 전광판 · `F` 전체 화면

## 개인정보

팀 명단은 링크를 아는 누구나 볼 수 있다. 성 없이 이름만, 또는 별명으로 입력하는 것을 권한다. 행사가 끝나면 점수 입력 화면에서 명단을 지운다.
