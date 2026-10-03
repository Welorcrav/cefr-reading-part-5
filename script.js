let currentExerciseId = 1;
const translationsStorageKey = 'readingWordTranslations';
const marksStorageKey = 'readingMarkedWords';

function getWordTranslations() {
    try {
        return JSON.parse(localStorage.getItem(translationsStorageKey) || '{}');
    } catch (error) {
        return {};
    }
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

let selectedTranslationTarget = null; // hozir tahrirlanayotgan so'z yoki ibora
let selectedPhraseRange = null;       // sichqoncha bilan sudrab belgilangan ibora
let clickedWordOnMouseDown = false;
let markMode = true;                  // true: bosganda faqat belgilanadi (odatiy)
const markedWords = new Map();        // kalit -> { scope, index }
let markedQueue = [];
let markedQueueIndex = 0;

const translateSelectionButton = document.getElementById('translate-selection');
const clearSelectionButton = document.getElementById('clear-selection');
const passageElement = document.getElementById('exercise-passage');
const questionsElement = document.getElementById('exercise-questions');
const translationInput = document.getElementById('translation-input');
const modeToggleButton = document.getElementById('mark-mode-toggle');

const DEFAULT_HINT = "So'zni bosing. Ibora uchun sudrab belgilang";
const MARK_HINT = "So'zlarni bosib belgilang";

/* Javob yozilayotgan maydondagi kursorni buzmaslik uchun */
function isTypingInAnswerField() {
    const active = document.activeElement;
    return !!active && active.tagName === 'INPUT' && active.id !== 'translation-input' &&
        !!active.closest('#exercise-questions');
}

function clearNativeSelection() {
    if (isTypingInAnswerField()) return;
    window.getSelection().removeAllRanges();
}

function getWordTranslationKey(exerciseId, scope, wordIndex) {
    return scope === 'p'
        ? `${exerciseId}-${wordIndex}`
        : `${exerciseId}-${scope}-${wordIndex}`;
}

function getPhraseTranslationKey(exerciseId, scope, start, end) {
    return scope === 'p'
        ? `${exerciseId}-phrase-${start}-${end}`
        : `${exerciseId}-${scope}-phrase-${start}-${end}`;
}

function findWordEl(scope, index) {
    return document.querySelector(
        `.clickable-word[data-translation-scope="${scope}"][data-word-index="${index}"]`
    );
}

/* ---------- Belgilash (highlight) ---------- */

function getTargetRange() {
    const t = selectedTranslationTarget;
    if (!t) return null;
    return t.type === 'word'
        ? { scope: t.scope, start: t.index, end: t.index }
        : { scope: t.scope, start: t.start, end: t.end };
}

function refreshHighlight() {
    const range = selectedPhraseRange || getTargetRange();
    document.querySelectorAll('.clickable-word').forEach(wordEl => {
        const index = Number(wordEl.dataset.wordIndex);
        const scope = wordEl.dataset.translationScope;
        wordEl.classList.toggle(
            'is-selected',
            !!range && scope === range.scope && index >= range.start && index <= range.end
        );
        wordEl.classList.toggle(
            'is-marked',
            markedWords.has(getWordTranslationKey(currentExerciseId, scope, index))
        );
    });
}

function updateTranslationControls() {
    const markedCount = markedWords.size;
    const hasPhrase = !!selectedPhraseRange;
    translateSelectionButton.disabled = markedCount === 0 && !hasPhrase;
    translateSelectionButton.textContent = markedCount
        ? `${markedCount} ta belgilangan so'zga tarjima yozish`
        : hasPhrase
            ? `${selectedPhraseRange.end - selectedPhraseRange.start + 1} ta so'zli iborani tarjima qilish`
            : (markMode ? MARK_HINT : DEFAULT_HINT);
    if (modeToggleButton) {
    modeToggleButton.addEventListener('click', () => {
        markMode = !markMode;
        if (!markMode) {
            stopQueue();
            if (selectedTranslationTarget && selectedTranslationTarget.queueLength) closeWordTranslation();
        }
        updateTranslationControls();
    });
}

if (clearSelectionButton) {
        clearSelectionButton.disabled = markedCount === 0 && !hasPhrase && !selectedTranslationTarget;
    }
    if (modeToggleButton) {
        modeToggleButton.textContent = markMode ? "Belgilash rejimi: yoqiq" : "Belgilash rejimi: o'chiq";
        modeToggleButton.classList.toggle('btn-success', markMode);
        modeToggleButton.classList.toggle('btn-secondary', !markMode);
    }
}

function setSelectedPhraseRange(phraseRange) {
    selectedPhraseRange = phraseRange;
    refreshHighlight();
    updateTranslationControls();
}

function clearPhraseSelection() {
    setSelectedPhraseRange(null);
    clearNativeSelection();
}

/* ---------- Tarjima muharriri ---------- */

function openTranslationEditor(target) {
    selectedTranslationTarget = target;
    const translations = getWordTranslations();
    const position = target.queueLength ? `${target.queuePosition}/${target.queueLength}: ` : '';
    document.getElementById('translation-label').textContent = `${position}"${target.phraseText}" tarjimasi`;
    translationInput.value = translations[target.key] || '';
    document.getElementById('translation-editor').hidden = false;
    refreshHighlight();
    updateTranslationControls();
    translationInput.focus();
    translationInput.select();
}

function openWordTranslation(wordEl, queuePosition = 0, queueLength = 0) {
    const scope = wordEl.dataset.translationScope;
    const index = Number(wordEl.dataset.wordIndex);
    openTranslationEditor({
        type: 'word',
        key: getWordTranslationKey(currentExerciseId, scope, index),
        scope,
        index,
        phraseText: wordEl.dataset.word,
        queuePosition,
        queueLength
    });
}

/* ---------- Belgilab, keyin ketma-ket yozish ---------- */

function getStoredMarks() {
    try {
        return JSON.parse(localStorage.getItem(marksStorageKey) || '{}');
    } catch (error) {
        return {};
    }
}

// Joriy mashqdagi belgilarni brauzerga va bulutga yozadi
function persistMarks() {
    const stored = getStoredMarks();
    const prefix = `${currentExerciseId}-`;
    Object.keys(stored).forEach(key => {
        if (key.startsWith(prefix)) delete stored[key];
    });
    markedWords.forEach((item, key) => { stored[key] = true; });
    try {
        localStorage.setItem(marksStorageKey, JSON.stringify(stored));
    } catch (error) {
        console.error('Belgilarni saqlab bo‘lmadi:', error);
    }
    if (window.Cloud && window.Cloud.saveMarks) window.Cloud.saveMarks();
}

// Saqlangan belgilarni joriy mashq uchun tiklaydi
function loadMarksForExercise(id) {
    markedWords.clear();
    const prefix = `${id}-`;
    Object.keys(getStoredMarks()).forEach(key => {
        if (!key.startsWith(prefix)) return;
        const rest = key.slice(prefix.length);
        let match = rest.match(/^(\d+)$/);
        if (match) {
            markedWords.set(key, { key, scope: 'p', index: Number(match[1]) });
            return;
        }
        match = rest.match(/^(q\d+)-(\d+)$/);
        if (match) markedWords.set(key, { key, scope: match[1], index: Number(match[2]) });
    });
}

function toggleWordMark(scope, index) {
    const key = getWordTranslationKey(currentExerciseId, scope, index);
    if (markedWords.has(key)) markedWords.delete(key);
    else markedWords.set(key, { key, scope, index });
    persistMarks();
    refreshHighlight();
    updateTranslationControls();
}

function stopQueue() {
    markedQueue = [];
    markedQueueIndex = 0;
}

function clearAllMarks() {
    markedWords.clear();
    persistMarks();
    stopQueue();
    if (selectedTranslationTarget) closeWordTranslation();
    else clearPhraseSelection();
    refreshHighlight();
    updateTranslationControls();
}

function scopeRank(scope) {
    return scope === 'p' ? -1 : Number(scope.slice(1));
}

function startMarkedQueue() {
    markedQueue = Array.from(markedWords.values()).sort((a, b) =>
        scopeRank(a.scope) - scopeRank(b.scope) || a.index - b.index);
    markedQueueIndex = 0;
    openNextInQueue();
}

function openNextInQueue() {
    while (markedQueueIndex < markedQueue.length) {
        const item = markedQueue[markedQueueIndex];
        const wordEl = findWordEl(item.scope, item.index);
        if (wordEl) {
            openWordTranslation(wordEl, markedQueueIndex + 1, markedQueue.length);
            return;
        }
        markedWords.delete(item.key);
        persistMarks();
        markedQueueIndex++;
    }
    stopQueue();
    refreshHighlight();
    updateTranslationControls();
}

function cancelEditor() {
    if (selectedTranslationTarget && selectedTranslationTarget.queueLength) stopQueue();
    closeWordTranslation();
}

function openPhraseTranslation(scope, start, end, phraseText) {
    openTranslationEditor({
        type: 'phrase',
        key: getPhraseTranslationKey(currentExerciseId, scope, start, end),
        scope,
        start,
        end,
        phraseText
    });
}

function openPhraseFromElement(el) {
    openPhraseTranslation(
        el.dataset.phraseScope,
        Number(el.dataset.phraseStart),
        Number(el.dataset.phraseEnd),
        el.dataset.phraseText
    );
}

function closeWordTranslation() {
    selectedTranslationTarget = null;
    selectedPhraseRange = null;
    document.getElementById('translation-editor').hidden = true;
    clearNativeSelection();
    refreshHighlight();
    updateTranslationControls();
}

function refreshScope(scope) {
    if (scope === 'p') {
        renderPassage(currentExerciseId, passageElement);
    } else {
        rebuildQuestions();
    }
}

function saveWordTranslation() {
    if (!selectedTranslationTarget) return;

    const target = selectedTranslationTarget;
    const translations = getWordTranslations();
    const cleanedTranslation = translationInput.value.trim();

    if (cleanedTranslation) {
        if (target.type === 'phrase') {
            // Ustma-ust tushgan eski iboralarni olib tashlaymiz
            const phrasePrefix = target.scope === 'p'
                ? `${currentExerciseId}-phrase-`
                : `${currentExerciseId}-${target.scope}-phrase-`;
            Object.keys(translations).forEach(key => {
                if (!key.startsWith(phrasePrefix)) return;
                const [start, end] = key.slice(phrasePrefix.length).split('-').map(Number);
                if (start <= target.end && end >= target.start) delete translations[key];
            });
        }
        translations[target.key] = cleanedTranslation;
    } else {
        delete translations[target.key];
    }

    try {
        localStorage.setItem(translationsStorageKey, JSON.stringify(translations));
    } catch (error) {
        alert("Tarjimani saqlab bo'lmadi.");
        return;
    }
    if (window.Cloud) window.Cloud.saveTranslations(translations);

    const scope = target.scope;
    closeWordTranslation();
    refreshScope(scope);

    if (target.queueLength) {
        markedWords.delete(target.key);
        persistMarks();
        markedQueueIndex++;
        openNextInQueue();
    }
}

/* ---------- Matndan belgilangan iborani aniqlash ---------- */

function getWordElement(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element && element.closest ? element.closest('.clickable-word') : null;
}

function getSelectedPhraseRange() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const startWord = getWordElement(range.startContainer);
    const endWord = getWordElement(range.endContainer);
    if (!startWord || !endWord) return null;

    const start = Number(startWord.dataset.wordIndex);
    const end = Number(endWord.dataset.wordIndex);
    const scope = startWord.dataset.translationScope;
    const phraseText = selection.toString().replace(/\s+/g, ' ').trim();
    if (scope !== endWord.dataset.translationScope || end <= start || phraseText.split(' ').length < 2) return null;

    return { scope, start, end, phraseText };
}

document.addEventListener('selectionchange', () => {
    const phraseRange = getSelectedPhraseRange();
    if (phraseRange) setSelectedPhraseRange(phraseRange);
});

function trackWordSelection(region) {
    region.addEventListener('mousedown', event => {
        clickedWordOnMouseDown = !!event.target.closest('.clickable-word');
    });
    region.addEventListener('mouseup', () => {
        const phraseRange = getSelectedPhraseRange();
        if (phraseRange) {
            setSelectedPhraseRange(phraseRange);
            openPhraseTranslation(phraseRange.scope, phraseRange.start, phraseRange.end, phraseRange.phraseText);
        }
        clickedWordOnMouseDown = false;
    });
}

trackWordSelection(passageElement);
trackWordSelection(questionsElement);

translateSelectionButton.addEventListener('mousedown', event => event.preventDefault());
translateSelectionButton.addEventListener('click', () => {
    if (markedWords.size) {
        startMarkedQueue();
    } else if (selectedPhraseRange) {
        openPhraseTranslation(
            selectedPhraseRange.scope,
            selectedPhraseRange.start,
            selectedPhraseRange.end,
            selectedPhraseRange.phraseText
        );
    }
});

if (clearSelectionButton) {
    clearSelectionButton.addEventListener('mousedown', event => event.preventDefault());
    clearSelectionButton.addEventListener('click', clearAllMarks);
}

/* ---------- Bosish (click) ---------- */

document.addEventListener('click', event => {
    // Ibora tarjimasi ustiga bosildi -> tahrirlash
    const annotation = event.target.closest('.phrase-translation');
    if (annotation) {
        openPhraseFromElement(annotation.closest('.translated-phrase') || annotation);
        return;
    }

    const wordEl = event.target.closest('.clickable-word');
    if (!wordEl) return;
    event.preventDefault();

    // Sudrab belgilash tugagan bo'lsa, muharrir allaqachon ochilgan
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
        if (selectedTranslationTarget) translationInput.focus();
        return;
    }

    // Tayyor iboraning ichidagi so'z -> butun iborani tahrirlash
    const phraseEl = wordEl.closest('.translated-phrase');
    if (phraseEl) {
        openPhraseFromElement(phraseEl);
        return;
    }

    const scope = wordEl.dataset.translationScope;
    const index = Number(wordEl.dataset.wordIndex);
    const current = selectedTranslationTarget;

    if (markMode) {
        // Navbat bo'yicha yozish ketayotganda belgilarni o'zgartirmaymiz
        if (current && current.queueLength) { translationInput.focus(); return; }
        toggleWordMark(scope, index);
        return;
    }

    if (current && current.type === 'word' && current.scope === scope && current.index === index) {
        translationInput.focus();
        return;
    }

    // Boshqa so'z ochiq bo'lsa: o'zgarish bo'lsa avtomatik saqlaymiz
    if (current) {
        const stored = getWordTranslations()[current.key] || '';
        if (translationInput.value.trim() !== stored) saveWordTranslation();
        else closeWordTranslation();
    }

    const nextEl = findWordEl(scope, index);
    if (nextEl) openWordTranslation(nextEl);
});

document.addEventListener('keydown', event => {
    const target = event.target;
    if (!target.closest) return;
    const interactive = target.closest('.phrase-translation, .clickable-word');
    if (interactive && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        interactive.click();
    }
});

document.getElementById('translation-save').addEventListener('click', saveWordTranslation);
document.getElementById('translation-cancel').addEventListener('click', cancelEditor);
translationInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveWordTranslation();
    if (event.key === 'Escape') cancelEditor();
});

/* ---------- Mashqni yuklash ---------- */

window.onload = function () {
    updateTranslationControls();
    if (typeof exercisesData !== 'undefined' && exercisesData[1]) {
        loadExercise(1);
    }
};

function loadExercise(id) {
    stopQueue();
    closeWordTranslation();
    currentExerciseId = id;
    loadMarksForExercise(id);
    updateTranslationControls();
    const ex = exercisesData[id];
    if (!ex) return;

    const titleEl = document.getElementById('exercise-title');
    if (titleEl) titleEl.innerText = ex.title1 || `Mashq ${id}`;
    renderPassage(id, passageElement);

    questionsElement.innerHTML = ex.questions1 || '';
    prepareQuestionTranslations(id, questionsElement);

    const resultBox = document.getElementById('result-box');
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
}

function checkAnswers() {
    const ex = exercisesData[currentExerciseId];
    if (!ex) return;

    let score = 0;
    let total = 0;
    const inputs = document.querySelectorAll('.questions-section input[type="text"]');
    inputs.forEach(input => {
        total++;
        const userAnswer = input.value.trim().toLowerCase();
        const correctAnswer = (input.getAttribute('data-ans') || '').trim().toLowerCase();
        if (userAnswer !== '' && correctAnswer.includes(userAnswer)) {
            score++;
            input.style.borderColor = 'green';
            input.style.backgroundColor = '#e8f5e9';
        } else {
            input.style.borderColor = 'red';
            input.style.backgroundColor = '#ffebee';
        }
    });

    document.querySelectorAll('.options-group').forEach(group => {
        total++;
        const qName = group.getAttribute('data-q');
        const correctAns = group.getAttribute('data-ans');
        const selected = document.querySelector(`input[name="${qName}"]:checked`);
        if (selected && selected.value === correctAns) {
            score++;
            group.style.color = 'green';
        } else {
            group.style.color = 'red';
        }
    });

    const resultBox = document.getElementById('result-box');
    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `Sizning natijangiz: <b>${score}</b> / ${total} ta to'g'ri.`;
    }
}

function resetExercise() {
    loadExercise(currentExerciseId);
}

/* Savollarni qayta chizish (yozilgan javoblar saqlanib qoladi) */
function rebuildQuestions() {
    const ex = exercisesData[currentExerciseId];
    if (!ex) return;

    const inputs = Array.from(questionsElement.querySelectorAll('input[type="text"]'))
        .map(input => ({ value: input.value, style: input.getAttribute('style') || '' }));
    const radios = Array.from(questionsElement.querySelectorAll('input[type="radio"]'))
        .map(input => input.checked);
    const groups = Array.from(questionsElement.querySelectorAll('.options-group'))
        .map(group => group.getAttribute('style') || '');

    questionsElement.innerHTML = ex.questions1 || '';
    prepareQuestionTranslations(currentExerciseId, questionsElement);

    questionsElement.querySelectorAll('input[type="text"]').forEach((input, index) => {
        if (!inputs[index]) return;
        input.value = inputs[index].value;
        if (inputs[index].style) input.setAttribute('style', inputs[index].style);
    });
    questionsElement.querySelectorAll('input[type="radio"]').forEach((input, index) => {
        input.checked = !!radios[index];
    });
    questionsElement.querySelectorAll('.options-group').forEach((group, index) => {
        if (groups[index]) group.setAttribute('style', groups[index]);
    });
}

function applyTranslationsUpdate() {
    if (typeof exercisesData === 'undefined' || !exercisesData[currentExerciseId]) return;
    stopQueue();
    closeWordTranslation();
    loadMarksForExercise(currentExerciseId);
    updateTranslationControls();
    renderPassage(currentExerciseId, passageElement);
    rebuildQuestions();
}

window.addEventListener('translations-updated', () => {
    // Foydalanuvchi javob yozayotgan bo'lsa, qayta chizmaymiz (kursor yo'qolmasligi uchun)
    if (isTypingInAnswerField()) {
        questionsElement.addEventListener('focusout', () => setTimeout(applyTranslationsUpdate, 0), { once: true });
        return;
    }
    applyTranslationsUpdate();
});

/* ---------- Savollardagi so'zlar ---------- */

function prepareQuestionTranslations(id, questionsEl) {
    const translations = getWordTranslations();
    questionsEl.querySelectorAll('.question-item').forEach((questionEl, questionIndex) => {
        const scope = `q${questionIndex}`;
        const textWalker = document.createTreeWalker(questionEl, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (textWalker.nextNode()) textNodes.push(textWalker.currentNode);

        let wordIndex = 0;
        textNodes.forEach(textNode => {
            const text = textNode.nodeValue;
            const wordPattern = /\S+/g;
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;
            let foundWord = false;

            while ((match = wordPattern.exec(text))) {
                foundWord = true;
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                const wordEl = document.createElement('span');
                wordEl.className = 'clickable-word';
                wordEl.dataset.translationScope = scope;
                wordEl.dataset.wordIndex = wordIndex;
                wordEl.dataset.word = match[0];
                wordEl.tabIndex = 0;
                wordEl.setAttribute('role', 'button');
                wordEl.setAttribute('aria-label', `${match[0]} tarjimasini yozish`);

                const translation = translations[getWordTranslationKey(id, scope, wordIndex)];
                if (translation) {
                    const translationEl = document.createElement('span');
                    translationEl.className = 'word-translation';
                    translationEl.textContent = translation;
                    wordEl.appendChild(translationEl);
                }

                const wordText = document.createElement('span');
                wordText.className = 'word-text';
                wordText.textContent = match[0];
                wordEl.appendChild(wordText);
                fragment.appendChild(wordEl);
                lastIndex = wordPattern.lastIndex;
                wordIndex++;
            }

            if (foundWord) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
                textNode.parentNode.replaceChild(fragment, textNode);
            }
        });
    });
    renderQuestionPhraseTranslations(id, questionsEl, translations);
    refreshHighlight();
}

function renderQuestionPhraseTranslations(id, questionsEl, translations = getWordTranslations()) {
    questionsEl.querySelectorAll('.question-item').forEach((questionEl, questionIndex) => {
        const scope = `q${questionIndex}`;
        const phrasePrefix = `${id}-${scope}-phrase-`;
        const phrases = Object.entries(translations)
            .filter(([key, translation]) => key.startsWith(phrasePrefix) && translation)
            .map(([key, translation]) => {
                const [start, end] = key.slice(phrasePrefix.length).split('-').map(Number);
                return { start, end, translation };
            })
            .filter(phrase => Number.isInteger(phrase.start) && Number.isInteger(phrase.end) && phrase.end > phrase.start)
            .sort((first, second) => first.start - second.start);

        let previousEnd = -1;
        phrases.forEach(phrase => {
            if (phrase.start <= previousEnd) return;

            const wordEls = Array.from(questionEl.querySelectorAll('.clickable-word')).filter(wordEl => {
                const index = Number(wordEl.dataset.wordIndex);
                return index >= phrase.start && index <= phrase.end;
            });
            const firstWord = wordEls.find(wordEl => Number(wordEl.dataset.wordIndex) === phrase.start);
            const lastWord = wordEls.find(wordEl => Number(wordEl.dataset.wordIndex) === phrase.end);
            if (!firstWord || !lastWord) return;
            previousEnd = phrase.end;

            // Ibora ichidagi so'zlarning alohida tarjimasi ko'rinmaydi
            wordEls.forEach(wordEl => {
                wordEl.querySelectorAll(':scope > .word-translation').forEach(el => el.remove());
            });

            const setData = el => {
                el.dataset.phraseScope = scope;
                el.dataset.phraseStart = phrase.start;
                el.dataset.phraseEnd = phrase.end;
                el.dataset.phraseText = wordEls.map(wordEl => wordEl.dataset.word).join(' ');
            };

            const translationEl = document.createElement('span');
            translationEl.className = 'word-translation phrase-translation';
            translationEl.tabIndex = 0;
            translationEl.setAttribute('role', 'button');
            translationEl.textContent = phrase.translation;

            if (firstWord.parentNode === lastWord.parentNode) {
                const wrapper = document.createElement('span');
                wrapper.className = 'translated-phrase';
                setData(wrapper);
                const wordsBox = document.createElement('span');
                wordsBox.className = 'phrase-words';
                wrapper.append(translationEl, wordsBox);
                firstWord.parentNode.insertBefore(wrapper, firstWord);

                let node = firstWord;
                while (node) {
                    const next = node.nextSibling;
                    wordsBox.appendChild(node);
                    if (node === lastWord) break;
                    node = next;
                }
            } else {
                // So'zlar turli teglar ichida bo'lsa: tarjima birinchi so'z ustiga qo'yiladi
                setData(translationEl);
                firstWord.insertBefore(translationEl, firstWord.firstChild);
            }
        });
    });
}

/* ---------- Matnni (passage) chizish ---------- */

function renderPassage(id, passageEl) {
    const words = exercisesData[id].passage1.split(/\s+/);
    const translations = getWordTranslations();
    const phrasePrefix = `${id}-phrase-`;
    const phrases = Object.entries(translations)
        .filter(([key, translation]) => key.startsWith(phrasePrefix) && translation)
        .map(([key, translation]) => {
            const [start, end] = key.slice(phrasePrefix.length).split('-').map(Number);
            return { start, end, translation };
        })
        .filter(phrase => Number.isInteger(phrase.start) && Number.isInteger(phrase.end) && phrase.end < words.length)
        .sort((first, second) => first.start - second.start);
    const phraseByStart = new Map();
    let previousEnd = -1;
    phrases.forEach(phrase => {
        if (phrase.start > previousEnd) {
            phraseByStart.set(phrase.start, phrase);
            previousEnd = phrase.end;
        }
    });

    function splitBreaks(word) {
        const breaks = word.match(/(?:<br\s*\/?>)+$/i)?.[0] || '';
        return { content: breaks ? word.slice(0, -breaks.length) : word, breaks };
    }

    function renderWord(word, index, inPhrase) {
        const { content, breaks } = splitBreaks(word);
        const plainWord = content.replace(/<[^>]*>/g, '').trim();
        const key = getWordTranslationKey(id, 'p', index);
        const translation = !inPhrase && translations[key]
            ? `<span class="word-translation">${escapeHtml(translations[key])}</span>`
            : '';
        return `<span class="clickable-word" data-translation-scope="p" data-word-index="${index}" data-word="${escapeHtml(plainWord)}" tabindex="0" role="button" aria-label="${escapeHtml(plainWord)} tarjimasini yozish">${translation}<span class="word-text">${content}</span></span>${inPhrase ? '' : breaks}`;
    }

    const renderedParts = [];
    for (let index = 0; index < words.length;) {
        const phrase = phraseByStart.get(index);
        if (!phrase) {
            renderedParts.push(renderWord(words[index], index, false));
            index++;
            continue;
        }

        const phraseWords = [];
        for (let phraseIndex = phrase.start; phraseIndex <= phrase.end; phraseIndex++) {
            phraseWords.push(renderWord(words[phraseIndex], phraseIndex, true));
        }
        const phraseText = words.slice(phrase.start, phrase.end + 1)
            .map(word => word.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim())
            .join(' ');
        const trailingBreaks = splitBreaks(words[phrase.end]).breaks;

        renderedParts.push(
            `<span class="translated-phrase" data-phrase-scope="p" data-phrase-start="${phrase.start}" data-phrase-end="${phrase.end}" data-phrase-text="${escapeHtml(phraseText)}">` +
            `<span class="word-translation phrase-translation" tabindex="0" role="button">${escapeHtml(phrase.translation)}</span>` +
            `<span class="phrase-words">${phraseWords.join(' ')}</span></span>${trailingBreaks}`
        );
        index = phrase.end + 1;
    }

    passageEl.innerHTML = renderedParts.join(' ');
    refreshHighlight();
}