# 공구마을 (PWA 프로토타입)

동네 공구 · 인스타/라이브 공구 · 농가 직거래 경매를 한 곳에서 하는 소셜 공구 앱의 웹앱 프로토타입.

## 실행

```
powershell -ExecutionPolicy Bypass -File gonggu-app/serve.ps1
```

브라우저에서 http://localhost:8080 접속. 휴대폰에서 카메라·GPS를 쓰려면 HTTPS로 배포해야 한다 (예: GitHub Pages, Netlify에 폴더 그대로 업로드). 배포 후 "홈 화면에 추가"하면 앱처럼 실행된다.

## 구조

| 파일 | 내용 |
|---|---|
| `js/categories.js` | 대/중/소분류 카테고리 |
| `js/store.js` | 데이터 저장소 (현재 localStorage, 서버 연동 시 이 파일만 교체) |
| `js/app.js` | 화면: 로그인/회원가입, 홈, 카테고리, 상세, 상품등록, 마이페이지 |
| `css/style.css` | 스타일 |
| `sw.js`, `manifest.webmanifest` | PWA (오프라인 캐시, 홈 화면 설치) |

## 현재 한계 (프로토타입)

- 데이터가 각 기기 브라우저에만 저장된다. 여러 사용자가 실제로 함께 쓰려면 서버(DB·회원 인증·이미지 저장소)가 필요하다.
- 첫 가입 시 가입 위치 주변에 샘플 상품이 자동 생성된다.
