(function () {
    const bar = document.getElementById('sync-bar');
    const config = window.FIREBASE_CONFIG;
    const storageKey = 'readingWordTranslations';
    const ownerKey = 'readingWordTranslationsOwner';
    const marksKey = 'readingMarkedWords';
    const answersKey = 'readingAnswers';

    if (!config || typeof firebase === 'undefined') {
        bar.textContent = 'Google sinxronlashi yuklanmadi. Internet aloqasini tekshiring.';
        return;
    }

    if (!firebase.apps.length) firebase.initializeApp(config);
    const auth = firebase.auth();
    const database = firebase.firestore();
    let user = null;
    let documentRef = null;
    let unsubscribe = null;
    let saveTimer = null;
    let pendingTranslations = false;
    let status = 'idle';

    function readTranslations() {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (error) {
            return {};
        }
    }

    function readMarks() {
        try {
            return JSON.parse(localStorage.getItem(marksKey) || '{}');
        } catch (error) {
            return {};
        }
    }

    function readAnswers() {
        try {
            return JSON.parse(localStorage.getItem(answersKey) || '{}');
        } catch (error) {
            return {};
        }
    }

    function writeAnswers(answers) {
        localStorage.setItem(answersKey, JSON.stringify(answers));
    }

    function writeMarks(marks) {
        localStorage.setItem(marksKey, JSON.stringify(marks));
    }

    function writeTranslations(translations) {
        localStorage.setItem(storageKey, JSON.stringify(translations));
    }

    function renderBar() {
        if (!user) {
            bar.innerHTML = '<span>Tarjimalarni qurilmalar orasida saqlash</span><button id="google-login" type="button">Google bilan kirish</button>';
            document.getElementById('google-login').addEventListener('click', signIn);
            return;
        }

        const messages = {
            syncing: 'Sinxronlanmoqda',
            saving: 'Saqlanmoqda',
            synced: 'Sinxronlandi',
            error: 'Sinxronlashda xato'
        };
        bar.innerHTML = `<span>${user.displayName || user.email || 'Google akkaunt'}<span class="sync-status">${messages[status] || ''}</span></span><button id="google-logout" type="button">Chiqish</button>`;
        document.getElementById('google-logout').addEventListener('click', signOut);
    }

    async function signOut() {
        // Chiqishdan oldin hali saqlanmagan o'zgarishlarni bulutga yozib qo'yamiz
        if (pendingTranslations && documentRef) {
            clearTimeout(saveTimer);
            try {
                await saveToCloud(readTranslations());
                pendingTranslations = false;
            } catch (error) {
                console.error('Chiqishdan oldin saqlashda xato:', error);
                if (!confirm('Oxirgi o‘zgarishlar bulutga saqlanmadi. Baribir chiqasizmi?')) return;
            }
        }
        auth.signOut();
    }

    function clearLocalWork() {
        const hadData = localStorage.getItem(storageKey) !== null || localStorage.getItem(marksKey) !== null ||
            localStorage.getItem(answersKey) !== null;
        localStorage.removeItem(storageKey);
        localStorage.removeItem(marksKey);
        localStorage.removeItem(answersKey);
        localStorage.removeItem(ownerKey);
        if (hadData) window.dispatchEvent(new Event('translations-updated'));
    }

    function signIn() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            if (error.code === 'auth/popup-blocked') {
                auth.signInWithRedirect(provider);
            } else if (error.code === 'auth/unauthorized-domain') {
                alert('Bu sayt manzili Firebase Console dagi Authorized domains ro‘yxatiga qo‘shilishi kerak.');
            } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                console.error(error);
                alert('Google orqali kirishda xatolik: ' + error.message);
            }
        });
    }

    function saveToCloud() {
        if (!documentRef) return Promise.resolve();
        return documentRef.set(
            { translations: readTranslations(), marks: readMarks(), answers: readAnswers() },
            { mergeFields: ['translations', 'marks', 'answers'] }
        );
    }

    async function connectUser(nextUser) {
        if (unsubscribe) unsubscribe();
        user = nextUser;
        documentRef = null;
        clearTimeout(saveTimer);

        if (!user) {
            pendingTranslations = false;
            status = 'idle';
            clearLocalWork();
            renderBar();
            return;
        }

        status = 'syncing';
        renderBar();
        const savedOwner = localStorage.getItem(ownerKey);
        const sameOwner = !savedOwner || savedOwner === user.uid;
        const local = sameOwner ? readTranslations() : {};
        const localMarks = sameOwner ? readMarks() : {};
        const localAnswers = sameOwner ? readAnswers() : {};
        localStorage.setItem(ownerKey, user.uid);
        const currentUser = user;
        documentRef = database.collection('users').doc(user.uid);

        try {
            const snapshot = await documentRef.get();
            if (!user || user.uid !== currentUser.uid) return;
            const remoteData = snapshot.exists ? snapshot.data() : {};
            const remote = remoteData.translations || {};
            const remoteMarks = remoteData.marks;
            const merged = { ...local, ...remote };
            // Belgilar: bulutdagisi asos, bulutda hali yo'q bo'lsa — shu qurilmadagisi
            const mergedMarks = remoteMarks !== undefined ? remoteMarks : localMarks;
            const remoteAnswers = remoteData.answers || {};
            const mergedAnswers = { ...localAnswers, ...remoteAnswers };
            writeTranslations(merged);
            writeMarks(mergedMarks);
            writeAnswers(mergedAnswers);
            window.dispatchEvent(new Event('translations-updated'));

            if (JSON.stringify(merged) !== JSON.stringify(remote) ||
                JSON.stringify(mergedMarks) !== JSON.stringify(remoteMarks || {}) ||
                JSON.stringify(mergedAnswers) !== JSON.stringify(remoteAnswers)) {
                await saveToCloud();
            }

            unsubscribe = documentRef.onSnapshot(snapshotUpdate => {
                if (snapshotUpdate.metadata.fromCache || snapshotUpdate.metadata.hasPendingWrites) return;
                if (pendingTranslations) return;
                const data = snapshotUpdate.exists ? snapshotUpdate.data() : {};
                const latest = data.translations || {};
                const latestMarks = data.marks || {};
                const latestAnswers = data.answers || {};
                if (JSON.stringify(latest) !== JSON.stringify(readTranslations()) ||
                    JSON.stringify(latestMarks) !== JSON.stringify(readMarks()) ||
                    JSON.stringify(latestAnswers) !== JSON.stringify(readAnswers())) {
                    writeTranslations(latest);
                    writeMarks(latestMarks);
                    writeAnswers(latestAnswers);
                    window.dispatchEvent(new Event('translations-updated'));
                }
                status = 'synced';
                renderBar();
            }, error => {
                console.error('Firestore o‘qishda xato:', error);
                status = 'error';
                renderBar();
            });
        } catch (error) {
            console.error('Firestore sinxronlashda xato:', error);
            status = 'error';
            renderBar();
        }
    }

    function scheduleSave() {
        if (!user || !documentRef) return;
        pendingTranslations = true;
        status = 'saving';
        renderBar();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try {
                await saveToCloud();
                pendingTranslations = false;
                status = 'synced';
            } catch (error) {
                console.error('Firestore yozishda xato:', error);
                status = 'error';
                saveTimer = setTimeout(scheduleSave, 5000);
            }
            renderBar();
        }, 700);
    }

    window.Cloud = {
        saveTranslations: scheduleSave,
        saveMarks: scheduleSave,
        saveAnswers: scheduleSave
    };

    auth.onAuthStateChanged(connectUser);
    auth.getRedirectResult().catch(error => {
        console.error('Google kirish yo‘naltirishida xato:', error);
    });
    renderBar();
})();