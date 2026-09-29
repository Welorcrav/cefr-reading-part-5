/* ==========================================================
   Firebase sinxronizatsiyasi (Auth + Firestore)
   - localStorage asosiy (offline-first) manba bo'lib qoladi
   - Kirgan foydalanuvchi uchun ma'lumot users/{uid} hujjatida saqlanadi
   - Har bir mashqning ikki bloki alohida vaqt belgisiga ega:
       t = tarjimalar, a = javoblar (+ tekshirilgan holati)
     Birlashtirishda har bir blok bo'yicha yangisi yutadi.
   ========================================================== */
(function () {
  const bar = document.getElementById('sync-bar');
  const cfg = window.FIREBASE_CONFIG;

  const configured = cfg && cfg.apiKey && !String(cfg.apiKey).startsWith('YOUR_');
  if (!configured || typeof firebase === 'undefined') {
    if (bar) bar.style.display = 'none';
    console.info('Firebase sozlanmagan — ilova faqat lokal (localStorage) rejimida ishlaydi.');
    return; // window.Cloud aniqlanmaydi, script.js buni e'tiborsiz qoldiradi
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let user = null;
  let docRef = null;
  let unsubscribe = null;
  let dirty = new Set();   // "id:t" yoki "id:a"
  let timer = null;
  let status = 'idle';

  /* ---------- UI ---------- */

  function setStatus(s) { status = s; renderBar(); }

  function renderBar() {
    if (!bar) return;
    if (!user) {
      bar.innerHTML =
        '<span>☁️ Progressni barcha qurilmalarda saqlash uchun kiring</span>' +
        '<button id="sync-login" type="button">Google orqali kirish</button>';
      document.getElementById('sync-login').onclick = signIn;
      return;
    }
    const labels = {
      idle: '', syncing: 'Sinxronlanmoqda…', saving: 'Saqlanmoqda…',
      synced: 'Sinxronlandi ✓', error: '⚠️ Ulanish xatosi — qayta uriniladi'
    };
    bar.innerHTML =
      '<span>👤 ' + (user.displayName || user.email || 'Foydalanuvchi') +
      ' <span class="sync-status sync-' + status + '">' + (labels[status] || '') + '</span></span>' +
      '<button id="sync-logout" type="button">Chiqish</button>';
    document.getElementById('sync-logout').onclick = () => auth.signOut();
  }

  function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        auth.signInWithRedirect(provider);
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error(err);
        alert('Kirishda xatolik: ' + err.message);
      }
    });
  }

  /* ---------- Birlashtirish ---------- */

  // Masofaviy ma'lumotni lokalga qo'shadi. Har bir blok bo'yicha vaqt belgisi katta bo'lgani yutadi.
  function mergeRemote(remoteEx) {
    const st = AppBridge.getState();
    const toPush = new Set();
    let changed = false;

    const ids = new Set(Object.keys(st.exercises).concat(Object.keys(remoteEx || {})));
    ids.forEach(id => {
      const l = st.exercises[id];
      const r = (remoteEx || {})[id];

      ['t', 'a'].forEach(b => {
        const key = b === 't' ? 'tUpdated' : 'aUpdated';
        const lts = (l && l[key]) || 0;
        const rts = (r && r[key]) || 0;

        if (rts > lts) {
          if (!st.exercises[id]) {
            st.exercises[id] = { translations: {}, answers: {}, checked: false, tUpdated: 0, aUpdated: 0 };
          }
          const target = st.exercises[id];
          if (b === 't') {
            target.translations = r.translations || {};
          } else {
            target.answers = r.answers || {};
            target.checked = !!r.checked;
          }
          target[key] = rts;
          changed = true;
        } else if (lts > rts) {
          toPush.add(id + ':' + b);
        }
      });
    });
    return { changed, toPush };
  }

  /* ---------- Yuborish ---------- */

  async function push() {
    if (!user || !docRef || dirty.size === 0) return;

    const batch = Array.from(dirty);
    dirty = new Set();

    const st = AppBridge.getState();
    const data = { exercises: {} };
    const fields = [];

    batch.forEach(k => {
      const [id, b] = k.split(':');
      const ex = st.exercises[id];
      if (!ex) return;
      data.exercises[id] = data.exercises[id] || {};
      if (b === 't') {
        data.exercises[id].translations = ex.translations;
        data.exercises[id].tUpdated = ex.tUpdated;
        fields.push('exercises.' + id + '.translations', 'exercises.' + id + '.tUpdated');
      } else {
        data.exercises[id].answers = ex.answers;
        data.exercises[id].checked = !!ex.checked;
        data.exercises[id].aUpdated = ex.aUpdated;
        fields.push('exercises.' + id + '.answers', 'exercises.' + id + '.checked', 'exercises.' + id + '.aUpdated');
      }
    });
    if (fields.length === 0) return;

    try {
      // mergeFields: faqat ko'rsatilgan maydonlar to'liq almashtiriladi (o'chirilgan tarjimalar ham to'g'ri o'chadi)
      await docRef.set(data, { mergeFields: fields });
      setStatus('synced');
    } catch (e) {
      console.error('Firestore yozishda xato:', e);
      batch.forEach(k => dirty.add(k));
      setStatus('error');
      clearTimeout(timer);
      timer = setTimeout(push, 5000);
    }
  }

  /* ---------- Masofaviy o'zgarishlar ---------- */

  function onRemote(snap) {
    // Faqat serverdan kelgan, o'zimizning kutilayotgan yozuvlarimiz bo'lmagan snapshot'larni qayta ishlaymiz
    if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;

    const remote = snap.exists ? (snap.data().exercises || {}) : {};
    const { changed, toPush } = mergeRemote(remote);

    if (changed) {
      AppBridge.save();
      AppBridge.refresh();
    }
    toPush.forEach(k => dirty.add(k));
    if (dirty.size) push(); else setStatus('synced');
  }

  /* ---------- Auth holati ---------- */

  auth.onAuthStateChanged(u => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    user = u;
    dirty = new Set();
    clearTimeout(timer);

    if (!u) { docRef = null; setStatus('idle'); return; }

    // Boshqa akkaunt shu qurilmada kirsa, oldingi foydalanuvchi ma'lumoti aralashib ketmasligi uchun tozalaymiz
    const st = AppBridge.getState();
    if (st.ownerUid && st.ownerUid !== u.uid) {
      AppBridge.setState({ lastExercise: st.lastExercise, ownerUid: u.uid, exercises: {} });
      AppBridge.refresh();
    } else if (st.ownerUid !== u.uid) {
      st.ownerUid = u.uid;   // lokal (anonim) progress shu akkauntga o'tadi
      AppBridge.save();
    }

    docRef = db.collection('users').doc(u.uid);
    setStatus('syncing');
    unsubscribe = docRef.onSnapshot(onRemote, err => {
      console.error('Firestore o‘qishda xato:', err);
      setStatus('error');
    });
  });

  /* ---------- Ommaviy API (script.js ishlatadi) ---------- */

  window.Cloud = {
    markDirty(id, block) {
      if (!user) return;
      dirty.add(id + ':' + block);
      setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(push, 800);
    }
  };

  document.addEventListener('DOMContentLoaded', renderBar);
  renderBar();
})();
