let currentExerciseId = 1;
const translationsStorageKey = 'readingWordTranslations';

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

let selectedTranslationTarget = null;
let selectedPhraseRange = null;
let clickedWordOnMouseDown = false;
const markedWords = new Map();
let markedWordQueue = [];
let markedWordQueueIndex = 0;

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

function openWordTranslation(wordEl, queuePosition = 0, queueLength = 0) {
    const scope = wordEl.dataset.translationScope;
    openTranslationEditor({
        type: 'word',
        key: getWordTranslationKey(currentExerciseId, scope, Number(wordEl.dataset.wordIndex)),
        scope,
        wordEl,
        phraseText: wordEl.dataset.word,
        queuePosition,
        queueLength
    });
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

function openTranslationEditor(target) {
    selectedTranslationTarget = target;
    const translations = getWordTranslations();
    const position = target.queuePosition ? `${target.queuePosition}/${target.queueLength}: ` : '';
    document.getElementById('translation-label').textContent = `${position}"${target.phraseText}" tarjimasi`;
    const input = document.getElementById('translation-input');
    input.value = translations[target.key] || '';
    document.getElementById('translation-editor').hidden = false;
    input.focus();
    input.select();
}

function closeWordTranslation() {
    selectedTranslationTarget = null;
    document.getElementById('translation-editor').hidden = true;
}

function saveWordTranslation() {
    if (!selectedTranslationTarget) return;

    const target = selectedTranslationTarget;
    const translations = getWordTranslations();
    const cleanedTranslation = document.getElementById('translation-input').value.trim();
    if (cleanedTranslation) {
        if (target.type === 'phrase') {
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

    if (target.type === 'phrase') {
        if (target.scope === 'p') {
            renderPassage(currentExerciseId, document.getElementById('exercise-passage'));
        } else {
            renderQuestionPhraseTranslations(currentExerciseId, document.getElementById('exercise-questions'));
        }
    } else {
        const existingTranslation = target.wordEl.querySelector(':scope > .word-translation:not(.question-phrase-translation)');
        if (existingTranslation) existingTranslation.remove();

        if (cleanedTranslation) {
            const translationEl = document.createElement('span');
            translationEl.className = 'word-translation';
            translationEl.textContent = cleanedTranslation;
            target.wordEl.insertBefore(translationEl, target.wordEl.firstChild);
        }
    }

    if (target.queuePosition) {
        target.wordEl.classList.remove('is-marked');
        markedWords.delete(target.key);
        closeWordTranslation();
        markedWordQueueIndex++;

        if (markedWordQueueIndex < markedWordQueue.length) {
            openWordTranslation(markedWordQueue[markedWordQueueIndex], markedWordQueueIndex + 1, markedWordQueue.length);
        } else {
            markedWordQueue = [];
            markedWordQueueIndex = 0;
            updateTranslationControls();
            clearPhraseSelection();
        }
        return;
    }

    closeWordTranslation();
    clearPhraseSelection();
}

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

const translateSelectionButton = document.getElementById('translate-selection');
const clearSelectionButton = document.getElementById('clear-selection');
const passageElement = document.getElementById('exercise-passage');
const questionsElement = document.getElementById('exercise-questions');

function updateTranslationControls() {
    const markedCount = markedWords.size;
    const hasPhrase = !!selectedPhraseRange;
    translateSelectionButton.disabled = markedCount === 0 && !hasPhrase;
    clearSelectionButton.disabled = markedCount === 0 && !hasPhrase;
    translateSelectionButton.textContent = markedCount
        ? `${markedCount} ta belgilangan so'zga tarjima yozish`
        : hasPhrase
            ? `${selectedPhraseRange.end - selectedPhraseRange.start + 1} ta so'zli iborani tarjima qilish`
            : "Notanish so'zlarni belgilang";
}

function setSelectedPhraseRange(phraseRange) {
    selectedPhraseRange = phraseRange;
    document.querySelectorAll('.clickable-word').forEach(wordEl => {
        const wordIndex = Number(wordEl.dataset.wordIndex);
        wordEl.classList.toggle(
            'is-selected',
            !!phraseRange && wordEl.dataset.translationScope === phraseRange.scope &&
                wordIndex >= phraseRange.start && wordIndex <= phraseRange.end
        );
    });
    updateTranslationControls();
}

function clearPhraseSelection() {
    setSelectedPhraseRange(null);
    window.getSelection().removeAllRanges();
}

function toggleWordMark(wordEl) {
    const scope = wordEl.dataset.translationScope;
    const wordIndex = Number(wordEl.dataset.wordIndex);
    const key = getWordTranslationKey(currentExerciseId, scope, wordIndex);

    if (markedWords.has(key)) {
        markedWords.delete(key);
        wordEl.classList.remove('is-marked');
    } else {
        markedWords.set(key, wordEl);
        wordEl.classList.add('is-marked');
    }
    setSelectedPhraseRange(null);
}

function clearAllSelections() {
    markedWords.forEach(wordEl => wordEl.classList.remove('is-marked'));
    markedWords.clear();
    markedWordQueue = [];
    markedWordQueueIndex = 0;
    if (selectedTranslationTarget && selectedTranslationTarget.queuePosition) closeWordTranslation();
    clearPhraseSelection();
}

function startMarkedWordTranslations() {
    markedWordQueue = Array.from(markedWords.values()).sort((first, second) => {
        const position = first.compareDocumentPosition(second);
        return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    if (!markedWordQueue.length) return;

    markedWordQueueIndex = 0;
    openWordTranslation(markedWordQueue[0], 1, markedWordQueue.length);
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
        } else if (!clickedWordOnMouseDown) {
            clearPhraseSelection();
        }
        clickedWordOnMouseDown = false;
    });
}

trackWordSelection(passageElement);
trackWordSelection(questionsElement);

translateSelectionButton.addEventListener('mousedown', event => event.preventDefault());
translateSelectionButton.addEventListener('click', () => {
    if (markedWords.size) {
        startMarkedWordTranslations();
    } else if (selectedPhraseRange) {
        openPhraseTranslation(
            selectedPhraseRange.scope,
            selectedPhraseRange.start,
            selectedPhraseRange.end,
            selectedPhraseRange.phraseText
        );
    }
});
clearSelectionButton.addEventListener('mousedown', event => event.preventDefault());
clearSelectionButton.addEventListener('click', clearAllSelections);

document.addEventListener('click', event => {
    const phraseAnnotation = event.target.closest('.translated-phrase rt, .question-phrase-translation');
    if (phraseAnnotation) {
        const phraseEl = phraseAnnotation.closest('.translated-phrase');
        const scope = phraseEl ? 'p' : phraseAnnotation.dataset.phraseScope;
        openPhraseTranslation(
            scope,
            Number(phraseAnnotation.dataset.phraseStart || phraseEl.dataset.phraseStart),
            Number(phraseAnnotation.dataset.phraseEnd || phraseEl.dataset.phraseEnd),
            phraseAnnotation.dataset.phraseText || phraseEl.dataset.phraseText
        );
        return;
    }

    const wordEl = event.target.closest('.clickable-word');
    if (!wordEl) return;
    event.preventDefault();

    const phraseRange = getSelectedPhraseRange();
    if (phraseRange) setSelectedPhraseRange(phraseRange);
    else toggleWordMark(wordEl);
});

document.addEventListener('keydown', event => {
    const phraseAnnotation = event.target.closest('.question-phrase-translation, .translated-phrase rt');
    if (phraseAnnotation && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        phraseAnnotation.click();
        return;
    }

    const wordEl = event.target.closest('.clickable-word');
    if (wordEl && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        toggleWordMark(wordEl);
    }
});

document.getElementById('translation-save').addEventListener('click', saveWordTranslation);
document.getElementById('translation-cancel').addEventListener('click', closeWordTranslation);
document.getElementById('translation-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') saveWordTranslation();
    if (event.key === 'Escape') closeWordTranslation();
});

window.onload = function() {
    if (typeof exercisesData !== 'undefined' && exercisesData[1]) {
        loadExercise(1);
    }
};

function loadExercise(id) {
    closeWordTranslation();
    clearAllSelections();
    currentExerciseId = id;
    const ex = exercisesData[id];
    if (!ex) return;

    const titleEl = document.getElementById('exercise-title');
    const questionsEl = document.getElementById('exercise-questions');
    if (titleEl) titleEl.innerText = ex.title1 || `Mashq ${id}`;
    renderPassage(id, passageElement);

    if (questionsEl) {
        questionsEl.innerHTML = ex.questions1 || '';
        prepareQuestionTranslations(id, questionsEl);
    }

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
                wordEl.setAttribute('aria-label', `${match[0]} tarjimasini belgilash`);

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
}

function renderQuestionPhraseTranslations(id, questionsEl, translations = getWordTranslations()) {
    questionsEl.querySelectorAll('.question-phrase-translation').forEach(annotation => annotation.remove());

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

        phrases.forEach(phrase => {
            const phraseWords = Array.from(questionEl.querySelectorAll('.clickable-word')).filter(wordEl => {
                const index = Number(wordEl.dataset.wordIndex);
                return wordEl.dataset.translationScope === scope && index >= phrase.start && index <= phrase.end;
            });
            const firstWord = phraseWords.find(wordEl => Number(wordEl.dataset.wordIndex) === phrase.start);
            if (!firstWord) return;

            const annotation = document.createElement('span');
            annotation.className = 'word-translation question-phrase-translation';
            annotation.dataset.phraseScope = scope;
            annotation.dataset.phraseStart = phrase.start;
            annotation.dataset.phraseEnd = phrase.end;
            annotation.dataset.phraseText = phraseWords.map(wordEl => wordEl.dataset.word).join(' ');
            annotation.tabIndex = 0;
            annotation.setAttribute('role', 'button');
            annotation.textContent = phrase.translation;
            firstWord.insertBefore(annotation, firstWord.firstChild);
        });
    });
}

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

    function renderWord(word, index) {
        const key = getWordTranslationKey(id, 'p', index);
        const plainWord = word.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim();
        const translation = translations[key]
            ? `<span class="word-translation">${escapeHtml(translations[key])}</span>`
            : '';
        return `<span class="clickable-word" data-translation-scope="p" data-word-index="${index}" data-word="${escapeHtml(plainWord)}" tabindex="0" role="button" aria-label="${escapeHtml(plainWord)} tarjimasini belgilash">${translation}<span class="word-text">${word}</span></span>`;
    }

    const renderedParts = [];
    for (let index = 0; index < words.length;) {
        const phrase = phraseByStart.get(index);
        if (!phrase) {
            renderedParts.push(renderWord(words[index], index));
            index++;
            continue;
        }

        const phraseWords = [];
        for (let phraseIndex = phrase.start; phraseIndex <= phrase.end; phraseIndex++) {
            phraseWords.push(renderWord(words[phraseIndex], phraseIndex));
        }
        const phraseText = words.slice(phrase.start, phrase.end + 1)
            .map(word => word.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim())
            .join(' ');
        renderedParts.push(
            `<ruby class="translated-phrase" data-phrase-start="${phrase.start}" data-phrase-end="${phrase.end}" data-phrase-text="${escapeHtml(phraseText)}"><span class="phrase-words">${phraseWords.join(' ')}</span><rt class="word-translation" tabindex="0" role="button">${escapeHtml(phrase.translation)}</rt></ruby>`
        );
        index = phrase.end + 1;
    }

    passageEl.innerHTML = renderedParts.join(' ');
}