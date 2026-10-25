// 데이터 저장소 (프로토타입: 브라우저 localStorage)
// 나중에 서버 API로 교체할 때 이 파일의 함수 시그니처만 유지하면 된다.
const Store = (() => {
  const KEY = 'gonggu-db-v1';
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
    const p = { id: uid(), createdAt: new Date().toISOString(), participants: [], bids: [], ...data };
    db.products.unshift(p);
    if (!save()) { db.products.shift(); return null; }
    return p;
  }

  function removeProduct(id) {
    db.products = db.products.filter(p => p.id !== id);
    for (const k in db.interests) db.interests[k] = db.interests[k].filter(x => x !== id);
    save();
  }

  function toggleJoin(id) {
    const p = product(id), me = db.session;
    if (p.participants.includes(me)) p.participants = p.participants.filter(x => x !== me);
    else {
      if (p.participants.length >= p.recruit) throw new Error('모집 인원이 마감되었습니다.');
      p.participants.push(me);
    }
    save();
    return p;
  }

  function placeBid(id, amount) {
    const p = product(id);
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

    const base = { sellerId: 'sample', photos: [], participants: [], bids: [] };
    const items = [
      { type: 'local', title: '코스트코 대용량 생수 2L x 24 나눠요', cat: ['식품', '음료/간식', '생수/음료'], totalPrice: 19800, recruit: 4, location: at(300, 40), createdAt: ago(1), deadline: day(2), desc: '코스트코에서 같이 사실 분! 아파트 정문에서 나눠요.' },
      { type: 'local', title: '제주 감귤 10kg 소분하실 분', cat: ['식품', '과일/채소', '과일'], totalPrice: 32000, recruit: 4, location: at(700, 120), createdAt: ago(3), deadline: day(3), desc: '농장 직배송 감귤 10kg, 2.5kg씩 나눠요.' },
      { type: 'local', title: '두루마리 휴지 30롤 x 2팩', cat: ['생활용품', '화장지/물티슈', '두루마리 화장지'], totalPrice: 36000, recruit: 3, location: at(1500, 200), createdAt: ago(5), deadline: day(4), desc: '3겹 30롤 두 팩 사서 나눠요.' },
      { type: 'local', title: '강아지 사료 15kg 소분', cat: ['반려동물용품', '강아지', '사료'], totalPrice: 72000, recruit: 3, location: at(450, 300), createdAt: ago(8), deadline: day(5), desc: '로얄캐닌 미니 어덜트 15kg, 5kg씩.' },
      { type: 'local', title: '한우 등심 2kg 공동구매', cat: ['식품', '정육/계란', '소고기'], totalPrice: 150000, recruit: 5, location: at(2600, 80), createdAt: ago(12), deadline: day(2), desc: '정육점 사장님 할인가로 같이 사요.' },
      { type: 'group', title: '[인스타 공구] 비건 선크림 1+1', cat: ['뷰티', '스킨케어', '선케어'], totalPrice: 900000, recruit: 30, startAt: week(1), deadline: day(6), snsLink: 'https://instagram.com/', desc: '인플루언서 단독 공구가! 30명 모이면 진행.' },
      { type: 'group', title: '[라이브] 에어프라이어 5.5L 특가', cat: ['가전디지털', '주방가전', '에어프라이어'], totalPrice: 1790000, recruit: 20, startAt: week(3), deadline: day(8), snsLink: 'https://www.youtube.com/', liveAt: week(3), desc: '라이브 방송 중 주문 시 추가 사은품.' },
      { type: 'group', title: '[인스타 공구] 원목 수납장', cat: ['홈인테리어', '가구', '수납가구'], totalPrice: 1980000, recruit: 15, startAt: week(8), deadline: week(12), snsLink: 'https://instagram.com/', desc: '원목 3단 수납장 공구.' },
      { type: 'group', title: '[라이브] 유기농 이유식 세트', cat: ['출산/유아동', '분유/이유식', '이유식'], totalPrice: 1200000, recruit: 40, startAt: week(10), deadline: week(13), snsLink: 'https://www.youtube.com/', liveAt: week(10), desc: '초기~후기 이유식 2주분.' },
      { type: 'auction', title: '[농가 직송] 햇사과 부사 10kg', cat: ['식품', '과일/채소', '과일'], totalPrice: 30000, recruit: 2, bidUnit: 1000, startAt: week(2), deadline: day(4), desc: '경북 청송 사과농장 직송. 2명이 나눠 받기.' },
      { type: 'auction', title: '[농가 직송] 신동진 햅쌀 20kg', cat: ['식품', '쌀/잡곡', '쌀'], totalPrice: 50000, recruit: 2, bidUnit: 2000, startAt: week(9), deadline: week(11), desc: '전북 김제 올해 수확한 햅쌀.' },
      { type: 'auction', title: '[농가 직송] 유정란 90구', cat: ['식품', '정육/계란', '계란'], totalPrice: 27000, recruit: 3, bidUnit: 1000, startAt: week(7), deadline: week(9), desc: '방사 사육 유정란 30구 x 3판.' },
    ];
    db.products = items.map(it => ({ ...base, id: uid(), createdAt: ago(24), ...it }));
    db.seeded = true;
  }

  return {
    signup, login, logout, currentUser, updateUser,
    products, product, addProduct, removeProduct, toggleJoin, placeBid, currentPrice,
    interests, isInterested, toggleInterest,
  };
})();
