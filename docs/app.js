/**
 * Arduino Claw Landing Page Client Scripts
 * Provides OS autodetection, live GitHub release link routing, and smooth interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  detectUserOS();
  fetchGitHubReleaseStats();
});

/**
 * Detects visitor Operating System to recommend the appropriate package
 */
function detectUserOS() {
  const ua = window.navigator.userAgent.toLowerCase();
  const heroBtn = document.getElementById('hero-download-btn');
  const osNameEl = document.getElementById('user-os-name');
  const osSubEl = document.getElementById('user-os-sub');
  
  let targetOS = 'mac'; // Default fallback
  let downloadUrl = 'https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw-1.0.0-arm64.dmg';
  let osLabel = 'macOS';
  let osSub = 'Apple Silicon & Intel • v1.0.0 DMG';

  if (ua.includes('win')) {
    targetOS = 'win';
    downloadUrl = 'https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw.Setup.1.0.0.exe';
    osLabel = 'Windows';
    osSub = 'Windows 10 / 11 (x64) • Setup EXE';
  } else if (ua.includes('linux')) {
    targetOS = 'linux';
    downloadUrl = 'https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw-1.0.0.AppImage';
    osLabel = 'Linux';
    osSub = 'Ubuntu, Debian, Fedora • AppImage';
  } else if (ua.includes('mac') || ua.includes('darwin')) {
    targetOS = 'mac';
    downloadUrl = 'https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw-1.0.0-arm64.dmg';
    osLabel = 'macOS';
    osSub = 'Apple Silicon (M1–M4) • 187.6 MB DMG';
  }

  // Update hero button
  if (heroBtn && osNameEl && osSubEl) {
    osNameEl.textContent = osLabel;
    osSubEl.textContent = osSub;
    heroBtn.href = downloadUrl;
  }

  // Highlight corresponding download card
  const cardMap = {
    'mac': document.getElementById('card-mac'),
    'win': document.getElementById('card-win'),
    'linux': document.getElementById('card-linux')
  };

  if (cardMap[targetOS]) {
    cardMap[targetOS].classList.add('card-recommended');
  }
}

/**
 * Fetch repository stargazers count only if > 100
 */
async function fetchGitHubReleaseStats() {
  const starsEl = document.getElementById('stars-count');
  if (!starsEl) return;

  try {
    const res = await fetch('https://api.github.com/repos/Captain-Labs/arduino-claw', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.stargazers_count !== undefined && data.stargazers_count > 100) {
        starsEl.textContent = `⭐ ${data.stargazers_count}`;
        starsEl.style.display = 'inline-block';
      } else {
        starsEl.style.display = 'none';
      }
    }
  } catch (err) {
    starsEl.style.display = 'none';
  }
}
