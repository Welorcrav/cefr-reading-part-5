/* ==========================================================
   CEFR Reading Part 5 Practice
   - Har bir mashq holati localStorage'da alohida saqlanadi
   - Reset faqat joriy mashqning javoblarini tozalaydi,
     tarjimalar saqlanib qoladi
   ========================================================== */

const STORAGE_KEY = 'cefr_part5_state_v1';
const INPUT_IDS = ['q30', 'q31', 'q32', 'q33'];
const MC_IDS = ['q34', 'q35'];

let currentExerciseId = 1;
let appState = loadState();

/* ---------- Saqlash / o'qish ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      parsed.exercises = parsed.exercises || {};
      // Eski (vaqt belgisiz) ma'lumotlarni migratsiya qilish: 1 = har qanday real vaqtdan eski
      Object.values(parsed.exercises).forEach(ex => {
        if (ex.tUpdated === undefined) ex.tUpdated = 1;
        if (ex.aUpdated === undefined) ex.aUpdated = 1;
      });
      return parsed;
    }
  } catch (e) {
    console.warn('State o‘qib bo‘lmadi:', e);
  }
  return { lastExercise: 1, ownerUid: null, exercises: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn('State saqlab bo‘lmadi:', e);
  }
}

// Mashq uchun holat obyektini qaytaradi (yo'q bo'lsa yaratadi)
function getExState(id) {
  if (!appState.exercises[id]) {
    appState.exercises[id] = { translations: {}, answers: {}, checked: false, tUpdated: 0, aUpdated: 0 };
  }
  return appState.exercises[id];
}

// O'zgarishni belgilash: vaqt belgisi + lokal saqlash + bulutga yuborish navbati
// block: 't' = tarjimalar, 'a' = javoblar (answers + checked)
function touch(id, block) {
  const st = getExState(id);
  st[block === 't' ? 'tUpdated' : 'aUpdated'] = Date.now();
  saveState();
  if (window.Cloud) window.Cloud.markDirty(id, block);
}

/* ---------- Ishga tushirish ---------- */

document.addEventListener('DOMContentLoaded', function () {
  requestPersistentStorage();
  warnIfStorageUnavailable();

  const startId = Number(appState.lastExercise) || 1;
  loadExercise(exercisesData[startId] ? startId : 1);

  // So'z ustiga bosish (event delegation)
  document.addEventListener('click', function (e) {
    const word = e.target.closest && e.target.closest('.word');
    if (word) annotateWord(word);
  });

  // Javoblarni real vaqtda saqlash
  document.addEventListener('input', function (e) {
    if (e.target.matches('#questions-1 input[type="text"]')) {
      getExState(currentExerciseId).answers[e.target.id] = e.target.value;
      touch(currentExerciseId, 'a');
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('#questions-1 input[type="radio"]')) {
      getExState(currentExerciseId).answers[e.target.name] = e.target.value;
      touch(currentExerciseId, 'a');
    }
  });

  document.getElementById('check-btn').addEventListener('click', checkAnswers);
  document.getElementById('reset-btn').addEventListener('click', resetCurrentSection);
});

/* ---------- Mashqni yuklash ---------- */

function loadExercise(id) {
  const data = exercisesData[id];
  if (!data) return;

  currentExerciseId = id;
  appState.lastExercise = id;
  saveState();

  // Sidebar faolligi
  document.querySelectorAll('.exercise-list li').forEach((item, index) => {
    item.classList.toggle('active', index + 1 === id);
  });

  // Natija oynasini yashirish
  const resBox = document.getElementById('result-box');
  if (resBox) resBox.style.display = 'none';

  document.getElementById('title-1').innerHTML = data.title1;
  document.getElementById('passage-1').innerHTML = data.passage1;
  document.getElementById('questions-1').innerHTML = data.questions1;

  initPassages();
  restoreTranslations(id);
  restoreAnswers(id);
  updateSidebarMarks();

  // Agar bu mashq avval tekshirilgan bo'lsa, natijani qayta ko'rsatish
  if (getExState(id).checked) gradeAnswers();
}

/* ---------- Matnni so'zlarga bo'lish ---------- */

function initPassages() {
  const passage = document.getElementById('passage-1');
  if (!passage) return;

  const tokens = passage.innerHTML.split(/(\s+)/);
  let idx = 0;

  passage.innerHTML = tokens.map(token => {
    if (token === '' || /^\s+$/.test(token) || /<[^>]*>/.test(token)) {
      return token;
    }
    // data-idx — so'zning matndagi tartib raqami (tarjimani saqlash uchun kalit)
    return `<span class="word" data-idx="${idx++}">${token}</span>`;
  }).join('');
}

/* ---------- Tarjimalar ---------- */

function applyTranslation(element, text) {
  const oldTag = element.querySelector('.translation-tag');
  if (oldTag) oldTag.remove();

  if (text && text.trim() !== '') {
    const tag = document.createElement('span');
    tag.className = 'translation-tag';
    tag.innerText = text.trim();
    element.insertBefore(tag, element.firstChild);
    element.classList.add('has-translation', 'underlined');
  } else {
    element.classList.remove('has-translation', 'underlined');
  }
}

function restoreTranslations(id) {
  const translations = getExState(id).translations;
  Object.keys(translations).forEach(idx => {
    const el = document.querySelector(`#passage-1 .word[data-idx="${idx}"]`);
    if (el) applyTranslation(el, translations[idx]);
  });
}

function annotateWord(element) {
  const currentTranslation = element.querySelector('.translation-tag')?.innerText || '';
  const wordText = element.childNodes[element.childNodes.length - 1].textContent.trim();

  const userTranslation = prompt(
    `"${wordText}" so'zi uchun tarjima yozing (O'chirish uchun bo'sh qoldiring):`,
    currentTranslation
  );
  if (userTranslation === null) return;

  applyTranslation(element, userTranslation);

  // Saqlash
  const translations = getExState(currentExerciseId).translations;
  const idx = element.dataset.idx;
  if (userTranslation.trim() !== '') {
    translations[idx] = userTranslation.trim();
  } else {
    delete translations[idx];
  }
  touch(currentExerciseId, 't');
}

/* ---------- Javoblarni tiklash ---------- */

function restoreAnswers(id) {
  const answers = getExState(id).answers;

  INPUT_IDS.forEach(qId => {
    const input = document.getElementById(qId);
    if (input && answers[qId] !== undefined) input.value = answers[qId];
  });

  MC_IDS.forEach(qId => {
    if (answers[qId] === undefined) return;
    const radio = document.querySelector(`input[name="${qId}"][value="${answers[qId]}"]`);
    if (radio) radio.checked = true;
  });
}

/* ---------- Tekshirish ---------- */

// Tugma bosilganda: holatni "tekshirilgan" deb saqlaydi va natijani chizadi
function checkAnswers() {
  const st = getExState(currentExerciseId);
  st.checked = true;

  // Hozirgi javoblarni ham saqlab qo'yamiz
  INPUT_IDS.forEach(qId => {
    const input = document.getElementById(qId);
    if (input) st.answers[qId] = input.value;
  });
  MC_IDS.forEach(qId => {
    const sel = document.querySelector(`input[name="${qId}"]:checked`);
    if (sel) st.answers[qId] = sel.value;
  });

  touch(currentExerciseId, 'a');
  gradeAnswers();
  updateSidebarMarks();
}

// Faqat DOM'da baholash va natijani ko'rsatish (saqlamaydi)
function gradeAnswers() {
  let score = 0;
  const total = INPUT_IDS.length + MC_IDS.length;

  INPUT_IDS.forEach(qId => {
    const input = document.getElementById(qId);
    if (!input) return;

    const userAns = input.value.trim().toLowerCase();
    const correctAns = input.getAttribute('data-ans').toLowerCase();

    input.classList.remove('correct-input', 'incorrect-input');
    const parent = input.parentElement;
    const oldHint = parent.querySelector('.correct-ans-text');
    if (oldHint) oldHint.remove();

    if (userAns === correctAns) {
      score++;
      input.classList.add('correct-input');
    } else {
      input.classList.add('incorrect-input');
      const hint = document.createElement('span');
      hint.className = 'correct-ans-text';
      hint.innerText = `(To'g'ri javob: ${correctAns})`;
      parent.appendChild(hint);
    }
  });

  MC_IDS.forEach(qId => {
    const group = document.querySelector(`[data-q="${qId}"]`);
    if (!group) return;

    const correctAns = group.getAttribute('data-ans');
    const selected = document.querySelector(`input[name="${qId}"]:checked`);

    const oldHint = group.parentElement.querySelector('.correct-ans-text');
    if (oldHint) oldHint.remove();

    if (selected && selected.value === correctAns) {
      score++;
    } else {
      const hint = document.createElement('span');
      hint.className = 'correct-ans-text';
      hint.innerText = `(To'g'ri javob: ${correctAns})`;
      group.parentElement.appendChild(hint);
    }
  });

  const resBox = document.getElementById('result-box');
  resBox.style.display = 'block';
  resBox.style.backgroundColor = score === total ? '#dcfce7' : '#fee2e2';
  resBox.style.color = score === total ? '#15803d' : '#b91c1c';
  resBox.innerText = `Umumiy natijangiz: ${total} ta savoldan ${score} ta to'g'ri topdingiz!`;
}

/* ---------- Reset (faqat joriy bo'lim) ---------- */

function resetCurrentSection() {
  const id = currentExerciseId;
  if (!confirm("Bu mashqdagi javoblaringiz o'chiriladi (tarjimalar saqlanib qoladi). Davom etasizmi?")) {
    return;
  }

  // Faqat shu mashqning javoblari va "tekshirilgan" holati tozalanadi.
  // translations va boshqa mashqlar tegilmaydi.
  const st = getExState(id);
  st.answers = {};
  st.checked = false;
  touch(id, 'a');

  // Savollar qismini qayta chizish — kiritilgan javoblar va belgilar yo'qoladi
  document.getElementById('questions-1').innerHTML = exercisesData[id].questions1;
  document.getElementById('result-box').style.display = 'none';
  updateSidebarMarks();
}

/* ---------- Sidebar'dagi "bajarilgan" belgisi ---------- */

function updateSidebarMarks() {
  document.querySelectorAll('.exercise-list li').forEach((item, index) => {
    const st = appState.exercises[index + 1];
    item.classList.toggle('done', !!(st && st.checked));
  });
}

/* ---------- Saqlash barqarorligi ---------- */

// Brauzerdan ma'lumotni xotira kam bo'lganda ham o'chirmaslikni so'raydi
function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// localStorage ishlamasa (masalan, inkognito rejim yoki bloklangan), foydalanuvchini ogohlantiradi
function warnIfStorageUnavailable() {
  let ok = true;
  try {
    const k = '__cefr_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (e) {
    ok = false;
  }
  if (ok) return;

  const box = document.createElement('div');
  box.className = 'instructions';
  box.style.background = '#fee2e2';
  box.style.borderLeftColor = '#dc2626';
  box.innerHTML = "⚠️ <strong>Diqqat:</strong> brauzeringiz ma'lumot saqlashga ruxsat bermayapti " +
    "(inkognito rejim yoki bloklangan sozlama bo'lishi mumkin). Progress brauzer yopilganda yo'qoladi.";
  const container = document.querySelector('.container');
  container.insertBefore(box, container.querySelector('.instructions').nextSibling);
}

/* ---------- sync.js uchun ko'prik ---------- */

window.AppBridge = {
  getState: () => appState,
  setState: (s) => { appState = s; saveState(); },
  save: saveState,
  // Joriy mashqni qayta chizish (foydalanuvchi yozayotgan bo'lsa, tegmaydi)
  refresh: () => {
    const a = document.activeElement;
    const typing = a && a.matches && a.matches('#questions-1 input[type="text"]');
    if (typing) { updateSidebarMarks(); return; }
    loadExercise(currentExerciseId);
  }
};