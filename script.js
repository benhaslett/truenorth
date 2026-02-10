// The Values List (from Excel)
const INITIAL_VALUES = [
  "Adventure", "Authenticity", "Balance", "Community", "Compassion", 
  "Competence", "Contribution", "Creativity", "Curiosity", "Determination", 
  "Fairness", "Faith", "Fame", "Family", "Freedom", "Friendship", "Fun", 
  "Growth", "Happiness", "Health", "Honesty", "Humor", "Influence", 
  "Inner Harmony", "Justice", "Kindness", "Knowledge", "Leadership", 
  "Learning", "Love", "Loyalty", "Meaningful Work", "Openness", "Optimism", 
  "Peace", "Pleasure", "Poise", "Popularity", "Recognition", "Religion", 
  "Reputation", "Respect", "Responsibility", "Security", "Self-Respect", 
  "Service", "Spirituality", "Stability", "Success", "Status", 
  "Trustworthiness", "Wealth", "Wisdom"
];

// Constants
const HARD_CHOICE_THRESHOLD = 10000; // 10 seconds
const APP_VERSION = "0.7.1"; // Social Share update
const BUILD_TIME = new Date().toLocaleTimeString();

// Glicko-Lite Config
const GLICKO = {
  DEFAULT_RATING: 1500,
  DEFAULT_RD: 350,
  MIN_RD: 50,
  RD_DECAY: 0.95,
  K_BASE: 40,
  CONFIDENT_MULTIPLIER: 1.5,
  INFERRED_MULTIPLIER: 0.5
};

// State
let values = []; 
let currentPair = [null, null];
let history = []; 
let conflicts = [];
let startTime = 0;
let isTieBreaker = false;

// Encouragement Messages (updated for Glicko convergence)
const ENCOURAGEMENTS = [
  { matches: 0, text: "Let's find out what drives you." },
  { matches: 20, text: "Trust your gut instinct." },
  { matches: 50, text: "Patterns emerging..." },
  { matches: 100, text: "Good sense of your values forming." },
  { matches: 150, text: "✓ Solid foundation. Top values becoming clear." },
  { matches: 200, text: "High confidence territory." },
  { matches: 300, text: "Excellent precision. Fine-tuning the order." },
  { matches: 500, text: "Near-perfect accuracy achieved!" }
];

// Init
function init() {
  const stored = localStorage.getItem('values_app_state');
  if (stored) {
    const data = JSON.parse(stored);
    values = data.values;
    history = data.history || [];
    conflicts = data.conflicts || [];
    
    // Migration: Add Glicko fields if missing
    values.forEach(v => {
      if (!v.playedAgainst) v.playedAgainst = [];
      if (v.rating === undefined) v.rating = GLICKO.DEFAULT_RATING;
      if (v.rd === undefined) v.rd = GLICKO.DEFAULT_RD;
    });
  } else {
    values = INITIAL_VALUES.map(v => ({ 
      name: v, 
      score: 0, // Keep for backwards compat display
      matches: 0, 
      playedAgainst: [],
      rating: GLICKO.DEFAULT_RATING,
      rd: GLICKO.DEFAULT_RD
    }));
  }
  
  updateProgress();
  
  if (history.length > 0) {
    renderResults();
  }
  if (conflicts.length > 0) {
    renderConflicts();
  }
  
  renderFooter();
  nextMatch();
}

function renderFooter() {
  if (!document.getElementById('footer-info')) {
    const footer = document.createElement('div');
    footer.id = 'footer-info';
    footer.style.marginTop = '2rem';
    footer.innerHTML = `
      <button onclick="reset()" style="background:#bdc3c7; padding:8px 16px; border:none; color:white; border-radius:4px; font-size:0.8rem; cursor:pointer;">Reset Progress</button>
      <div style="margin-top:10px; color:#bdc3c7; font-size:0.7rem;">v${APP_VERSION} (Built: ${BUILD_TIME})</div>
    `;
    document.querySelector('.container').appendChild(footer);
  }
}

function updateProgress() {
  const total = history.length;
  let pct = 0;
  
  // New progress curve based on Glicko convergence research
  if (total < 150) {
    pct = (total / 150) * 60; // 0-60% for first 150 matches
  } else if (total < 300) {
    pct = 60 + ((total - 150) / 150) * 25; // 60-85% for 150-300
  } else if (total < 500) {
    pct = 85 + ((total - 300) / 200) * 12; // 85-97% for 300-500
  } else {
    pct = 97 + (1 - Math.exp(-(total - 500) / 500)) * 3; // Asymptotic to 100%
  }
  
  pct = Math.floor(pct);
  
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  
  const label = document.getElementById('progress-pct');
  if (label) label.textContent = pct;
  
  const encDiv = document.getElementById('encouragement');
  if (encDiv) {
    const msg = ENCOURAGEMENTS.slice().reverse().find(m => total >= m.matches);
    if (msg) {
      encDiv.textContent = msg.text;
    }
  }

  // Check for Share Unlock (80%+)
  const shareContainer = document.getElementById('share-container');
  if (shareContainer) {
    if (pct >= 80) {
      shareContainer.style.display = 'block';
    } else {
      shareContainer.style.display = 'none';
    }
  }
}

// --- GLICKO-LITE RATING SYSTEM ---

function calculateGlickoWin(winner, loser, isConfident, isInferred) {
  let K = GLICKO.K_BASE;
  if (isConfident) K *= GLICKO.CONFIDENT_MULTIPLIER;
  if (isInferred) K *= GLICKO.INFERRED_MULTIPLIER;
  
  // Scale K by uncertainty (high RD = bigger swings)
  const volatilityMultiplier = (winner.rd + loser.rd) / 700;
  const finalK = K * volatilityMultiplier;
  
  // Expected win probability (Elo formula)
  const expected = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
  
  // Apply delta
  const delta = finalK * (1 - expected);
  winner.rating += delta;
  loser.rating -= delta;
  
  // Tighten uncertainty
  winner.rd = Math.max(GLICKO.MIN_RD, winner.rd * GLICKO.RD_DECAY);
  loser.rd = Math.max(GLICKO.MIN_RD, loser.rd * GLICKO.RD_DECAY);
}

// --- MATCHMAKING ---

function nextMatch() {
  isTieBreaker = false;
  
  const totalMatches = history.length;
  const isDiscovery = totalMatches < 20; // First 20 = discovery phase
  
  // Build list of unplayed pairs
  const unplayed = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (!values[i].playedAgainst.includes(values[j].name)) {
        unplayed.push([values[i], values[j]]);
      }
    }
  }
  
  let p1, p2;
  
  if (unplayed.length > 0) {
    if (isDiscovery) {
      // Phase 1: Pick highest uncertainty pairs (crash the RD fast)
      unplayed.sort((a, b) => {
        const rdA = a[0].rd + a[1].rd;
        const rdB = b[0].rd + b[1].rd;
        return rdB - rdA;
      });
    } else {
      // Phase 2: Pick closest rating pairs (tournament mode)
      unplayed.sort((a, b) => {
        const diffA = Math.abs(a[0].rating - a[1].rating);
        const diffB = Math.abs(b[0].rating - b[1].rating);
        return diffA - diffB;
      });
    }
    [p1, p2] = unplayed[0];
  } else {
    // All pairs played - pick closest ratings for rematches
    const sorted = [...values].sort((a, b) => b.rating - a.rating);
    p1 = sorted[0];
    p2 = sorted[1];
    isTieBreaker = true;
  }
  
  // Avoid showing same pair twice in a row
  if (currentPair[0] && currentPair[1] && 
      ((currentPair[0].name === p1.name && currentPair[1].name === p2.name) ||
       (currentPair[0].name === p2.name && currentPair[1].name === p1.name))) {
    if (unplayed.length > 1) {
      [p1, p2] = unplayed[1];
    }
  }
  
  currentPair = [p1, p2];
  checkTransitiveAndRender(p1, p2);
}

function checkTransitiveAndRender(p1, p2) {
  // Transitive Logic Check
  const p1BeatsP2 = canBeat(p1.name, p2.name);
  const p2BeatsP1 = canBeat(p2.name, p1.name);

  let autoWinnerIndex = null;
  let reason = null;

  if (p1BeatsP2 && !p2BeatsP1) {
    autoWinnerIndex = 0;
    reason = `Logic: ${p1.name} > ... > ${p2.name}`;
  } else if (p2BeatsP1 && !p1BeatsP2) {
    autoWinnerIndex = 1;
    reason = `Logic: ${p2.name} > ... > ${p1.name}`;
  }

  renderPair(p1, p2, autoWinnerIndex, reason);
}

function canBeat(winnerName, loserName) {
  const graph = {};
  history.forEach(h => {
    if (!graph[h.winner]) graph[h.winner] = [];
    graph[h.winner].push(h.loser);
  });

  const queue = [winnerName];
  const visited = new Set();
  
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === loserName) return true;
    
    if (visited.has(curr)) continue;
    visited.add(curr);

    if (graph[curr]) {
      for (const neighbor of graph[curr]) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
  }
  return false;
}

function renderPair(v1, v2, autoWinnerIndex = null, autoReason = null) {
  startTime = Date.now(); 
  
  const container = document.getElementById('vs-container');
  const oldBadge = document.getElementById('tie-badge');
  if (oldBadge) oldBadge.remove();
  
  if (isTieBreaker) {
    const badge = document.createElement('div');
    badge.id = 'tie-badge';
    badge.innerHTML = "⚔️ TIE BREAKER";
    badge.style.cssText = "position:absolute; top:-30px; left:50%; transform:translateX(-50%); background:#e67e22; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;";
    container.style.position = 'relative';
    container.appendChild(badge);
  } else if (autoReason) {
    const badge = document.createElement('div');
    badge.id = 'tie-badge';
    badge.innerHTML = `🤖 ${autoReason}`;
    badge.style.cssText = "position:absolute; top:-30px; left:50%; transform:translateX(-50%); background:#9b59b6; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; white-space:nowrap;";
    container.style.position = 'relative';
    container.appendChild(badge);
  }
  
  const c1 = document.getElementById('value1');
  const c2 = document.getElementById('value2');
  
  c1.textContent = v1.name;
  c2.textContent = v2.name;
  
  c1.className = 'value-card';
  c2.className = 'value-card';

  c1.onclick = () => handleChoice(0);
  c2.onclick = () => handleChoice(1);

  if (autoWinnerIndex !== null) {
    c1.onclick = null;
    c2.onclick = null;
    
    const winnerCard = autoWinnerIndex === 0 ? c1 : c2;
    winnerCard.style.border = "3px solid #9b59b6";
    
    setTimeout(() => {
      handleChoice(autoWinnerIndex, true);
    }, 1000);
  }
}

function handleChoice(winnerIndex, isAuto = false) {
  const duration = Date.now() - startTime;
  const winner = currentPair[winnerIndex];
  const loser = currentPair[winnerIndex === 0 ? 1 : 0];

  // Confidence detection
  const isConfident = !isAuto && duration < 3000;
  
  // Apply Glicko-Lite rating update
  calculateGlickoWin(winner, loser, isConfident, isAuto);
  
  // Legacy score update (for display compatibility)
  winner.score += isConfident ? 2 : 1;
  winner.matches += 1;
  loser.matches += 1;
  
  if (!winner.playedAgainst) winner.playedAgainst = [];
  if (!loser.playedAgainst) loser.playedAgainst = [];
  winner.playedAgainst.push(loser.name);
  loser.playedAgainst.push(winner.name);

  history.push({ 
    winner: winner.name, 
    loser: loser.name, 
    timestamp: Date.now(),
    duration: isAuto ? 0 : duration,
    auto: isAuto
  });
  
  if (!isAuto && duration > HARD_CHOICE_THRESHOLD) {
    conflicts.push({
      pair: [winner.name, loser.name],
      winner: winner.name,
      duration: duration
    });
    renderConflicts();
  }
  
  save();
  updateProgress();
  
  const card = winnerIndex === 0 ? document.getElementById('value1') : document.getElementById('value2');
  card.classList.add('selected');

  if (isConfident) {
    const badge = document.createElement('div');
    badge.innerHTML = "⚡ CONFIDENT";
    badge.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:#f1c40f; color:black; padding:8px 16px; border-radius:20px; font-weight:bold; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index:10;";
    card.style.position = 'relative';
    card.appendChild(badge);
  }

  setTimeout(() => {
    renderResults();
    nextMatch();
  }, isAuto ? 200 : 150);
}

function renderConflicts() {
  const sidebar = document.getElementById('sidebar');
  const list = document.getElementById('conflicts-list');
  
  if (conflicts.length > 0) {
    sidebar.style.display = 'block';
    list.innerHTML = '';
    
    conflicts.slice().reverse().forEach(c => {
      const el = document.createElement('div');
      el.className = 'conflict-item';
      const seconds = (c.duration / 1000).toFixed(1);
      el.innerHTML = `
        <strong>${c.pair[0]} vs ${c.pair[1]}</strong><br>
        <span style="font-size:0.8em">Thinking time: ${seconds}s</span><br>
        <span style="color:#2ecc71">Chose: ${c.winner}</span>
      `;
      list.appendChild(el);
    });
  }
}

function renderResults() {
  const resultsDiv = document.getElementById('results');
  resultsDiv.style.display = 'block';

  // Sort by RATING (Glicko)
  const ranked = [...values].sort((a, b) => b.rating - a.rating);
  
  const top3Div = document.getElementById('top3');
  top3Div.innerHTML = '';
  
  const fullListDiv = document.getElementById('full-list');
  fullListDiv.innerHTML = '';

  // Render Top 3
  ranked.slice(0, 3).forEach((v, i) => {
    const el = document.createElement('div');
    el.className = 'top-value';
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span>#${i+1} ${v.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn-boost" onclick="handleBoost('${v.name}')" title="Boost Ranking">▲</button>
        <span style="min-width:40px; text-align:right;">${Math.round(v.rating)}</span>
      </div>
    `;
    top3Div.appendChild(el);
  });
  
  // Inject Share Container if missing
  let shareContainer = document.getElementById('share-container');
  if (!shareContainer) {
    shareContainer = document.createElement('div');
    shareContainer.id = 'share-container';
    shareContainer.style.display = 'none'; // Controlled by progress pct
    shareContainer.style.marginTop = '1.5rem';
    shareContainer.style.padding = '1rem';
    shareContainer.style.background = '#eef2f3';
    shareContainer.style.borderRadius = '8px';
    
    shareContainer.innerHTML = `
      <h3 style="margin-top:0; color:#2c3e50;">Share Your Core Values 🧭</h3>
      <p style="font-size:0.9rem; color:#7f8c8d;">You've reached >80% confidence!</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
        <button onclick="shareTwitter()" class="btn" style="background:#1DA1F2; margin:0; padding:8px 16px;">Twitter</button>
        <button onclick="shareLinkedIn()" class="btn" style="background:#0077b5; margin:0; padding:8px 16px;">LinkedIn</button>
        <button onclick="copyResults()" class="btn" style="background:#2ecc71; margin:0; padding:8px 16px;">📋 Copy</button>
      </div>
    `;
    
    // Insert before 'Show Full Ranking'
    const showFullBtn = document.getElementById('btn-show-full');
    showFullBtn.parentNode.insertBefore(shareContainer, showFullBtn);
  }
  
  // Clean up old dynamic button if exists (migration)
  const oldBtn = document.getElementById('btn-share');
  if (oldBtn) oldBtn.remove();

  // Render Full List
  const listItems = ranked.slice(3);
  const totalItems = listItems.length;

  listItems.forEach((v, i) => {
    const el = document.createElement('div');
    const isBottom3 = i >= totalItems - 3;
    el.className = isBottom3 ? 'bottom-value' : 'list-item';
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span>#${i+4} ${v.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn-boost" onclick="handleBoost('${v.name}')" title="Boost Ranking">▲</button>
        <span style="min-width:40px; text-align:right;">${Math.round(v.rating)}</span>
      </div>
    `;
    fullListDiv.appendChild(el);
  });
}

function handleBoost(name) {
  const v = values.find(val => val.name === name);
  if (v) {
    v.rating += 15; // +15 points boost
    save();
    renderResults();
  }
}

function save() {
  localStorage.setItem('values_app_state', JSON.stringify({ values, history, conflicts }));
}

// Share Functions
const APP_URL = "https://truenorthvalues.com";

function getTop3Text() {
  // Safe accessor if values are not ready
  if(!values || values.length < 3) return "";
  
  const ranked = [...values].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const list = ranked.map((v, i) => `${i + 1}. ${v.name}`).join('\n');
  return `My Core Values 🧭:\n${list}\n\nDiscover yours: ${APP_URL}`;
}

function shareTwitter() {
  const text = encodeURIComponent(getTop3Text());
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}

function shareLinkedIn() {
  // LinkedIn doesn't pre-fill text easily, so we prompt copy first or just link share
  // Best practice: Let user write their own post, but give them the URL.
  // Or use a simplistic share URL.
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(APP_URL)}`, '_blank');
  alert("LinkedIn doesn't allow pre-filled text. We've copied your results to clipboard so you can paste them!");
  copyResults(false); // Silent copy
}

function copyResults(alertUser = true) {
  const text = getTop3Text();
  navigator.clipboard.writeText(text).then(() => {
    if (alertUser) alert("Copied Top 3 to clipboard!");
  }).catch(err => {
    console.error('Failed to copy: ', err);
    if(alertUser) alert("Could not copy. Text:\n" + text);
  });
}

function reset() {
  if(confirm("Start over completely?")) {
    localStorage.removeItem('values_app_state');
    localStorage.removeItem('values_app_welcome_seen');
    location.reload();
  }
}

// Global Handlers
document.getElementById('choice1').onclick = () => handleChoice(0);
document.getElementById('choice2').onclick = () => handleChoice(1);
document.getElementById('welcome-start').onclick = () => {
    document.getElementById('welcome-modal').style.display = 'none';
    localStorage.setItem('values_app_welcome_seen', 'true');
};

// Start
init();

// Check Welcome Screen
if (!localStorage.getItem('values_app_welcome_seen')) {
    document.getElementById('welcome-modal').style.display = 'flex';
} else {
    document.getElementById('welcome-modal').style.display = 'none';
}
