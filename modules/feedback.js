// modules/feedback.js — Rating Widget, Problem Input, Attempt History

const attempts = [];
let feedbackBar = null;
let currentAttemptIndex = -1;
let onRetryCallback = null;

export function initFeedback(container, onRetry) {
  feedbackBar = container;
  onRetryCallback = onRetry;
}

export function addAttempt(attempt) {
  attempt.attemptNumber = attempts.length + 1;
  attempt.rating = null;
  attempt.problem = null;
  attempts.push(attempt);
  currentAttemptIndex = attempts.length - 1;
}

export function setSerialOutput(output) {
  if (currentAttemptIndex >= 0 && currentAttemptIndex < attempts.length) {
    attempts[currentAttemptIndex].serialOutput = output;
  }
}

export function setCompileError(errorText) {
  if (currentAttemptIndex >= 0 && currentAttemptIndex < attempts.length) {
    attempts[currentAttemptIndex].compileError = errorText;
  }
}

export function setRating(index, rating) {
  if (index >= 0 && index < attempts.length) {
    attempts[index].rating = rating;
  }
}

export function setProblem(index, problem) {
  if (index >= 0 && index < attempts.length) {
    attempts[index].problem = problem;
  }
}

export function getHistory() {
  return [...attempts];
}

export function getCurrentCommand() {
  if (attempts.length === 0) return '';
  return attempts[0].command || '';
}

export function clearHistory() {
  attempts.length = 0;
  currentAttemptIndex = -1;
  hideFeedbackBar();
}

export function buildHistoryContext() {
  if (attempts.length === 0) return '';
  const lines = ['PREVIOUS ATTEMPT HISTORY (most recent last):', '---'];
  attempts.forEach(a => {
    lines.push(`[Attempt ${a.attemptNumber}]`);
    lines.push(`Rating: ${a.rating !== null ? a.rating + '/5' : 'Not rated'}`);
    lines.push(`User problem report: "${a.problem ?? 'No description given'}"`);
    lines.push('Serial Monitor output:\n"""\n' + (a.serialOutput ?? 'No serial output captured') + '\n"""');
    lines.push('Code that was used:\n```cpp\n' + (a.code ?? '') + '\n```\n---');
  });
  return lines.join('\n');
}

export function showFeedbackBar() {
  if (!feedbackBar) return;
  feedbackBar.innerHTML = '';
  feedbackBar.classList.add('visible');

  const inner = document.createElement('div');
  inner.className = 'feedback-inner';

  const label = document.createElement('span');
  label.className = 'feedback-label';
  label.textContent = 'Did it work?';
  inner.appendChild(label);

  const starsDiv = document.createElement('div');
  starsDiv.className = 'feedback-stars';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.className = 'feedback-star';
    star.dataset.rating = i;
    star.innerHTML = '★';
    star.title = `${i} star${i > 1 ? 's' : ''}`;
    star.addEventListener('click', () => onStarClick(i, starsDiv, inner));
    starsDiv.appendChild(star);
  }
  inner.appendChild(starsDiv);

  const probGroup = document.createElement('div');
  probGroup.className = 'feedback-problem-group hidden';
  probGroup.id = 'fb-prob-group';
  const probInput = document.createElement('input');
  probInput.type = 'text';
  probInput.className = 'feedback-problem-input';
  probInput.id = 'fb-prob-input';
  probInput.placeholder = 'What went wrong?';
  probGroup.appendChild(probInput);
  inner.appendChild(probGroup);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'feedback-retry-btn hidden';
  retryBtn.id = 'fb-retry-btn';
  retryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Retry with AI fix';
  retryBtn.addEventListener('click', handleRetry);
  inner.appendChild(retryBtn);

  const successMsg = document.createElement('div');
  successMsg.className = 'feedback-success hidden';
  successMsg.id = 'fb-success';
  successMsg.textContent = '✓ Great! Saved as known-good pattern.';
  inner.appendChild(successMsg);

  feedbackBar.appendChild(inner);
}

export function hideFeedbackBar() {
  if (feedbackBar) feedbackBar.classList.remove('visible');
}

function onStarClick(rating, starsDiv, inner) {
  starsDiv.querySelectorAll('.feedback-star').forEach((s, idx) => {
    s.classList.toggle('active', idx < rating);
  });
  setRating(currentAttemptIndex, rating);

  const probGroup = document.getElementById('fb-prob-group');
  const retryBtn = document.getElementById('fb-retry-btn');
  const successMsg = document.getElementById('fb-success');

  if (rating <= 3) {
    probGroup?.classList.remove('hidden');
    retryBtn?.classList.remove('hidden');
    successMsg?.classList.add('hidden');
  } else {
    probGroup?.classList.add('hidden');
    retryBtn?.classList.add('hidden');
    successMsg?.classList.remove('hidden');
    saveKnownGood();
  }
}

function handleRetry() {
  const input = document.getElementById('fb-prob-input');
  if (input?.value.trim()) setProblem(currentAttemptIndex, input.value.trim());
  hideFeedbackBar();
  if (onRetryCallback) onRetryCallback();
}

function saveKnownGood() {
  if (currentAttemptIndex < 0) return;
  const a = attempts[currentAttemptIndex];
  if (!a) return;
  try {
    const stored = JSON.parse(localStorage.getItem('arduino-claw:known-good') || '[]');
    stored.push({ command: a.command, code: a.code, savedAt: new Date().toISOString() });
    localStorage.setItem('arduino-claw:known-good', JSON.stringify(stored));
  } catch (_) {}
}
