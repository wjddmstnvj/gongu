// 데이터 저장소 (프로토타입: 브라우저 localStorage)
// 나중에 서버 API로 교체할 때 이 파일의 함수 시그니처만 유지하면 된다.
//
// 상품(동네/공구)의 공구 방법
//   weight: 무게로 나누기 – 총 중량을 모집인원으로 균등 분할, 1인 1몫 예약
//   unit:   개별 수량     – 총 수량 중 원하는 개수만큼 예약
// 예약 시 예약금(depositRate %)만 간편결제로 선결제하고 잔금은 거래 때 결제한다.
const Store = (() => {
  const KEY = 'gonggu-db-v1';
  const SEED_VERSION = 2;
  const empty = () => ({ users: [], products: [], interests: {}, session: null, seeded: false });

  let db;
  try { db = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { db = empty(); }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      alert('저장 공간이 부족합니다. 사진 수를 줄이거나 오래된 상품을 삭제해 주세요.');
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'x' + h;
  }

  // ---------- 회원 ----------
  async function signup({ id, pw, location, radius }) {
    if (db.users.some(u => u.id === id)) throw new Error('이미 사용 중인 아이디입니다.');
    const user = { id, pwHash: await hash(id + ':' + pw), location, radius, createdAt: new Date().toISOString() };
    db.users.push(user);
    db.session = id;
    if (!db.seeded) seed(location);
    save();
    return user;
  }

  async function login(id, pw) {
    const user = db.users.find(u => u.id === id);
    if (!user || user.pwHash !== await hash(id + ':' + pw)) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    db.session = id;
    save();
    return user;
  }

  function logout() { db.session = null; save(); }
  function currentUser() { return db.users.find(u => u.id === db.session) || null; }

  function updateUser(patch) {
    const user = currentUser();
    Object.assign(user, patch);
    save();
    return user;
  }

  // ---------- 상품 ----------
  function products() { return db.products; }
  function product(id) { return db.products.find(p => p.id === id); }

  function addProduct(data) {
    const p = { id: uid(), createdAt: new Date().toISOString(), reservations: [], bids: [], ...data };
    db.products.unshift(p);
    notifyKeywordMatches(p);
    if (!save()) { db.products.shift(); return null; }
    return p;
  }

  // ---------- 키워드 알림 ----------
  // 새 상품이 등록되면 키워드를 가진 다른 회원에게 알림을 쌓는다 (동네 상품은 그 회원의 반경 안일 때만).
  // 서버가 생기면 이 매칭을 서버에서 하고 웹 푸시로 보내면 앱이 꺼져 있어도 알림이 간다.
  const MAX_KEYWORDS = 20, MAX_NOTIFICATIONS = 100;
  const matchesKeyword = (p, k) => [p.title, p.desc, ...p.cat].join(' ').toLowerCase().includes(k.toLowerCase());

  function distanceM(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function notifyKeywordMatches(p) {
    db.keywords ||= {}; db.notifications ||= {};
    for (const user of db.users) {
      if (user.id === p.sellerId) continue;
      const hit = (db.keywords[user.id] || []).find(k => matchesKeyword(p, k));
      if (!hit) continue;
      if (p.type === 'local' && (!p.location || distanceM(user.location, p.location) > user.radius)) continue;
      const list = db.notifications[user.id] ||= [];
      list.unshift({ id: uid(), productId: p.id, keyword: hit, title: p.title, type: p.type, at: p.createdAt, read: false, delivered: false });
      list.length = Math.min(list.length, MAX_NOTIFICATIONS);
    }
  }

  const keywords = () => db.keywords?.[db.session] || [];

  function addKeyword(word) {
    const k = word.trim().replace(/\s+/g, ' ');
    if (!k) throw new Error('키워드를 입력해 주세요.');
    if (k.length > 20) throw new Error('키워드는 20자 이내로 입력해 주세요.');
    const list = keywords();
    if (list.some(x => x.toLowerCase() === k.toLowerCase())) throw new Error('이미 등록한 키워드예요.');
    if (list.length >= MAX_KEYWORDS) throw new Error(`키워드는 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
    (db.keywords ||= {})[db.session] = [...list, k];
    save();
    return k;
  }

  function removeKeyword(k) {
    db.keywords[db.session] = keywords().filter(x => x !== k);
    save();
  }

  const notifications = () => db.notifications?.[db.session] || [];
  const unreadCount = () => notifications().filter(n => !n.read).length;

  function markRead(id) {
    for (const n of notifications()) if (!id || n.id === id) n.read = true;
    save();
  }

  // 아직 휴대폰 알림/토스트로 알리지 않은 것을 꺼내고 전달됨으로 표시
  function takeUndelivered() {
    const list = notifications().filter(n => !n.delivered);
    if (!list.length) return [];
    list.forEach(n => { n.delivered = true; });
    save();
    return list;
  }

  function updateProduct(id, patch) {
    const p = product(id);
    if (!p || p.sellerId !== db.session) throw new Error('수정 권한이 없습니다.');
    const before = { ...p };
    Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    if (!save()) { Object.keys(p).forEach(k => delete p[k]); Object.assign(p, before); return null; }
    return p;
  }

  function removeProduct(id) {
    db.products = db.products.filter(p => p.id !== id);
    for (const k in db.interests) db.interests[k] = db.interests[k].filter(x => x !== id);
    save();
  }

  // ---------- 공구 방법 / 가격 ----------
  // 예약 가능한 총량: 무게 → 모집인원(몫), 개별 → 총 수량
  const capacity = p => p.method === 'unit' ? p.totalQty : p.recruit;
  const reserved = p => p.reservations.reduce((s, r) => s + r.qty, 0);
  const remaining = p => capacity(p) - reserved(p);
  // 1몫(무게) 또는 1개(개별) 가격, 원 단위 올림
  const unitPrice = p => Math.ceil(p.totalPrice / capacity(p));
  // 예약금: 10원 단위 올림
  const depositFor = (p, amount) => Math.ceil(amount * p.depositRate / 100 / 10) * 10;
  const myReservation = p => (p.reservations || []).find(r => r.userId === db.session);

  function reserve(id, { qty, payMethod }) {
    const p = product(id);
    if (p.sellerId === db.session) throw new Error('내가 등록한 상품은 예약할 수 없어요.');
    if (myReservation(p)) throw new Error('이미 예약한 상품이에요.');
    if (p.method !== 'unit') qty = 1;
    if (!Number.isInteger(qty) || qty < 1) throw new Error('수량을 확인해 주세요.');
    if (qty > remaining(p)) throw new Error(`남은 수량은 ${remaining(p)}입니다.`);
    const amount = unitPrice(p) * qty;
    const r = { userId: db.session, qty, amount, deposit: depositFor(p, amount), payMethod, at: new Date().toISOString() };
    p.reservations.push(r);
    if (!save()) { p.reservations.pop(); return null; }
    return r;
  }

  function cancelReservation(id) {
    const p = product(id);
    const r = myReservation(p);
    p.reservations = p.reservations.filter(x => x !== r);
    save();
    return r;
  }

  // ---------- 경매 ----------
  function placeBid(id, amount) {
    const p = product(id);
    if (p.sellerId === db.session) throw new Error('내가 등록한 경매에는 입찰할 수 없어요.');
    const min = currentPrice(p) + (p.bids.length ? p.bidUnit : 0);
    if (amount < min) throw new Error(`최소 ${min.toLocaleString()}원 이상 입찰해야 합니다.`);
    p.bids.push({ userId: db.session, amount, at: new Date().toISOString() });
    save();
    return p;
  }

  const currentPrice = p => p.bids.length ? p.bids[p.bids.length - 1].amount : p.totalPrice;

  // ---------- 관심(캘린더) ----------
  function interests() { return db.interests[db.session] || []; }
  function isInterested(id) { return interests().includes(id); }
  function toggleInterest(id) {
    const list = interests();
    db.interests[db.session] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    save();
    return db.interests[db.session].includes(id);
  }

  // ---------- 샘플 데이터 ----------
  // 첫 가입자의 위치를 기준으로 주변에 샘플 상품을 흩뿌린다 (반경 필터 확인용).
  function seed(center) {
    const at = (meters, deg) => {
      const r = deg * Math.PI / 180;
      return {
        lat: center.lat + (meters * Math.cos(r)) / 111320,
        lng: center.lng + (meters * Math.sin(r)) / (111320 * Math.cos(center.lat * Math.PI / 180)),
      };
    };
    const now = new Date();
    const day = n => { const d = new Date(now); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
    const ago = h => new Date(now - h * 3600e3).toISOString();
    // 이번 주 월요일 기준 날짜
    const monday = new Date(now); monday.setHours(10, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = n => { const d = new Date(monday); d.setDate(d.getDate() + n); return d.toISOString(); };

    const base = { sellerId: 'sample', photos: [], reservations: [], bids: [], depositRate: 10 };
    const items = [
      { type: 'local', method: 'unit', totalQty: 24, qtyUnit: '병', title: '코스트코 대용량 생수 2L x 24 나눠요', cat: ['식품', '음료/간식', '생수/음료'], totalPrice: 19800, place: '아파트 정문 경비실 앞', location: at(300, 40), createdAt: ago(1), deadline: day(2), desc: '코스트코에서 같이 사실 분! 필요한 병 수만큼 예약하세요.' },
      { type: 'local', method: 'weight', totalWeight: 10, weightUnit: 'kg', recruit: 4, title: '제주 감귤 10kg 소분하실 분', cat: ['식품', '과일/채소', '과일'], totalPrice: 32000, place: '동네 공원 정자', location: at(700, 120), createdAt: ago(3), deadline: day(3), desc: '농장 직배송 감귤 10kg, 2.5kg씩 나눠요.' },
      { type: 'local', method: 'unit', totalQty: 60, qtyUnit: '롤', title: '두루마리 휴지 30롤 x 2팩', cat: ['생활용품', '화장지/물티슈', '두루마리 화장지'], totalPrice: 36000, place: '지하철역 1번 출구', location: at(1500, 200), createdAt: ago(5), deadline: day(4), desc: '3겹 30롤 두 팩, 롤 단위로 나눠요.' },
      { type: 'local', method: 'weight', totalWeight: 15, weightUnit: 'kg', recruit: 3, title: '강아지 사료 15kg 소분', cat: ['반려동물용품', '강아지', '사료'], totalPrice: 72000, place: '동물병원 앞', location: at(450, 300), createdAt: ago(8), deadline: day(5), desc: '로얄캐닌 미니 어덜트 15kg, 5kg씩.' },
      { type: 'local', method: 'weight', totalWeight: 2, weightUnit: 'kg', recruit: 5, title: '한우 등심 2kg 공동구매', cat: ['식품', '정육/계란', '소고기'], totalPrice: 150000, place: '시장 정육점', location: at(2600, 80), createdAt: ago(12), deadline: day(2), desc: '정육점 사장님 할인가로 같이 사요.' },
      { type: 'group', method: 'unit', totalQty: 60, qtyUnit: '개', title: '[인스타 공구] 비건 선크림 1+1', cat: ['뷰티', '스킨케어', '선케어'], totalPrice: 900000, place: '택배 배송', startAt: week(1), deadline: day(6), snsLink: 'https://instagram.com/', desc: '인플루언서 단독 공구가! 원하는 개수만큼 예약하세요.' },
      { type: 'group', method: 'unit', totalQty: 20, qtyUnit: '대', title: '[라이브] 에어프라이어 5.5L 특가', cat: ['가전디지털', '주방가전', '에어프라이어'], totalPrice: 1790000, place: '택배 배송', startAt: week(3), deadline: day(8), snsLink: 'https://www.youtube.com/', liveAt: week(3), desc: '라이브 방송 중 주문 시 추가 사은품.' },
      { type: 'group', method: 'unit', totalQty: 15, qtyUnit: '개', title: '[인스타 공구] 원목 수납장', cat: ['홈인테리어', '가구', '수납가구'], totalPrice: 1980000, place: '택배 배송', startAt: week(8), deadline: week(12), snsLink: 'https://instagram.com/', desc: '원목 3단 수납장 공구.' },
      { type: 'group', method: 'unit', totalQty: 40, qtyUnit: '세트', title: '[라이브] 유기농 이유식 세트', cat: ['출산/유아동', '분유/이유식', '이유식'], totalPrice: 1200000, place: '택배 배송', startAt: week(10), deadline: week(13), snsLink: 'https://www.youtube.com/', liveAt: week(10), desc: '초기~후기 이유식 2주분.' },
      { type: 'auction', title: '[농가 직송] 햇사과 부사 10kg', cat: ['식품', '과일/채소', '과일'], totalPrice: 30000, recruit: 2, bidUnit: 1000, place: '택배 배송', startAt: week(2), deadline: day(4), desc: '경북 청송 사과농장 직송. 2명이 나눠 받기.' },
      { type: 'auction', title: '[농가 직송] 신동진 햅쌀 20kg', cat: ['식품', '쌀/잡곡', '쌀'], totalPrice: 50000, recruit: 2, bidUnit: 2000, place: '택배 배송', startAt: week(9), deadline: week(11), desc: '전북 김제 올해 수확한 햅쌀.' },
      { type: 'auction', title: '[농가 직송] 유정란 90구', cat: ['식품', '정육/계란', '계란'], totalPrice: 27000, recruit: 3, bidUnit: 1000, place: '택배 배송', startAt: week(7), deadline: week(9), desc: '방사 사육 유정란 30구 x 3판.' },
    ];
    db.products.push(...items.map(it => ({ ...base, id: uid(), createdAt: ago(24), ...it })));
    db.seeded = true;
    db.seedVersion = SEED_VERSION;
  }

  // 예전 버전 데이터 변환: 참여자 목록 → 예약, 샘플 상품 새로 생성
  (function migrate() {
    let changed = false;
    for (const p of db.products) {
      if (!p.reservations) {
        p.reservations = (p.participants || []).map(u => ({ userId: u, qty: 1, amount: Math.ceil(p.totalPrice / p.recruit), deposit: 0, payMethod: null, at: p.createdAt }));
        delete p.participants;
        changed = true;
      }
      if (p.type !== 'auction' && !p.method) { p.method = 'weight'; changed = true; }
      if (p.depositRate == null) { p.depositRate = 10; changed = true; }
    }
    if (db.seeded && (db.seedVersion || 1) < SEED_VERSION && db.users.length) {
      db.products = db.products.filter(p => p.sellerId !== 'sample');
      seed(db.users[0].location);
      changed = true;
    }
    if (changed) save();
  })();

  return {
    signup, login, logout, currentUser, updateUser,
    products, product, addProduct, updateProduct, removeProduct,
    capacity, reserved, remaining, unitPrice, depositFor, myReservation, reserve, cancelReservation,
    placeBid, currentPrice,
    interests, isInterested, toggleInterest,
    keywords, addKeyword, removeKeyword, matchesKeyword, notifications, unreadCount, markRead, takeUndelivered,
  };
})();
