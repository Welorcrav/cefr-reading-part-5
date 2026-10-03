(function () {
    const bar = document.getElementById('sync-bar');
    const config = window.FIREBASE_CONFIG;
    const storageKey = 'readingWordTranslations';
    const ownerKey = 'readingWordTranslationsOwner';

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
        const hadData = localStorage.getItem(storageKey) !== null;
        localStorage.removeItem(storageKey);
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

    function saveToCloud(translations) {
        if (!documentRef) return Promise.resolve();
        return documentRef.set({ translations }, { mergeFields: ['translations'] });
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
        const local = savedOwner && savedOwner !== user.uid ? {} : readTranslations();
        localStorage.setItem(ownerKey, user.uid);
        const currentUser = user;
        documentRef = database.collection('users').doc(user.uid);

        try {
            const snapshot = await documentRef.get();
            if (!user || user.uid !== currentUser.uid) return;
            const remote = snapshot.exists ? snapshot.data().translations || {} : {};
            const merged = { ...local, ...remote };
            writeTranslations(merged);
            window.dispatchEvent(new Event('translations-updated'));

            if (JSON.stringify(merged) !== JSON.stringify(remote)) {
                await saveToCloud(merged);
            }

            unsubscribe = documentRef.onSnapshot(snapshotUpdate => {
                if (snapshotUpdate.metadata.fromCache || snapshotUpdate.metadata.hasPendingWrites) return;
                if (pendingTranslations) return;
                const latest = snapshotUpdate.exists ? snapshotUpdate.data().translations || {} : {};
                if (JSON.stringify(latest) !== JSON.stringify(readTranslations())) {
                    writeTranslations(latest);
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

    window.Cloud = {
        saveTranslations(translations) {
            if (!user || !documentRef) return;
            pendingTranslations = true;
            status = 'saving';
            renderBar();
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
                try {
                    await saveToCloud(translations);
                    pendingTranslations = false;
                    status = 'synced';
                } catch (error) {
                    console.error('Firestore yozishda xato:', error);
                    status = 'error';
                    saveTimer = setTimeout(() => window.Cloud.saveTranslations(readTranslations()), 5000);
                }
                renderBar();
            }, 700);
        }
    };

    auth.onAuthStateChanged(connectUser);
    auth.getRedirectResult().catch(error => {
        console.error('Google kirish yo‘naltirishida xato:', error);
    });
    renderBar();
})();