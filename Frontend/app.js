let state = {
    field: 'General Interview',
    totalQuestions: 5,
    currentQuestionIndex: 0,
    questions: [],
    answers: [],
    mode: 'text',
    isRecording: false,
    micActive: false, // Tracks if the Speech API is physically running
    serverConfigured: false
};

// DOM Cache
const dom = {
    configSection: document.getElementById('config-section'),
    serverStatus: document.getElementById('server-status'),
    interviewSection: document.getElementById('interview-section'),
    resultSection: document.getElementById('result-section'),
    questionText: document.getElementById('question-text'),
    qNumber: document.getElementById('q-number'),
    progressBar: document.getElementById('progress-fill'),
    textInputContainer: document.getElementById('text-input-container'),
    audioInputContainer: document.getElementById('audio-input-container'),
    answerText: document.getElementById('answer-text'),
    recordBtn: document.getElementById('record-btn'),
    recordStatus: document.getElementById('record-status'),
    transcriptPreview: document.getElementById('transcript-preview'),
    loadingIndicator: document.getElementById('loading-indicator'),
    submitBtn: document.getElementById('submit-answer-btn'),
    prevBtn: document.getElementById('prev-btn'),
    instructionsSection: document.getElementById('instructions-section')
};



// Mode Selection
function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'audio') {
        dom.textInputContainer.classList.add('hidden');
        dom.audioInputContainer.classList.remove('hidden');
    } else {
        dom.textInputContainer.classList.remove('hidden');
        dom.audioInputContainer.classList.add('hidden');
        // Stop recording if active
        if (state.isRecording) {
            stopRecording();
        }
    }
}

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let finalTranscript = "";

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        state.micActive = true;
        dom.recordStatus.textContent = "Stop Recording";
        dom.recordBtn.classList.add('recording');
    };

    recognition.onend = () => {
        state.micActive = false;
        // Auto-restart if in audio mode and still recording (unless manually stopped)
        if (state.isRecording && state.mode === 'audio') {
            try { recognition.start(); } catch (e) { }
        } else {
            state.isRecording = false;
            dom.recordStatus.textContent = "Start Recording";
            dom.recordBtn.classList.remove('recording');
        }
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + " ";
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        dom.transcriptPreview.textContent = finalTranscript + interimTranscript;
        dom.answerText.value = finalTranscript + interimTranscript;
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Microphone access blocked. Please allow permission.");
            state.isRecording = false;
        }
    };
} else {
    console.warn("Speech Recognition API not supported in this browser.");
}


function toggleRecording() {
    if (!recognition) return alert("Speech Recognition not supported.");

    if (state.isRecording) {
        state.isRecording = false;
        recognition.stop();
    } else {
        state.isRecording = true;
        recognition.start();
        dom.transcriptPreview.textContent = finalTranscript || "Listening...";
    }
}



function clearTranscript() {
    finalTranscript = "";
    dom.transcriptPreview.textContent = "Your speech will appear here...";
    dom.answerText.value = "";
}

// API Utils
async function apiCall(endpoint, body, isFormData = false) {
    try {
        const options = {
            method: body ? 'POST' : 'GET',
            headers: isFormData ? {} : { 'Content-Type': 'application/json' },
            body: isFormData ? body : (body ? JSON.stringify(body) : null)
        };

        const response = await fetch(`/api${endpoint}`, options);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server returned ${response.status}`);
        }
        return await response.json();
    } catch (e) {
        console.error(`API Error (${endpoint}):`, e);
        throw e;
    }
}

async function checkServerStatus() {
    try {
        const data = await apiCall('/status');
        if (data.configured) {
            state.serverConfigured = true;
            dom.serverStatus.classList.add('hidden');
        }
    } catch (e) {
        dom.serverStatus.textContent = "Error: Cannot connect to AI server. Ensure Backend is running.";
        dom.serverStatus.classList.remove('hidden');
        document.getElementById('start-btn').disabled = true;
    }
}

// Initialization
checkServerStatus();

// Role Selection
document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.field = card.dataset.role;
        document.getElementById('field').value = state.field;
    });
});

// Navigation & Flow
function showInstructions() {
    if (!state.field) return alert("Please select a role first.");
    dom.configSection.classList.add('hidden');
    dom.instructionsSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideInstructions() {
    dom.instructionsSection.classList.add('hidden');
    dom.configSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function startInterview() {
    if (!state.serverConfigured) return alert("Server not ready.");

    const countInput = document.getElementById('count').value;
    state.totalQuestions = parseInt(countInput);

    // Request Mic Permission / Initialize
    if (state.mode === 'audio') {
        if (!recognition) {
            alert("Speech Recognition not supported in this browser.");
            return;
        }
        // We don't force start here anymore to avoid premature prompts.
        // Permission will be asked when user clicks "Start Recording" for the first question.
    }

    dom.instructionsSection.classList.add('hidden');
    dom.loadingIndicator.classList.remove('hidden');
    dom.interviewSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const data = await apiCall('/start', { field: state.field, count: state.totalQuestions });
        state.questions = data.questions;
        state.currentQuestionIndex = 0;
        dom.loadingIndicator.classList.add('hidden');
        loadQuestion();
    } catch (error) {
        alert(`Failed to start: ${error.message}`);
        hideInstructions();
        dom.interviewSection.classList.add('hidden');
    }
}

function loadQuestion() {
    const q = state.questions[state.currentQuestionIndex];
    dom.questionText.textContent = q;
    dom.qNumber.textContent = `Question ${state.currentQuestionIndex + 1}/${state.totalQuestions}`;
    dom.progressBar.style.width = `${((state.currentQuestionIndex + 1) / state.totalQuestions) * 100}%`;

    // Disable prev button on first question
    dom.prevBtn.disabled = state.currentQuestionIndex === 0;

    // Check if we already have an answer for this question
    const existingAnswer = state.answers.find(a => a.question === q);
    if (existingAnswer) {
        dom.answerText.value = existingAnswer.answer;
        dom.transcriptPreview.textContent = existingAnswer.answer;
        finalTranscript = existingAnswer.answer + " ";
    } else {
        dom.answerText.value = "";
        dom.transcriptPreview.textContent = "Your speech will appear here...";
        finalTranscript = "";
    }
}

function previousQuestion() {
    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        loadQuestion();
    }
}

async function submitAnswer() {
    if (state.isRecording && recognition) {
        state.isRecording = false;
        recognition.stop();
    }

    const answer = dom.answerText.value.trim();
    if (answer.length < 2) return alert("Please provide a meaningful answer.");

    dom.submitBtn.disabled = true;
    dom.prevBtn.disabled = true;
    dom.loadingIndicator.classList.remove('hidden');

    const currentQ = state.questions[state.currentQuestionIndex];

    try {
        // Always send text analysis
        const feedback = await apiCall('/analyze', {
            question: currentQ,
            answer: answer
        });

        // Find if we're updating an existing answer or adding a new one
        const existingIndex = state.answers.findIndex(a => a.question === currentQ);
        const answerEntry = { question: currentQ, answer: answer, feedback };

        if (existingIndex > -1) {
            state.answers[existingIndex] = answerEntry;
        } else {
            state.answers.push(answerEntry);
        }

        // Reset for next question
        finalTranscript = "";
        dom.transcriptPreview.textContent = "";

        state.currentQuestionIndex++;

        if (state.currentQuestionIndex < state.totalQuestions) {
            loadQuestion();
        } else {
            showResults();
        }
    } catch (error) {
        alert(`Analysis failed: ${error.message}`);
    } finally {
        dom.submitBtn.disabled = false;
        dom.prevBtn.disabled = state.currentQuestionIndex === 0;
        dom.loadingIndicator.classList.add('hidden');
    }
}

function showResults() {
    dom.interviewSection.classList.add('hidden');
    dom.resultSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const feedbackList = document.getElementById('feedback-list');
    const finalScoreDisplay = document.getElementById('final-score');

    let totalScore = 0;
    feedbackList.innerHTML = state.answers.map((item, index) => {
        const score = item.feedback.rating || 0;
        totalScore += score;
        return `
            <div class="feedback-item">
                <div class="feedback-header">
                    <strong>Q${index + 1}: ${item.question}</strong>
                    <span class="rating-badge">${score}/10</span>
                </div>
                <p class="user-answer"><em>"${item.answer}"</em></p>
                <div class="feedback-content">
                    <p><strong>Feedback:</strong> ${item.feedback.feedback}</p>
                    <p><strong>Improvement:</strong> ${item.feedback.improvement}</p>
                    <p><strong>Verdict:</strong> <span class="verdict">${item.feedback.correctness}</span></p>
                </div>
            </div>`;
    }).join('');

    const avgScore = (totalScore / state.totalQuestions).toFixed(1);
    finalScoreDisplay.innerHTML = `<div class="score-card"><h3>Final Score: <span style="color:var(--success)">${avgScore}/10</span></h3></div>`;
}

function startNewSession() {
    // Reset state
    state.currentQuestionIndex = 0;
    state.questions = [];
    state.answers = [];
    state.isRecording = false;

    // Stop any media streams (optional, but good practice if switching roles)
    // state.audioStream.getTracks().forEach(track => track.stop());
    // state.audioStream = null; // We can keep it to avoid re-asking permission

    // Reset UI
    dom.resultSection.classList.add('hidden');
    dom.interviewSection.classList.add('hidden');
    dom.configSection.classList.remove('hidden');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
