let currentExerciseId = 1;

// Sahifa yuklanganda avtomatik 1-mashqni ochish
window.onload = function() {
    if (typeof exercisesData !== 'undefined' && exercisesData[1]) {
        loadExercise(1);
    }
};

// Mashqni yuklash funksiyasi
function loadExercise(id) {
    currentExerciseId = id;
    const ex = exercisesData[id];
    if (!ex) return;

    const titleEl = document.getElementById('exercise-title');
    const passageEl = document.getElementById('exercise-passage');
    const questionsEl = document.getElementById('exercise-questions');

    if (titleEl) {
        titleEl.innerText = ex.title1 || `Mashq ${id}`;
    }
    
    if (passageEl) {
        // Matndagi so'zlarni alohida spanlarga bo'lish
        const words = ex.passage1.split(/\s+/);
        passageEl.innerHTML = words.map(word => `<span class="clickable-word">${word}</span>`).join(' ');
    }

    if (questionsEl) {
        questionsEl.innerHTML = ex.questions1 || '';
    }

    // Natija oynasini tozalash va yashirish
    const resultBox = document.getElementById('result-box');
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
}

// Javoblarni tekshirish funksiyasi
function checkAnswers() {
    const ex = exercisesData[currentExerciseId];
    if (!ex) return;

    let score = 0;
    let total = 0;

    // 1. Matnli input maydonlarini tekshirish
    const inputs = document.querySelectorAll('.questions-section input[type="text"]');
    inputs.forEach(input => {
        total++;
        const userAnswer = input.value.trim().toLowerCase();
        const correctAnswer = (input.getAttribute('data-ans') || '').trim().toLowerCase();

        if (userAnswer !== "" && correctAnswer.includes(userAnswer)) {
            score++;
            input.style.borderColor = 'green';
            input.style.backgroundColor = '#e8f5e9';
        } else {
            input.style.borderColor = 'red';
            input.style.backgroundColor = '#ffebee';
        }
    });

    // 2. Test (radio button) savollarini tekshirish
    const radioGroups = document.querySelectorAll('.options-group');
    radioGroups.forEach(group => {
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

    // Natijani ekranga chiqarish
    const resultBox = document.getElementById('result-box');
    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `Sizning natijangiz: <b>${score}</b> / ${total} ta to'g'ri.`;
    }
}

// Qaytadan boshlash funksiyasi
function resetExercise() {
    loadExercise(currentExerciseId);
}