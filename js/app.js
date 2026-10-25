// 공구마을 – 화면 렌더링과 이벤트 처리
// 해시 라우팅: #/home, #/local, #/group, #/auction, #/my, #/register, #/detail/:id
const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');

const TYPES = {
  local: { name: '동네', desc: '우리 동네 이웃끼리' },
  group: { name: '공구', desc: '인스타·라이브 연계' },
  auction: { name: '경매', desc: '농가 직거래 경매' },
};
const NAV = [['home', '홈'], ['local', '동네'], ['group', '공구'], ['auction', '경매'], ['my', '마이페이지']];
const RADII = [500, 1000, 2000];
const DEFAULT_LOC = { lat: 37.5663, lng: 126.9779, label: '서울시청(테스트)' };
const LIST_PAGES = ['home', 'local', 'group', 'auction'];

const S = {
  route: null,
  cats: { home: [], local: [], group: [], auction: [] },   // 페이지별 [대, 중, 소] 필터
  q: { home: '', local: '', group: '', auction: '' },      // 페이지별 검색어
  scroll: {},                                             // 가로 스크롤 위치 유지
  calMonth: firstOfMonth(new Date()),
  calSel: dkey(new Date()),
  myTab: 'interest',
  authMode: 'login',
  signupLoc: null,
  reg: null,
};

// ---------- 유틸 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const perPerson = (total, recruit) => recruit > 0 ? Math.ceil(total / recruit) : 0;
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function dkey(d) { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtDate(iso, withTime = true) {
  const d = new Date(iso), days = '일월화수목금토';
  let s = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  if (withTime) s += ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return s;
}
function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
function remain(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return '마감';
  const h = Math.floor(ms / 3600e3);
  return h >= 24 ? `${Math.floor(h / 24)}일 남음` : `${h}시간 남음`;
}
function distance(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
const fmtRadius = r => r < 1000 ? `${r}m` : `${r / 1000}km`;
function toLocalInput(d) {
  d = new Date(d);
  return `${dkey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// offset주 뒤 월요일 0시
function weekStart(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
const go = path => { location.hash = '#/' + path; };
const matchCat = (p, cat) => cat.every((c, i) => p.cat[i] === c);
const matchQuery = (p, q) => !q || [p.title, p.desc, ...p.cat].join(' ').toLowerCase().includes(q.trim().toLowerCase());
const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const byStart = (a, b) => new Date(a.startAt) - new Date(b.startAt);

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('이 기기에서는 위치 기능을 사용할 수 없습니다.'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.code === 1 ? '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 접근을 허용해 주세요.' : '현재 위치를 가져오지 못했습니다.')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

// 동네 상품은 내 위치 기준 설정 반경 안에 있는 것만
function visible(list) {
  const me = Store.currentUser();
  return list.filter(p => p.type !== 'local' || (p.location && distance(me.location, p.location) <= me.radius));
}

// ---------- 공통 컴포넌트 ----------
const thumb = p => p.photos?.length ? `<img src="${p.photos[0]}" alt="">` : icon(p.cat[0], 34);

function itemCard(p) {
  const me = Store.currentUser();
  const closed = new Date(p.deadline) < Date.now();
  const heart = Store.isInterested(p.id) ? ` <span class="liked">${icon('heart', 14, 'filled')}</span>` : '';
  let meta, price;
  if (p.type === 'local') {
    meta = `${fmtDist(distance(me.location, p.location))} · ${timeAgo(p.createdAt)} · ${remain(p.deadline)}`;
  } else {
    meta = `${fmtDate(p.startAt)} 시작 · ${p.type === 'auction' ? '경매마감' : '마감'} ${fmtDate(p.deadline, false)}`;
  }
  if (p.type === 'auction') {
    const cur = Store.currentPrice(p);
    price = `현재가 ${won(cur)} <small>1인 ${won(perPerson(cur, p.recruit))}</small>`;
  } else {
    price = `1인 ${won(perPerson(p.totalPrice, p.recruit))} <small>총 ${won(p.totalPrice)}</small>`;
  }
  const count = p.type === 'auction' ? `입찰 ${p.bids.length}건 · ${p.recruit}명 분배` : `${p.participants.length}/${p.recruit}명 참여`;
  const pct = p.type === 'auction' ? 0 : Math.min(100, p.participants.length / p.recruit * 100);
  return `
    <button class="item" data-go="detail/${p.id}">
      <div class="thumb">${thumb(p)}</div>
      <div class="info">
        <div class="title"><span class="badge ${closed ? 'gray' : p.type}">${closed ? '마감' : TYPES[p.type].name}</span>${esc(p.title)}${heart}</div>
        <div class="meta">${meta}</div>
        <div class="price">${price}</div>
        <div class="meta">${count}</div>
        ${p.type === 'auction' ? '' : `<div class="bar"><i style="width:${pct}%"></i></div>`}
      </div>
    </button>`;
}

const list = (items, emptyMsg) => items.length ? items.map(itemCard).join('') : `<div class="empty">${emptyMsg}</div>`;

function topbar(title) {
  const me = Store.currentUser();
  const left = title
    ? `<h1>${title}</h1>`
    : `<button class="loc-btn" data-go="my">${icon('pin', 18)}${esc(me.location.label)}<small>${fmtRadius(me.radius)}</small></button><span class="spacer"></span>`;
  return `<header class="topbar">${left}<button class="reg-btn" data-go="register">${icon('plus', 16)}상품등록</button></header>`;
}

function searchBar(route) {
  const ph = { home: '공구·경매·동네 상품 검색', local: '우리 동네 상품 검색', group: '공구 상품 검색', auction: '경매 상품 검색' }[route];
  return `<div class="search">${icon('search', 18)}<input type="search" data-search placeholder="${ph}" value="${esc(S.q[route])}" enterkeyhint="search">
    <button class="clear" data-act="clearSearch" ${S.q[route] ? '' : 'hidden'} aria-label="검색어 지우기">${icon('close', 14)}</button></div>`;
}

// 대분류 아이콘 가로 스크롤 + 중/소분류 칩
function catScroller(route, animate) {
  const [l, m, s] = S.cats[route];
  const enter = animate ? ' enter' : '';
  let html = `<div class="cat-scroll${enter}" data-scroller="${route}-l">
    <button class="cat-item ${!l ? 'on' : ''}" data-catpick="" style="--i:0"><span>${icon('grid', 24)}</span>전체</button>
    ${Object.keys(CATEGORIES).map((k, i) => `<button class="cat-item ${l === k ? 'on' : ''}" data-catpick="${esc(k)}" style="--i:${i + 1}"><span>${icon(k, 24)}</span>${esc(k)}</button>`).join('')}
  </div>`;
  if (l) html += `<div class="chips${enter}" data-scroller="${route}-m">
    <button class="chip ${!m ? 'on' : ''}" data-catpick="${esc(l)}" style="--i:0">전체</button>
    ${Object.keys(CATEGORIES[l]).map((k, i) => `<button class="chip ${m === k ? 'on' : ''}" data-catpick="${esc(l + '>' + k)}" style="--i:${i + 1}">${esc(k)}</button>`).join('')}
  </div>`;
  if (m) html += `<div class="chips sub${enter}" data-scroller="${route}-s">
    <button class="chip ${!s ? 'on' : ''}" data-catpick="${esc(l + '>' + m)}" style="--i:0">${esc(m)} 전체</button>
    ${CATEGORIES[l][m].map((k, i) => `<button class="chip ${s === k ? 'on' : ''}" data-catpick="${esc(l + '>' + m + '>' + k)}" style="--i:${i + 1}">${esc(k)}</button>`).join('')}
  </div>`;
  return html;
}

// ---------- 화면: 로그인/회원가입 ----------
function viewAuth() {
  const hero = `<div class="auth-hero"><img src="icon.svg" alt=""><h1>공구마을</h1><p>우리 동네 공구 · SNS 공구 · 농가 경매</p></div>`;
  if (S.authMode === 'login') {
    return `${hero}
      <form class="form" id="loginForm">
        <div class="field"><label>아이디</label><input class="input" name="id" autocomplete="username" required></div>
        <div class="field"><label>비밀번호</label><input class="input" name="pw" type="password" autocomplete="current-password" required></div>
        <div class="err" id="authErr"></div>
        <button class="btn">로그인</button>
        <div class="switch">처음이신가요? <button type="button" data-auth="signup">회원가입</button></div>
      </form>`;
  }
  const loc = S.signupLoc;
  return `${hero}
    <form class="form" id="signupForm">
      <div class="field"><label>아이디</label><input class="input" name="id" placeholder="영문/숫자 4~20자" pattern="[A-Za-z0-9]{4,20}" autocomplete="username" required></div>
      <div class="field"><label>비밀번호</label><input class="input" name="pw" type="password" minlength="6" placeholder="6자 이상" autocomplete="new-password" required></div>
      <div class="field"><label>비밀번호 확인</label><input class="input" name="pw2" type="password" autocomplete="new-password" required></div>
      <div class="field">
        <span class="label">내 동네 설정 (GPS)</span>
        <button type="button" class="btn line icon-btn" data-act="gps">${icon('pin', 18)}현재 위치로 동네 설정</button>
        <div class="loc-box" id="locBox" style="margin-top:8px">${loc ? locText(loc) : '가입하려면 현재 위치를 설정해야 합니다.'}</div>
      </div>
      <div class="field"><label>동네 이름</label><input class="input" name="label" placeholder="예: 역삼동" required value="${esc(loc?.label || '')}"></div>
      <div class="field">
        <span class="label">동네 페이지 노출 반경</span>
        <div class="radio-row">${RADII.map(r => `<label><input type="radio" name="radius" value="${r}" ${r === 1000 ? 'checked' : ''}><span>${fmtRadius(r)}</span></label>`).join('')}</div>
        <div class="hint">설정한 위치를 중심으로 이 반경 안의 동네 상품만 보여요.</div>
      </div>
      <div class="err" id="authErr"></div>
      <button class="btn">가입하기</button>
      <div class="switch">이미 계정이 있나요? <button type="button" data-auth="login">로그인</button></div>
    </form>`;
}

const locText = loc => `위치 설정 완료<br><b>위도 ${loc.lat.toFixed(5)}, 경도 ${loc.lng.toFixed(5)}</b>`;

async function setSignupGps() {
  const box = document.getElementById('locBox');
  box.textContent = '현재 위치를 확인하는 중…';
  try {
    S.signupLoc = await getPosition();
    box.innerHTML = locText(S.signupLoc);
  } catch (e) {
    box.innerHTML = `<span class="err">${esc(e.message)}</span><br><button type="button" class="btn-sm" data-act="defaultLoc" style="margin-top:8px">테스트용 기본 위치(서울시청) 사용</button>`;
  }
}

// ---------- 화면: 홈 / 동네 / 공구 / 경매 ----------
function listPage(route, animate) {
  const title = { home: null, local: null, group: '공구', auction: '경매' }[route];
  return `${topbar(title)}${searchBar(route)}${catScroller(route, animate)}<div id="results">${results(route)}</div>`;
}

function weekSections(items, type) {
  const w0 = weekStart(0), w1 = weekStart(1), w2 = weekStart(2);
  const inRange = (a, b) => items.filter(p => new Date(p.startAt) >= a && new Date(p.startAt) < b).sort(byStart);
  const label = type === 'auction' ? '경매' : '판매';
  return `
    <div class="section"><h2>이번 주 ${label} 시작 <small>${fmtDate(w0, false)} ~ ${fmtDate(new Date(w1 - 1), false)}</small></h2>${list(inRange(w0, w1), '이번 주에 시작하는 상품이 없어요.')}</div>
    <div class="section"><h2>다음 주 ${label} 시작 <small>${fmtDate(w1, false)} ~ ${fmtDate(new Date(w2 - 1), false)}</small></h2>${list(inRange(w1, w2), '다음 주에 시작하는 상품이 없어요.')}</div>`;
}

function results(route) {
  const me = Store.currentUser();
  const q = S.q[route], cat = S.cats[route];
  const filtered = visible(Store.products()).filter(p => matchCat(p, cat) && matchQuery(p, q) && (route === 'home' || p.type === route));
  const filtering = q.trim() || cat.length;

  if (route === 'home') {
    if (filtering) {
      return `<div class="section"><h2>${q.trim() ? `'${esc(q.trim())}' 검색 결과` : esc(cat.join(' > '))} <small>${filtered.length}개</small></h2>
        ${list(filtered.sort(byNewest), '조건에 맞는 상품이 없어요.')}</div>`;
    }
    const w0 = weekStart(0), w1 = weekStart(1);
    const thisWeek = t => filtered.filter(p => p.type === t && new Date(p.startAt) >= w0 && new Date(p.startAt) < w1).sort(byStart).slice(0, 3);
    const more = r => `<button class="more" data-go="${r}">더보기${icon('next', 14)}</button>`;
    return `
      <div class="section"><h2>내 주변 최신 동네 상품 <small>반경 ${fmtRadius(me.radius)}</small>${more('local')}</h2>
        ${list(filtered.filter(p => p.type === 'local').sort(byNewest).slice(0, 3), '반경 안에 등록된 상품이 없어요.')}</div>
      <div class="section"><h2>이번 주 시작하는 공구${more('group')}</h2>${list(thisWeek('group'), '이번 주에 시작하는 공구가 없어요.')}</div>
      <div class="section"><h2>이번 주 시작하는 경매${more('auction')}</h2>${list(thisWeek('auction'), '이번 주에 시작하는 경매가 없어요.')}</div>`;
  }

  if (route === 'local') {
    return `<div class="section"><h2>${q.trim() ? `'${esc(q.trim())}' 검색 결과` : '최신 등록 상품'} <small>${esc(me.location.label)} 반경 ${fmtRadius(me.radius)}</small></h2>
      ${list(filtered.sort(byNewest), filtering ? '조건에 맞는 상품이 없어요.' : '반경 안에 등록된 상품이 없어요.<br>반경을 넓히거나 첫 상품을 등록해 보세요!')}</div>`;
  }

  // 공구/경매: 검색 중이면 기간 상관없이 전체, 아니면 이번 주/다음 주
  if (q.trim()) {
    return `<div class="section"><h2>'${esc(q.trim())}' 검색 결과 <small>${filtered.length}개</small></h2>${list(filtered.sort(byStart), '조건에 맞는 상품이 없어요.')}</div>`;
  }
  return weekSections(filtered, route);
}

// ---------- 화면: 상세 ----------
function viewDetail(id) {
  const p = Store.product(id);
  const backBar = t => `<header class="topbar"><button class="back" data-act="back" aria-label="뒤로">${icon('back', 22)}</button><h1>${t}</h1>`;
  if (!p) return `${backBar('상품')}</header><div class="empty">삭제되었거나 없는 상품입니다.</div>`;
  const me = Store.currentUser();
  const now = Date.now();
  const closed = new Date(p.deadline) < now;
  const notStarted = p.startAt && new Date(p.startAt) > now;
  const mine = p.sellerId === me.id;
  const liked = Store.isInterested(p.id);
  const cur = Store.currentPrice(p);

  const gallery = p.photos.length ? p.photos.map(src => `<img src="${src}" alt="">`).join('') : `<div class="ph">${icon(p.cat[0], 96)}</div>`;

  const rows = [];
  if (p.type === 'auction') {
    rows.push(['시작가(총액)', won(p.totalPrice)], ['현재가', `<span style="color:var(--auction)">${won(cur)}</span>`], ['입찰 단위', won(p.bidUnit)],
      ['분배 인원', `${p.recruit}명`], ['1인당 가격', won(perPerson(cur, p.recruit))], ['경매 시작', fmtDate(p.startAt)], ['경매 마감', `${fmtDate(p.deadline)} · ${remain(p.deadline)}`]);
  } else {
    rows.push(['총 물품가격', won(p.totalPrice)], ['모집인원', `${p.participants.length} / ${p.recruit}명`], ['1인당 가격', `<span style="color:var(--brand)">${won(perPerson(p.totalPrice, p.recruit))}</span>`]);
    if (p.startAt) rows.push(['판매 시작', fmtDate(p.startAt)]);
    rows.push(['모집기한', `${fmtDate(p.deadline)} · ${remain(p.deadline)}`]);
    if (p.type === 'local') rows.push(['거리', `내 위치에서 ${fmtDist(distance(me.location, p.location))}`]);
    if (p.liveAt) rows.push(['라이브 방송', fmtDate(p.liveAt)]);
    if (p.snsLink) rows.push(['공구 링크', `<a href="${esc(p.snsLink)}" target="_blank" rel="noopener">${esc(p.snsLink)}</a>`]);
  }

  let action;
  if (closed) action = `<button class="btn" disabled>마감되었습니다</button>`;
  else if (notStarted) action = `<button class="btn dark" disabled>${fmtDate(p.startAt)} 시작</button>`;
  else if (p.type === 'auction') {
    const min = cur + (p.bids.length ? p.bidUnit : 0);
    action = `<input class="input" id="bidInput" type="number" inputmode="numeric" min="${min}" step="${p.bidUnit}" value="${min}"><button class="btn" data-act="bid" data-id="${p.id}">입찰하기</button>`;
  } else {
    const joined = p.participants.includes(me.id);
    const full = p.participants.length >= p.recruit;
    action = joined
      ? `<button class="btn line" data-act="join" data-id="${p.id}">참여 취소</button>`
      : `<button class="btn" data-act="join" data-id="${p.id}" ${full ? 'disabled' : ''}>${full ? '모집 완료' : `참여하기 · ${won(perPerson(p.totalPrice, p.recruit))}`}</button>`;
  }

  const bids = p.type === 'auction' && p.bids.length
    ? `<div class="bids"><h3 style="font-size:15px">입찰 내역</h3>${[...p.bids].reverse().map(b => `<div><span>${esc(b.userId === me.id ? '나' : b.userId.slice(0, 2) + '***')}</span><span>${won(b.amount)}</span><span style="color:var(--sub)">${timeAgo(b.at)}</span></div>`).join('')}</div>`
    : '';

  return `
    ${backBar(`${TYPES[p.type].name} 상품`)}
      ${mine ? `<button class="icon-only" data-act="delete" data-id="${p.id}" aria-label="삭제">${icon('trash', 20)}</button>` : ''}</header>
    <div class="gallery">${gallery}</div>
    <div class="detail">
      <span class="badge ${p.type}">${TYPES[p.type].name}</span>${mine ? '<span class="badge gray">내 상품</span>' : ''}
      <h2>${esc(p.title)}</h2>
      <div class="path">${esc(p.cat.join(' > '))} · ${timeAgo(p.createdAt)}</div>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${p.type !== 'auction' ? `<div class="bar"><i style="width:${Math.min(100, p.participants.length / p.recruit * 100)}%"></i></div>` : ''}
      <div class="desc">${esc(p.desc)}</div>
      ${bids}
    </div>
    <div class="actionbar">
      <button class="heart ${liked ? 'on' : ''}" data-act="like" data-id="${p.id}">${icon('heart', 24, liked ? 'filled' : '')}<small>${liked ? '담김' : '관심'}</small></button>
      ${action}
    </div>`;
}

// ---------- 화면: 상품등록 ----------
function newReg() {
  const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(20, 0, 0, 0);
  return { type: 'local', cat: ['', '', ''], photos: [], title: '', desc: '', totalPrice: '', recruit: '', bidUnit: '1000', deadline: toLocalInput(d), startAt: '', snsLink: '', liveAt: '' };
}

function viewRegister() {
  const r = S.reg ||= newReg();
  const [l, m] = r.cat;
  const opt = (arr, sel, ph) => `<option value="">${ph}</option>` + arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const isAuction = r.type === 'auction';

  return `
    <header class="topbar"><button class="back" data-act="back" aria-label="뒤로">${icon('back', 22)}</button><h1>상품 등록</h1><button class="btn-sm" data-act="resetReg">초기화</button></header>
    <form class="form" id="regForm" novalidate>
      <div class="field">
        <span class="label">판매 페이지 선택</span>
        <div class="type-cards">${Object.entries(TYPES).map(([k, v]) => `<label><input type="radio" name="type" value="${k}" ${r.type === k ? 'checked' : ''}><span>${icon(k, 26)}${v.name}<small>${v.desc}</small></span></label>`).join('')}</div>
      </div>

      <div class="field">
        <span class="label">카테고리</span>
        <div class="row">
          <select data-cat="0">${opt(Object.keys(CATEGORIES), l, '대분류')}</select>
          <select data-cat="1" ${l ? '' : 'disabled'}>${opt(l ? Object.keys(CATEGORIES[l]) : [], m, '중분류')}</select>
          <select data-cat="2" ${m ? '' : 'disabled'}>${opt(m ? CATEGORIES[l][m] : [], r.cat[2], '소분류')}</select>
        </div>
      </div>

      <div class="field">
        <span class="label">사진 (${r.photos.length}/10)</span>
        <div class="photo-btns">
          <label>${icon('camera', 20)}카메라로 촬영<input type="file" accept="image/*" capture="environment" data-photo></label>
          <label>${icon('image', 20)}사진첩에서 선택<input type="file" accept="image/*" multiple data-photo></label>
        </div>
        ${r.photos.length ? `<div class="photos">${r.photos.map((src, i) => `<div class="${i === 0 ? 'first' : ''}"><img src="${src}" alt=""><button type="button" data-act="rmPhoto" data-i="${i}" aria-label="사진 삭제">${icon('close', 12)}</button></div>`).join('')}</div>` : ''}
      </div>

      <div class="field"><label>상품명</label><input class="input" data-bind="title" maxlength="60" value="${esc(r.title)}" placeholder="예: 제주 감귤 10kg 나눠요"></div>
      <div class="field"><label>상세 설명</label><textarea data-bind="desc" placeholder="수령 방법, 장소, 상품 상태 등을 적어주세요">${esc(r.desc)}</textarea></div>

      ${r.type === 'group' ? `
        <div class="field"><label>인스타그램 / 라이브방송 링크</label><input class="input" data-bind="snsLink" type="url" value="${esc(r.snsLink)}" placeholder="https://instagram.com/..."></div>
        <div class="field"><label>라이브 방송 일시 (선택)</label><input class="input" data-bind="liveAt" type="datetime-local" value="${esc(r.liveAt)}"></div>` : ''}

      <div class="row">
        <div class="field"><label>${isAuction ? '경매 시작가 (총액)' : '총 물품가격'}</label><input class="input" data-bind="totalPrice" type="number" inputmode="numeric" min="0" value="${esc(r.totalPrice)}" placeholder="원"></div>
        <div class="field"><label>${isAuction ? '분배 인원' : '모집인원'}</label><input class="input" data-bind="recruit" type="number" inputmode="numeric" min="2" value="${esc(r.recruit)}" placeholder="명"></div>
      </div>
      ${isAuction ? `<div class="field"><label>입찰 단위</label><input class="input" data-bind="bidUnit" type="number" inputmode="numeric" min="100" step="100" value="${esc(r.bidUnit)}"></div>` : ''}

      <div class="calc" id="calc">${calcHtml(r)}</div>

      ${r.type !== 'local' ? `<div class="field"><label>${isAuction ? '경매' : '판매'} 시작 일시</label><input class="input" data-bind="startAt" type="datetime-local" value="${esc(r.startAt)}"><div class="hint">'이번 주 / 다음 주 시작' 목록에 이 날짜 기준으로 노출돼요.</div></div>` : ''}
      <div class="field"><label>${isAuction ? '경매 마감 일시' : '모집기한'}</label><input class="input" data-bind="deadline" type="datetime-local" value="${esc(r.deadline)}"></div>

      <div class="err" id="regErr"></div>
      <button class="btn">등록하기</button>
    </form>`;
}

function calcHtml(r) {
  const total = Number(r.totalPrice) || 0, n = Number(r.recruit) || 0;
  const label = r.type === 'auction' ? '시작가 기준 ' : '';
  return `
    <div class="line"><span>${r.type === 'auction' ? '경매 시작가' : '총 물품가격'}</span><b>${won(total)}</b></div>
    <div class="line"><span>${r.type === 'auction' ? '분배 인원' : '모집인원'}</span><b>${n ? n + '명' : '-'}</b></div>
    <div class="line total"><span>${label}1인당 가격</span><span>${n >= 1 ? won(perPerson(total, n)) : '-'}</span></div>
    <div class="hint" style="font-size:12px;color:var(--sub);margin-top:4px">총 물품가격 ÷ 모집인원 (원 단위 올림)</div>`;
}

// 사진을 최대 1080px JPEG로 줄여서 저장 (저장 공간 절약)
function resizeImage(file, max = 1080) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function submitRegister() {
  const r = S.reg, err = document.getElementById('regErr');
  const total = Number(r.totalPrice), n = Number(r.recruit);
  const deadline = new Date(r.deadline), startAt = r.startAt ? new Date(r.startAt) : null;
  const problems = [];
  if (r.cat.some(c => !c)) problems.push('카테고리를 소분류까지 선택해 주세요.');
  if (!r.photos.length) problems.push('사진을 1장 이상 등록해 주세요.');
  if (!r.title.trim()) problems.push('상품명을 입력해 주세요.');
  if (!(total > 0)) problems.push('가격을 입력해 주세요.');
  if (!(n >= 2) || !Number.isInteger(n)) problems.push('인원은 2명 이상 정수로 입력해 주세요.');
  if (r.type === 'auction' && !(Number(r.bidUnit) > 0)) problems.push('입찰 단위를 입력해 주세요.');
  if (isNaN(deadline) || deadline <= Date.now()) problems.push('마감 일시는 현재 이후여야 합니다.');
  if (r.type !== 'local') {
    if (!startAt) problems.push('시작 일시를 입력해 주세요.');
    else if (startAt >= deadline) problems.push('시작 일시는 마감 일시보다 앞서야 합니다.');
  }
  if (problems.length) { err.innerHTML = problems.map(esc).join('<br>'); err.scrollIntoView({ block: 'center' }); return; }

  const me = Store.currentUser();
  const p = Store.addProduct({
    type: r.type, cat: [...r.cat], photos: r.photos, title: r.title.trim(), desc: r.desc.trim(),
    totalPrice: total, recruit: n, deadline: deadline.toISOString(), sellerId: me.id,
    ...(r.type === 'local' && { location: { lat: me.location.lat, lng: me.location.lng } }),
    ...(r.type !== 'local' && { startAt: startAt.toISOString() }),
    ...(r.type === 'group' && { snsLink: r.snsLink.trim(), liveAt: r.liveAt ? new Date(r.liveAt).toISOString() : null }),
    ...(r.type === 'auction' && { bidUnit: Number(r.bidUnit) }),
  });
  if (!p) return;
  S.reg = null;
  toast('상품이 등록되었어요');
  location.replace('#/detail/' + p.id);
}

// ---------- 화면: 마이페이지 ----------
function calendarEvents() {
  const events = {};
  const add = (iso, ev) => { if (!iso) return; (events[dkey(iso)] ||= []).push(ev); };
  for (const id of Store.interests()) {
    const p = Store.product(id);
    if (!p) continue;
    add(p.startAt || p.createdAt, { p, kind: 'start', text: p.type === 'local' ? '등록' : p.type === 'auction' ? '경매시작' : '판매시작', at: p.startAt || p.createdAt });
    if (p.liveAt) add(p.liveAt, { p, kind: 'live', text: '라이브', at: p.liveAt });
    add(p.deadline, { p, kind: 'end', text: p.type === 'auction' ? '경매마감' : '모집마감', at: p.deadline });
  }
  return events;
}

function calendarHtml() {
  const events = calendarEvents();
  const month = S.calMonth;
  const start = new Date(month); start.setDate(1 - month.getDay());
  const today = dkey(new Date());
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((month.getDay() + daysInMonth) / 7) * 7;
  let cells = '';
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dkey(d), evs = events[k] || [];
    const types = [...new Set(evs.map(e => e.p.type))];
    const cls = [d.getMonth() !== month.getMonth() && 'out', k === today && 'today', k === S.calSel && 'sel', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-day="${k}">${d.getDate()}<span class="dots">${types.map(t => `<i class="${t}"></i>`).join('')}</span></button>`;
  }
  const dayEvents = (events[S.calSel] || []).sort((a, b) => new Date(a.at) - new Date(b.at));
  return `
    <div class="cal">
      <div class="cal-head"><button data-act="calPrev" aria-label="이전 달">${icon('back', 20)}</button><b>${month.getFullYear()}년 ${month.getMonth() + 1}월</b><button data-act="calNext" aria-label="다음 달">${icon('next', 20)}</button></div>
      <div class="cal-grid">${'일월화수목금토'.split('').map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div>
      <div class="legend"><span><i style="background:var(--local)"></i>동네</span><span><i style="background:var(--group)"></i>공구</span><span><i style="background:var(--auction)"></i>경매</span></div>
      <div style="font-size:13px;font-weight:700;margin-top:4px">${fmtDate(S.calSel, false)} 일정</div>
      ${dayEvents.length ? dayEvents.map(e => `<button class="ev" data-go="detail/${e.p.id}"><span class="tag ${e.kind}">${e.text}</span><span class="badge ${e.p.type}">${TYPES[e.p.type].name}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.p.title)}</span><small style="color:var(--sub)">${fmtDate(e.at).split(' ')[1]}</small></button>`).join('')
        : `<div class="empty" style="padding:16px 0">이 날은 담긴 일정이 없어요.<br>상품 상세에서 하트를 누르면 캘린더에 담겨요.</div>`}
    </div>`;
}

function viewMy() {
  const me = Store.currentUser();
  const all = Store.products();
  const tabs = {
    interest: ['관심 상품', Store.interests().map(id => Store.product(id)).filter(Boolean), '관심 상품이 없어요.'],
    joined: ['참여 중', all.filter(p => p.participants.includes(me.id) || p.bids.some(b => b.userId === me.id)), '참여한 공구/경매가 없어요.'],
    mine: ['내가 등록', all.filter(p => p.sellerId === me.id), '등록한 상품이 없어요.'],
  };
  const [, items, emptyMsg] = tabs[S.myTab];
  return `
    ${topbar('마이페이지')}
    <div class="profile"><div class="avatar">${icon('user', 26)}</div><div><b>${esc(me.id)}</b><div>${esc(me.location.label)} · 반경 ${fmtRadius(me.radius)}</div></div>
      <button class="icon-only" data-act="logout" aria-label="로그아웃" style="margin-left:auto">${icon('logout', 20)}</button></div>

    <div class="box">
      <h3>내 동네 설정</h3>
      <div class="radio-row" style="margin-bottom:10px">${RADII.map(r => `<label><input type="radio" name="myRadius" value="${r}" ${me.radius === r ? 'checked' : ''}><span>${fmtRadius(r)}</span></label>`).join('')}</div>
      <button class="btn line icon-btn" data-act="regps" style="padding:10px;font-size:14px">${icon('pin', 16)}현재 위치로 동네 다시 설정</button>
    </div>

    <div class="box" style="padding:14px 0">
      <h3 style="padding:0 16px" class="icon-title">${icon('calendar', 18)}내 관심 일정</h3>
      ${calendarHtml()}
    </div>

    <div class="sub-tabs">${Object.entries(tabs).map(([k, [n, arr]]) => `<button class="${S.myTab === k ? 'on' : ''}" data-mytab="${k}">${n} ${arr.length}</button>`).join('')}</div>
    <div class="section">${list(items, emptyMsg)}</div>`;
}

// ---------- 라우팅 ----------
$tabbar.innerHTML = NAV.map(([k, n]) => `<button data-nav="${k}">${icon(k === 'my' ? 'user' : k, 22)}<span>${n}</span></button>`).join('');

function render() {
  const me = Store.currentUser();
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (!me) {
    $tabbar.hidden = true;
    $app.innerHTML = viewAuth();
    S.route = 'auth';
    return;
  }
  const route = view || 'home';
  const entering = route !== S.route;
  saveScrollers();
  if (LIST_PAGES.includes(route)) $app.innerHTML = listPage(route, entering);
  else {
    const views = { my: viewMy, register: viewRegister, detail: () => viewDetail(arg) };
    $app.innerHTML = (views[route] || (() => listPage('home', entering)))();
  }
  S.route = route;
  $tabbar.hidden = route === 'detail' || route === 'register';
  $tabbar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.nav === route));
  restoreScrollers(!entering);
}

function rerender() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
$tabbar.addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); });

// ---------- 가로 스크롤 카테고리: 위치 유지, 선택 항목 가운데로, 가장자리 페이드, 마우스 드래그 ----------
function saveScrollers() {
  $app.querySelectorAll('[data-scroller]').forEach(el => { S.scroll[el.dataset.scroller] = el.scrollLeft; });
}

function restoreScrollers(smooth) {
  $app.querySelectorAll('[data-scroller]').forEach(el => {
    el.scrollLeft = S.scroll[el.dataset.scroller] || 0;
    const on = el.querySelector('.on');
    if (on) {
      const offset = on.getBoundingClientRect().left - el.getBoundingClientRect().left;
      const target = el.scrollLeft + offset - (el.clientWidth - on.offsetWidth) / 2;
      const max = el.scrollWidth - el.clientWidth;
      const to = Math.max(0, Math.min(max, target));
      if (smooth) glide(el, to); else el.scrollLeft = to;
    }
    updateFade(el);
  });
}

// 부드러운 가로 스크롤 (스냅이 애니메이션을 끊지 않도록 잠시 해제)
function glide(el, to, ms = 380) {
  const from = el.scrollLeft, start = performance.now();
  if (Math.abs(to - from) < 2) return;
  el.style.scrollSnapType = 'none';
  const ease = t => 1 - Math.pow(1 - t, 3);
  let done = false;
  const finish = () => { if (done) return; done = true; el.scrollLeft = to; el.style.scrollSnapType = ''; updateFade(el); };
  const step = now => {
    if (done) return;
    const t = Math.min(1, (now - start) / ms);
    el.scrollLeft = from + (to - from) * ease(t);
    if (t < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
  setTimeout(finish, ms + 120);   // 백그라운드 탭 등 rAF가 멈춘 경우에도 최종 위치 보장
}

function updateFade(el) {
  el.classList.toggle('fade-l', el.scrollLeft > 4);
  el.classList.toggle('fade-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
}

$app.addEventListener('scroll', e => { if (e.target.dataset?.scroller) updateFade(e.target); }, true);

// 데스크톱: 마우스 휠(세로)을 가로 스크롤로
$app.addEventListener('wheel', e => {
  const el = e.target.closest('[data-scroller]');
  if (!el || Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
  e.preventDefault();
  el.scrollBy({ left: e.deltaY, behavior: 'auto' });
}, { passive: false });

// 데스크톱: 마우스로 끌어서 스크롤 (끌었으면 클릭은 무시)
let drag = null;
$app.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-scroller]');
  if (!el || e.pointerType !== 'mouse') return;
  drag = { el, x: e.clientX, left: el.scrollLeft, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 5) { drag.moved = true; drag.el.classList.add('dragging'); }
  if (drag.moved) drag.el.scrollLeft = drag.left - dx;
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  drag.el.classList.remove('dragging');
  if (drag.moved) { const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', swallow, true), 0); }
  drag = null;
});

// ---------- 이벤트 ----------
const parseCat = v => v ? v.split('>') : [];

$app.addEventListener('click', async e => {
  const el = e.target.closest('[data-go],[data-act],[data-auth],[data-catpick],[data-day],[data-mytab]');
  if (!el) return;
  const d = el.dataset;

  if (d.go !== undefined) return go(d.go);
  if (d.auth) { S.authMode = d.auth; return render(); }
  if (d.catpick !== undefined) { S.cats[S.route] = parseCat(d.catpick); return rerender(); }
  if (d.day) { S.calSel = d.day; return rerender(); }
  if (d.mytab) { S.myTab = d.mytab; return rerender(); }

  switch (d.act) {
    case 'back': return history.length > 1 ? history.back() : go('home');
    case 'gps': return setSignupGps();
    case 'defaultLoc':
      S.signupLoc = { lat: DEFAULT_LOC.lat, lng: DEFAULT_LOC.lng };
      document.getElementById('locBox').innerHTML = locText(S.signupLoc);
      document.querySelector('[name=label]').value ||= DEFAULT_LOC.label;
      return;
    case 'clearSearch':
      S.q[S.route] = '';
      rerender();
      return $app.querySelector('[data-search]')?.focus();
    case 'like': {
      const on = Store.toggleInterest(d.id);
      toast(on ? '관심 등록! 마이페이지 캘린더에 담았어요' : '캘린더에서 뺐어요');
      return rerender();
    }
    case 'join':
      try {
        const p = Store.toggleJoin(d.id);
        toast(p.participants.includes(Store.currentUser().id) ? '참여 완료!' : '참여를 취소했어요');
      } catch (err) { toast(err.message); }
      return rerender();
    case 'bid':
      try {
        Store.placeBid(d.id, Number(document.getElementById('bidInput').value));
        toast('입찰 완료!');
      } catch (err) { toast(err.message); }
      return rerender();
    case 'delete':
      if (confirm('이 상품을 삭제할까요?')) { Store.removeProduct(d.id); toast('삭제했어요'); go('home'); }
      return;
    case 'rmPhoto': S.reg.photos.splice(Number(d.i), 1); return rerender();
    case 'resetReg': S.reg = newReg(); return rerender();
    case 'calPrev': S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1); return rerender();
    case 'calNext': S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1); return rerender();
    case 'logout': Store.logout(); S.authMode = 'login'; return go('home');
    case 'regps':
      try {
        const pos = await getPosition();
        const label = prompt('동네 이름을 입력하세요', Store.currentUser().location.label);
        if (label === null) return;
        Store.updateUser({ location: { ...pos, label: label.trim() || '내 동네' } });
        toast('동네 위치를 다시 설정했어요');
        rerender();
      } catch (err) { toast(err.message); }
      return;
  }
});

$app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'regForm') return submitRegister();
  const err = document.getElementById('authErr');
  const v = Object.fromEntries(new FormData(f));
  try {
    if (f.id === 'loginForm') {
      await Store.login(v.id.trim(), v.pw);
    } else {
      if (!/^[A-Za-z0-9]{4,20}$/.test(v.id)) throw new Error('아이디는 영문/숫자 4~20자로 입력해 주세요.');
      if (v.pw.length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
      if (v.pw !== v.pw2) throw new Error('비밀번호가 일치하지 않습니다.');
      if (!S.signupLoc) throw new Error('현재 위치로 동네를 설정해 주세요.');
      await Store.signup({ id: v.id, pw: v.pw, radius: Number(v.radius), location: { ...S.signupLoc, label: v.label.trim() } });
      toast('가입을 환영해요!');
    }
    go('home');
    render();
  } catch (ex) { err.textContent = ex.message; }
});

$app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.search !== undefined) {
    S.q[S.route] = t.value;
    $app.querySelector('.search .clear').hidden = !t.value;
    document.getElementById('results').innerHTML = results(S.route);
    return;
  }
  if (t.dataset.bind && S.reg) {
    S.reg[t.dataset.bind] = t.value;
    if (['totalPrice', 'recruit'].includes(t.dataset.bind)) document.getElementById('calc').innerHTML = calcHtml(S.reg);
  }
});

// 검색창에서 엔터 → 키보드 내리기
$app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.search !== undefined) e.target.blur(); });

$app.addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'type' && S.reg) { S.reg.type = t.value; return rerender(); }
  if (t.dataset.cat !== undefined) {
    const i = Number(t.dataset.cat);
    S.reg.cat[i] = t.value;
    for (let j = i + 1; j < 3; j++) S.reg.cat[j] = '';
    return rerender();
  }
  if (t.dataset.photo !== undefined) {
    const files = [...t.files].slice(0, 10 - S.reg.photos.length);
    for (const f of files) {
      try { S.reg.photos.push(await resizeImage(f)); } catch { toast('사진을 불러오지 못했어요'); }
    }
    return rerender();
  }
  if (t.name === 'myRadius') {
    Store.updateUser({ radius: Number(t.value) });
    toast(`동네 반경을 ${fmtRadius(Number(t.value))}로 바꿨어요`);
    return rerender();
  }
});

render();
