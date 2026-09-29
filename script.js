const INPUT_IDS = ['q30', 'q31', 'q32', 'q33'];
const MC_IDS = ['q34', 'q35'];

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

  // 2. Google orqali kirish tugmasi hodisasi
  const googleBtn = document.getElementById('google-login-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', function() {
      const provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider)
        .then((result) => {
          console.log("Google orqali muvaffaqiyatli kirildi:", result.user.email);
        })
        .catch((error) => {
          console.error("Xatolik:", error.message);
          alert("Google orqali kirishda xatolik: " + error.message);
        });
    });
  }

  // 3. Email va parol orqali kirish / ro'yxatdan o'tish formasi
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;

      if (isSignUpMode) {
        // Ro'yxatdan o'tish
        auth.createUserWithEmailAndPassword(email, password)
          .catch(error => alert("Xatolik: " + error.message));
      } else {
        // Tizimga kirish
        auth.signInWithEmailAndPassword(email, password)
          .catch(error => alert("Xatolik: " + error.message));
      }
    });
  }

  // 4. Kirish va Ro'yxatdan o'tish rejimini almashtirish
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

  // 5. Chiqish (Log out) tugmasi
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      auth.signOut();
    });
  }

  // Dastlabki mashqni yuklash
  loadExercise(currentExerciseId);
});

// Mashq ma'lumotlarini yuklash funksiyasi
function loadExercise(id) {
  currentExerciseId = id;
  const ex = exercisesData[id];
  if (!ex) return;

  document.getElementById(`title-${id}`).innerText = ex.title1;
  document.getElementById(`passage-${id}`).innerHTML = ex.passage1;
  document.getElementById(`questions-${id}`).innerHTML = ex.questions1;
}

// Bulutdan (Firestore) foydalanuvchi ma'lumotlarini yuklash
function loadUserDataFromCloud(userId) {
  const docRef = db.collection("users").doc(userId);
  docRef.get().then((doc) => {
    if (doc.exists) {
      appState = doc.data();
    }
  }).catch((error) => {
    console.error("Ma'lumotlarni yuklashda xatolik:", error);
  });
}