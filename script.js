const INPUT_IDS = ['q30', 'q31', 'q32', 'q33'];
let currentExerciseId = 1;
let currentUserId = null;
let appState = { exercises: {} };
let selectedWordsForGrouping = [];
let isSignUpMode = false;

document.addEventListener('DOMContentLoaded', function () {
  // 1. Firebase Authentication holatini kuzatish
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUserId = user.uid;
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('main-app-container').style.display = 'block';
      loadUserDataFromCloud(currentUserId);
    } else {
      currentUserId = null;
      document.getElementById('auth-container').style.display = 'flex';
      document.getElementById('main-app-container').style.display = 'none';
    }
  });

  // 2. Google orqali kirish
  const googleBtn = document.getElementById('google-login-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', function() {
      const provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider).catch((error) => alert("Xatolik: " + error.message));
    });
  }

  // 3. Email va parol orqali kirish / ro'yxatdan o'tish
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;

      if (isSignUpMode) {
        auth.createUserWithEmailAndPassword(email, password).catch(error => alert("Xatolik: " + error.message));
      } else {
        auth.signInWithEmailAndPassword(email, password).catch(error => alert("Xatolik: " + error.message));
      }
    });
  }

  // 4. Rejimni almashtirish (Kirish / Ro'yxatdan o'tish)
  const authToggleLink = document.getElementById('auth-toggle-link');
  if (authToggleLink) {
    authToggleLink.addEventListener('click', function (e) {
      e.preventDefault();
      isSignUpMode = !isSignUpMode;
      document.getElementById('auth-title').innerText = isSignUpMode ? "Ro'yxatdan o'tish" : "Tizimga kirish";
      document.getElementById('auth-submit-btn').innerText = isSignUpMode ? "Ro'yxatdan o'tish" : "Kirish";
      document.getElementById('auth-toggle-text').innerText = isSignUpMode ? "Hisobingiz bormi?" : "Hisobingiz yo'qmi?";
      authToggleLink.innerText = isSignUpMode ? "Kirish" : "Ro'yxatdan o'tish";
    });
  }

  // 5. Chiqish (Log out)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => auth.signOut());
  }

  // Mashqni yuklash
  loadExercise(currentExerciseId);

  // Javoblarni tekshirish tugmasi
  const checkBtn = document.getElementById('check-btn');
  if (checkBtn) {
    checkBtn.addEventListener('click', checkAnswers);
  }

  // Qaytadan boshlash tugmasi
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetExercise);
  }
});

// Mashqni yuklash va so'zlarni bosiladigan qilish
function loadExercise(id) {
  currentExerciseId = id;
  const ex = exercisesData[id];
  if (!ex) return;

  document.getElementById(`title-${id}`).innerText = ex.title1;
  
  // Matndagi har bir so'zni alohida span elementiga bo'lib chiqish (tarjima qilish uchun)
  const passageContainer = document.getElementById(`passage-${id}`);
  const words = ex.passage1.split(/\s+/);
  passageContainer.innerHTML = words.map(word => `<span class="clickable-word" onclick="toggleWordSelection(this)">${word}</span>`).join(' ');

  document.getElementById(`questions-${id}`).innerHTML = ex.questions1;

  // Tarjima qilish tugmasiga hodisa qo'shish
  setTimeout(() => {
    const translateBtn = document.getElementById('translate-btn');
    if (translateBtn) {
      translateBtn.addEventListener('click', handleTranslation);
    }
  }, 100);
}

// So'zni tanlash/bekor qilish
function toggleWordSelection(element) {
  element.classList.toggle('selected');
  const word = element.innerText;
  
  if (element.classList.contains('selected')) {
    selectedWordsForGrouping.push(word);
  } else {
    selectedWordsForGrouping = selectedWordsForGrouping.filter(w => w !== word);
  }
}

// Tanlangan so'zlarni tarjima qilish
function handleTranslation() {
  if (selectedWordsForGrouping.length === 0) {
    alert("Iltimos, matndan kamida bitta so'zni tanlang!");
    return;
  }
  const phrase = selectedWordsForGrouping.join(' ');
  const translation = prompt(`"${phrase}" birikmasining tarjimasini kiriting:`);
  
  if (translation) {
    const resBox = document.getElementById('translation-result');
    resBox.innerHTML += `<div>📌 <b>${phrase}</b> — ${translation}</div>`;
    selectedWordsForGrouping = [];
    document.querySelectorAll('.clickable-word.selected').forEach(el => el.classList.remove('selected'));
  }
}

// Javoblarni tekshirish
function checkAnswers() {
  const q30 = document.getElementById('q30')?.value.trim().toLowerCase() || "";
  const q31 = document.getElementById('q31')?.value.trim().toLowerCase() || "";
  
  let score = 0;
  if (q30.includes('ferdinand') || q30.includes('richthofen')) score++;
  if (q31.includes('han')) score++;

  const resultBox = document.getElementById('result-box');
  resultBox.style.display = 'block';
  resultBox.innerHTML = `Natijangiz: <b>${score} ta</b> to'g'ri topildi.`;
}

// Qaytadan boshlash
function resetExercise() {
  INPUT_IDS.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  document.getElementById('result-box').style.display = 'none';
  document.getElementById('translation-result').innerHTML = '';
  selectedWordsForGrouping = [];
  document.querySelectorAll('.clickable-word.selected').forEach(el => el.classList.remove('selected'));
}

// Bulutdan yuklash
function loadUserDataFromCloud(userId) {
  db.collection("users").doc(userId).get().then((doc) => {
    if (doc.exists) appState = doc.data();
  });
}