// Firebase 웹 앱 설정. README의 "Firebase 연결" 순서대로 콘솔에서 복사해 붙여넣는다.
// 이 값들은 공개돼도 되는 식별자이고, 실제 보안은 database.rules.json 규칙이 맡는다.
// null 이면 Firebase 없이 이 기기 브라우저에만 저장하는 모드로 동작한다.
export const firebaseConfig = {
  apiKey: 'AIzaSyDp0ciWC9eS1XX_HQkD-R5Xnctf8rIogtM',
  authDomain: 'class-scoreboard.firebaseapp.com',
  databaseURL: 'https://class-scoreboard-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'class-scoreboard',
  storageBucket: 'class-scoreboard.firebasestorage.app',
  messagingSenderId: '1003773865820',
  appId: '1:1003773865820:web:f4c31cbd6b3165fa61db99',
};

// 관리자 계정 이메일. 관리자는 화면에서 비밀번호만 입력한다.
// 바꾸면 database.rules.json 안의 같은 이메일도 함께 바꿔야 한다.
export const ADMIN_EMAIL = 'class-scoreboard-admin@example.com';
