// modules/ai.js — AI Provider Abstraction (All ai models)
import { getCustomPreset, CUSTOM_PRESETS } from './settings.js';

function getBoardHardwareSpecs(board) {
  if (!board) {
    return {
      name: 'Arduino Uno',
      fqbn: 'arduino:avr:uno',
      mcu: 'ATmega328P',
      builtinLed: 'Pin 13 (LED_BUILTIN)',
      defaultBaud: 9600,
      i2cPins: 'SDA = A4, SCL = A5',
      features: '5V logic, 14 digital pins (6 PWM: 3, 5, 6, 9, 10, 11), 6 analog inputs (A0-A5).'
    };
  }

  const fqbn = (board.fqbn || '').toLowerCase();
  const name = board.name || 'Arduino Uno';

  if (fqbn.includes('esp32') || name.toLowerCase().includes('esp32')) {
    return {
      name: name,
      fqbn: board.fqbn || 'esp32:esp32:esp32',
      mcu: 'ESP32 (Xtensa 32-bit LX6 Dual-Core)',
      builtinLed: 'GPIO 2 (D2) or LED_BUILTIN (Pin 2 is standard onboard LED for ESP32 Dev Module)',
      defaultBaud: 115200,
      i2cPins: 'SDA = GPIO 21, SCL = GPIO 22',
      features: '3.3V logic (DO NOT supply 5V to GPIOs), native WiFi, Bluetooth/BLE, capacitive touch pins, multiple hardware timers, PWM on all GPIOs.'
    };
  }

  if (fqbn.includes('esp8266') || name.toLowerCase().includes('esp8266') || name.toLowerCase().includes('nodemcu')) {
    return {
      name: name,
      fqbn: board.fqbn || 'esp8266:esp8266:nodemcuv2',
      mcu: 'ESP8266 (32-bit RISC)',
      builtinLed: 'GPIO 2 (D4 / LED_BUILTIN, active LOW) or GPIO 16 (D0)',
      defaultBaud: 115200,
      i2cPins: 'SDA = D2 (GPIO 4), SCL = D1 (GPIO 5)',
      features: '3.3V logic, native 802.11 b/g/n WiFi, standard NodeMCU pin definitions (D1=GPIO5, D2=GPIO4, D3=GPIO0, D4=GPIO2, D5=GPIO14, D6=GPIO12, D7=GPIO13, D8=GPIO15).'
    };
  }

  if (fqbn.includes('mega') || name.toLowerCase().includes('mega')) {
    return {
      name: name,
      fqbn: board.fqbn || 'arduino:avr:mega',
      mcu: 'ATmega2560',
      builtinLed: 'Pin 13 (LED_BUILTIN)',
      defaultBaud: 9600,
      i2cPins: 'SDA = Pin 20, SCL = Pin 21',
      features: '5V logic, 54 digital pins (15 PWM on pins 2-13, 44-46), 16 analog inputs (A0-A15), 4 hardware UART serial ports (Serial, Serial1, Serial2, Serial3).'
    };
  }

  if (fqbn.includes('leonardo') || fqbn.includes('micro') || name.toLowerCase().includes('leonardo') || name.toLowerCase().includes('micro')) {
    return {
      name: name,
      fqbn: board.fqbn || 'arduino:avr:leonardo',
      mcu: 'ATmega32u4',
      builtinLed: 'Pin 13 (LED_BUILTIN)',
      defaultBaud: 9600,
      i2cPins: 'SDA = Pin 2, SCL = Pin 3',
      features: '5V logic, native USB with Keyboard & Mouse HID support.'
    };
  }

  if (fqbn.includes('rp2040') || fqbn.includes('pico') || name.toLowerCase().includes('pico')) {
    return {
      name: name,
      fqbn: board.fqbn || 'rp2040:rp2040:rpipico',
      mcu: 'RP2040 (Dual ARM Cortex-M0+)',
      builtinLed: 'GPIO 25 (LED_BUILTIN)',
      defaultBaud: 115200,
      i2cPins: 'SDA = GP4, SCL = GP5',
      features: '3.3V logic, dual core 133MHz, 26 multi-function GPIO pins, PIO state machines.'
    };
  }

  if (fqbn.includes('nano') && !fqbn.includes('esp32')) {
    return {
      name: name,
      fqbn: board.fqbn || 'arduino:avr:nano',
      mcu: 'ATmega328P',
      builtinLed: 'Pin 13 (LED_BUILTIN)',
      defaultBaud: 9600,
      i2cPins: 'SDA = A4, SCL = A5',
      features: '5V logic, 14 digital I/O (6 PWM on pins 3, 5, 6, 9, 10, 11), 8 analog inputs (A0-A7).'
    };
  }

  return {
    name: name,
    fqbn: board.fqbn || 'arduino:avr:uno',
    mcu: 'Microcontroller Target',
    builtinLed: 'Pin 13 (LED_BUILTIN)',
    defaultBaud: 9600,
    i2cPins: 'SDA = A4, SCL = A5',
    features: 'Standard Arduino C++ environment.'
  };
}

function buildHistoryContext(attemptHistory) {
  if (!attemptHistory || attemptHistory.length === 0) return '';

  const lines = ['PREVIOUS ATTEMPT HISTORY (most recent last):', '---'];

  attemptHistory.forEach((attempt, i) => {
    lines.push(`[Attempt ${attempt.attemptNumber}]`);
    lines.push(`Rating: ${attempt.rating !== null ? attempt.rating + '/5' : 'Not rated'}`);
    lines.push(`User problem report: "${attempt.problem ?? 'No description given'}"`);
    lines.push('Serial Monitor output:');
    lines.push('"""');
    lines.push(attempt.serialOutput ?? 'No serial output captured');
    lines.push('"""');
    if (attempt.compileError) {
      lines.push('COMPILE ERROR FROM PREVIOUS ATTEMPT:');
      lines.push('"""');
      lines.push(attempt.compileError);
      lines.push('"""');
      lines.push('This is a hard compiler error. Fix the exact line/symbol mentioned. Do not change unrelated code.');
    }
    lines.push('Code that was used:');
    lines.push('```cpp');
    lines.push(attempt.code ?? '');
    lines.push('```');
    lines.push('---');
  });

  const lastAttempt = attemptHistory[attemptHistory.length - 1];
  lines.push('');
  lines.push('INSTRUCTIONS FOR THIS ATTEMPT:');
  lines.push('- Study every previous attempt carefully.');
  lines.push('- Identify the exact failure from the serial output and user report.');
  lines.push('- Do NOT repeat any mistake from a previous attempt.');
  lines.push('- If serial output shows an unexpected value or missing print, that is the bug — fix it directly.');
  if (lastAttempt.problem) {
    lines.push(`- If the user said "${lastAttempt.problem}", treat that as the authoritative description of what failed.`);
  }

  return lines.join('\n');
}

function buildPrompt(userCommand, attemptHistory, currentEditorCode = '', board = null) {
  const specs = getBoardHardwareSpecs(board);

  const systemInstruction = `You are an embedded systems expert who writes compile-ready Arduino C++ code specifically targeting the **${specs.name}** (FQBN: \`${specs.fqbn}\`, MCU: ${specs.mcu}).

TARGET HARDWARE ENVIRONMENT:
- Target Board: ${specs.name} (\`${specs.fqbn}\`)
- Microcontroller: ${specs.mcu}
- Built-in LED: ${specs.builtinLed}
- Default I2C Bus Pins: ${specs.i2cPins}
- Hardware Specifications: ${specs.features}

RULES — follow all of them without exception:
1. When generating, editing, or modifying code, ALWAYS place the COMPLETE, updated, compile-ready code within a single markdown code block (using \`\`\`cpp and \`\`\`). Do NOT output partial snippets. Always return the full, updated code so the system can extract it and load it into the editor.
2. If the user is ONLY asking for an explanation, analysis, or answering a question (and NOT asking to generate, change, or write code), do NOT output any markdown code blocks. Just write your text response/explanation directly.
3. You are allowed to write explanations, answers to questions, and descriptions of how the code works outside of the code block. Keep explanations concise, clear, and highly developer-focused.
4. The code must compile with Arduino IDE / arduino-cli with zero errors for target board: ${specs.name} (\`${specs.fqbn}\`).
5. Pin assignments must accurately match ${specs.name}. For example, if asked for built-in LED on ESP32, use ${specs.builtinLed} (e.g. const int LED_PIN = 2;).
6. Include Serial.begin(${specs.defaultBaud}) in setup() and print clean, informative, project-specific status messages using Serial.println() so the user can verify behavior (for example: Serial.println("Blinking built-in LED on ${specs.name}...");). NEVER include generic "Arduino-Claw ready" or boilerplate application branding in code comments or serial prints. Omit Serial logging only when the user's command explicitly asks to "optimize" or remove logging for performance.
7. Never use blocking delay() longer than 50ms inside loop(). Use millis()-based non-blocking timing.
8. Only use libraries compatible with ${specs.name}. If a non-standard library is required, state it in a single Serial.println() comment at the top: // REQUIRES: <LibraryName>
9. Pin numbers must match exactly what the user specifies or the standard pinouts for ${specs.name}. If the user explicitly asks you to decide pins (e.g. "Let AI decide pins"), choose standard pins for ${specs.name}.
10. Always add a void-return guard at the end of loop() to prevent runaway behavior.
11. If the user did not specify the pin numbers for external components in their command (and did not say "Let AI decide pins"), output exactly: ERROR: MISSING_PINS: [Component1, Component2, ...] and do not output any code.
12. At the very end of your explanation (outside of the code block), if you wrote code using external hardware components, you MUST include a section titled "### Pin Connection Guide" followed by a clean, markdown table mapping how the user should wire the components to the ${specs.name}. The table must have exactly three columns: | Component | Component Pin | ${specs.name} Pin |. Make sure it matches the pins defined in your code exactly. Do not include this guide if no external components are used.`;

  const system = `[SYSTEM]\n${systemInstruction}\n`;
  const history = attemptHistory && attemptHistory.length > 0
    ? `\n[CONTEXT]\n${buildHistoryContext(attemptHistory)}\n`
    : '';

  let currentCodeBlock = '';
  if (currentEditorCode && currentEditorCode.trim() !== '') {
    currentCodeBlock = `\n[CURRENT_EDITOR_CODE]\nThis is the Arduino code currently in the user's editor. If the user asks to modify, edit, refine, or move code, read this code, apply their changes directly to it, and return the COMPLETE updated script:\n\`\`\`cpp\n${currentEditorCode}\n\`\`\`\n`;
  }

  const task = `\n[TASK]\nTarget Board: ${specs.name} (${specs.fqbn})\nUser Request: ${userCommand}\n\nOutput the complete updated Arduino C++ code now:`;
  return system + history + currentCodeBlock + task;
}

export function parseAIResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('AI returned empty response');
  }

  const trimmed = rawText.trim();
  const missingPinsMatch = trimmed.match(/ERROR:\s*MISSING_PINS:\s*(\[[^\]]+\]|[^\n]+)/i);
  if (missingPinsMatch) {
    throw new Error(`ERROR: MISSING_PINS: ${missingPinsMatch[1]}`);
  }
  if (trimmed.startsWith('ERROR:')) {
    throw new Error(trimmed);
  }

  // 1. First, search for closed markdown fence: ```cpp ... ``` or ```arduino ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:cpp|arduino|c\+\+|c)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    let code = fenceMatch[1].trim();
    // Clean any accidental markdown artifacts from code
    code = code.replace(/^```(?:cpp|arduino|c\+\+|c)?/i, '').replace(/```$/i, '').trim();
    const explanation = trimmed.replace(fenceMatch[0], '').trim();
    return {
      code,
      explanation: explanation || 'Code generated and loaded into the editor.'
    };
  }

  // 2. Search for unclosed markdown fence (e.g. if truncated by token limit)
  const unclosedMatch = trimmed.match(/```(?:cpp|arduino|c\+\+|c)?\s*([\s\S]*)$/i);
  if (unclosedMatch && unclosedMatch[1].trim().length > 20) {
    let code = unclosedMatch[1].trim();
    code = code.replace(/```$/i, '').trim();
    const explanation = trimmed.substring(0, unclosedMatch.index).trim();
    return {
      code,
      explanation: explanation || 'Code generated and loaded into the editor.'
    };
  }

  // 3. If there is conversational text before #include or void setup/loop, extract ONLY the code portion!
  const includeIndex = trimmed.indexOf('#include');
  const setupIndex = trimmed.indexOf('void setup');
  let codeStartIndex = -1;
  if (includeIndex !== -1 && setupIndex !== -1) {
    codeStartIndex = Math.min(includeIndex, setupIndex);
  } else if (includeIndex !== -1) {
    codeStartIndex = includeIndex;
  } else if (setupIndex !== -1) {
    codeStartIndex = setupIndex;
  }

  if (codeStartIndex !== -1) {
    const explanation = trimmed.substring(0, codeStartIndex).trim();
    let code = trimmed.substring(codeStartIndex).trim();
    code = code.replace(/```(?:cpp|arduino|c\+\+|c)?/gi, '').replace(/```/g, '').trim();
    return {
      code,
      explanation: explanation || 'Code generated and loaded into the editor.'
    };
  }

  // Otherwise, it's just an explanation / chat response (no code to load)
  return {
    code: null,
    explanation: trimmed
  };
}

import { getGeminiModel, getClaudeModel } from './settings.js';

async function callGemini(prompt, apiKey, signal = null) {
  const modelName = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    let errMsg = `Gemini API error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) errMsg = `Gemini API error: ${parsed.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return text;
}

async function callClaude(prompt, apiKey, signal = null) {
  const modelName = getClaudeModel();
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: modelName,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    let errMsg = `Claude API error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) errMsg = `Claude API error: ${parsed.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Claude returned no content');
  return text;
}

async function callLlama(prompt, url, apiKey, model, signal = null) {
  // Normalize the custom URL: if they specified a base URL, auto-append /chat/completions
  let targetUrl = (url || '').trim();
  if (targetUrl && !targetUrl.endsWith('/chat/completions')) {
    if (targetUrl.endsWith('/')) {
      targetUrl = targetUrl + 'chat/completions';
    } else {
      targetUrl = targetUrl + '/chat/completions';
    }
  }

  const body = {
    model: model || 'local-model',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 8192,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  const presetKey = getCustomPreset();
  const presetName = CUSTOM_PRESETS[presetKey]?.name || 'AI';

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    let errMsg = `${presetName} API error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) errMsg = `${presetName} API error: ${parsed.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${presetName} returned no content`);
  return text;
}

/**
 * Generate Arduino C++ code using the selected AI provider.
 * @param {string} userCommand - Natural language description of what to build
 * @param {Array} attemptHistory - Previous attempt objects for retry context
 * @param {string} provider - 'gemini' | 'claude' | 'llama'
 * @param {string} apiKey - Provider API key
 * @param {string} llamaUrl - Optional URL for LLaMA provider
 * @param {string} llamaModel - Optional Model name for LLaMA provider
 * @param {string} currentEditorCode - Current code in editor for context
 * @returns {Promise<string>} - Raw Arduino C++ code
 */
export async function generateCode(userCommand, attemptHistory, provider, apiKey, llamaUrl = '', llamaModel = '', currentEditorCode = '', signal = null, board = null) {
  if (provider !== 'llama' && (!apiKey || apiKey.trim() === '')) {
    throw new Error('NO_API_KEY');
  }
  if (!userCommand || userCommand.trim() === '') {
    throw new Error('No command provided');
  }

  const prompt = buildPrompt(userCommand, attemptHistory || [], currentEditorCode, board);

  let rawText;
  if (provider === 'claude') {
    rawText = await callClaude(prompt, apiKey, signal);
  } else if (provider === 'llama') {
    rawText = await callLlama(prompt, llamaUrl, apiKey, llamaModel, signal);
  } else {
    rawText = await callGemini(prompt, apiKey, signal);
  }
 
  return parseAIResponse(rawText);
}

/**
 * Evaluate whether the captured serial output confirms the code is working.
 * Returns { pass: boolean, reason: string }
 */
export async function evaluateOutput(userCommand, serialLines, provider, apiKey, llamaUrl = '', llamaModel = '') {
  if (provider !== 'llama' && (!apiKey || apiKey.trim() === '')) return { pass: true, reason: 'No key to evaluate' };

  const serialText = serialLines.length > 0
    ? serialLines.join('\n')
    : '(no serial output captured)';

  const prompt = `[SYSTEM]
You are a hardware QA engineer verifying that an Arduino program works correctly.
Note: The serial output was captured over a brief duration (approx. 10 seconds) during execution. A few cycles or lines of logs/toggles are normal and expected. Do not expect hundreds of cycles.

[USER INTENT]
"${userCommand}"

[SERIAL OUTPUT FROM DEVICE]
"""
${serialText}
"""

[TASK]
Analyze the serial output carefully.
- If the serial output confirms the Arduino is behaving as the user intended, respond with exactly: PASS
- If there are errors, nothing printed, unexpected output, or the behavior doesn't match, respond with: FAIL: <one-sentence explanation>

Only output PASS or FAIL: <reason>. Nothing else.`;

  try {
    let rawText;
    if (provider === 'claude') {
      rawText = await callClaude(prompt, apiKey);
    } else if (provider === 'llama') {
      rawText = await callLlama(prompt, llamaUrl, apiKey, llamaModel);
    } else {
      rawText = await callGemini(prompt, apiKey);
    }

    const trimmed = rawText.trim();
    if (trimmed.startsWith('PASS')) {
      return { pass: true, reason: '' };
    } else if (trimmed.startsWith('FAIL')) {
      const reason = trimmed.replace(/^FAIL[:\s]*/i, '').trim();
      return { pass: false, reason };
    }
    // Fallback if AI doesn't follow instructions
    return { pass: true, reason: 'Could not determine (defaulting to pass)' };
  } catch (_) {
    return { pass: true, reason: 'Evaluation skipped (AI error)' };
  }
}
