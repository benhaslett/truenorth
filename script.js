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
const GOAL_MATCHES = 120;
const HARD_CHOICE_THRESHOLD = 10000; // 10 seconds
const APP_VERSION = "0.6.1";
const BUILD_TIME = new Date().toLocaleTimeString();

// State
let values = []; 
let currentPair = [null, null];
let history = []; 
let conflicts = [];
let startTime = 0;
let isTieBreaker = false;

// Encouragement Messages
const ENCOURAGEMENTS = [
  { pct: 0, text: "Let's find out what drives you." },
  { pct: 10, text: "Trust your gut instinct." },
  { pct: 25, text: "Hard choices reveal true priorities." },
  { pct: 50, text: "Building a map of your soul..." },
  { pct: 80, text: "Core values identified. Refining details..." },
  { pct: 90, text: "High precision mode." },
  { pct: 95, text: "Excellent confidence. Stopping is allowed!" },
  { pct: 99, text: "Pure perfectionism now." }
];

// Init
function init() {
  const stored = localStorage.getItem('values_app_state');
  if (stored) {
    const data = JSON.parse(stored);
    values = data.values;
    history = data.history || [];
    conflicts = data.conflicts || [];
    
    values.forEach(v => {
      if (!v.playedAgainst) v.playedAgainst = [];
    });
  } else {
    values = INITIAL_VALUES.map(v => ({ name: v, score: 0, matches: 0, playedAgainst: [] }));
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
  
  if (total < 120) {
    pct = (total / 120) * 80;
  } else if (total < 300) {
    pct = 80 + ((total - 120) / 180) * 15;
  } else {
    pct = 95 + (1 - Math.exp(-(total - 300) / 500)) * 4;
  }
  
  pct = Math.floor(pct);
  
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  
  const label = document.getElementById('progress-pct');
  if (label) label.textContent = pct;
  
  const encDiv = document.getElementById('encouragement');
  if (encDiv) {
    const msg = ENCOURAGEMENTS.slice().reverse().find(m => pct >= m.pct);
    if (msg) {
      if (pct >= 95) {
        encDiv.innerHTML = `${msg.text} <span style='font-size:0.8em; color:#7f8c8d'>(100% requires ~1,300 matches)</span>`;
      } else {
        encDiv.textContent = msg.text;
      }
    }
  }
}

// Logic: Pick a pair
function nextMatch() {
  // Reset Flag
  isTieBreaker = false;

  const isLateGame = history.length > (GOAL_MATCHES * 0.5);
  
  // AGGRESSIVE TIE BREAKER (Late Game Only)
  if (isLateGame) {
    // Get the Top 10 (sorted by score)
    const leaders = [...values]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    // Find ties
    if (leaders.length > 1) {
      for (let i = 0; i < leaders.length; i++) {
        for (let j = i + 1; j < leaders.length; j++) {
          const a = leaders[i];
          const b = leaders[j];
          
          const neverPlayed = !a.playedAgainst.includes(b.name);
          const isTied = (a.score === b.score);
          
          if (neverPlayed || isTied) {
            currentPair = [a, b];
            isTieBreaker = !neverPlayed;
            checkTransitiveAndRender(a, b);
            return;
          }
        }
      }
    }
  }

  // Standard Swiss Logic (Fallthrough)
  const candidates = [...values].sort((a, b) => {
    if (isLateGame) {
      if (Math.abs(a.matches - b.matches) > 2) return a.matches - b.matches;
      return b.score - a.score; 
    }
    if (a.matches === b.matches) return 0.5 - Math.random();
    return a.matches - b.matches;
  });

  let p1 = candidates[0];
  let p2 = null;
  
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (!p1.playedAgainst.includes(c.name)) {
      p2 = c;
      break;
    }
  }
  
  if (!p2) p2 = candidates[1];

  if (currentPair[0] && ( 
    (currentPair[0].name === p1.name && currentPair[1].name === p2.name) ||
    (currentPair[0].name === p2.name && currentPair[1].name === p1.name)
  )) {
    p2 = candidates[2] || candidates[1];
  }

  currentPair = [p1, p2];
  checkTransitiveAndRender(p1, p2);
}

function checkTransitiveAndRender(p1, p2) {
  // Transitive Logic Check
  const p1BeatsP2 = canBeat(p1.name, p2.name);
  const p2BeatsP1 = canBeat(p2.name, p1.name);

  // If both are true, it's a cycle; let user decide.
  // If one is true, auto-resolve.
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
  // BFS to find path
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
    // Disable clicks
    c1.onclick = null;
    c2.onclick = null;
    
    // Highlight winner immediately
    const winnerCard = autoWinnerIndex === 0 ? c1 : c2;
    winnerCard.style.border = "3px solid #9b59b6"; // Purple for logic
    
    // Auto-advance after delay
    setTimeout(() => {
        handleChoice(autoWinnerIndex, true); // true = isAuto
    }, 1000);
  }
}

function handleChoice(winnerIndex, isAuto = false) {
  const duration = Date.now() - startTime;
  const winner = currentPair[winnerIndex];
  const loser = currentPair[winnerIndex === 0 ? 1 : 0];

  // CONFIDENCE WEIGHTING
  let pointsAwarded = 1;
  let isConfident = false;
  
  if (!isAuto && duration < 3000) { // Under 3 seconds = Confident (was 2000)
      pointsAwarded = 2;
      isConfident = true;
  }
  // Hard choices (>10s) still get 1 point, but are logged as conflicts

  winner.score += pointsAwarded;
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
      // Visual feedback for confidence
      const badge = document.createElement('div');
      badge.innerHTML = "⚡ CONFIDENT (+2)";
      badge.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:#f1c40f; color:black; padding:8px 16px; border-radius:20px; font-weight:bold; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index:10;";
      card.style.position = 'relative';
      card.appendChild(badge);
  }

  setTimeout(() => {
    renderResults();
    nextMatch();
  }, isAuto ? 200 : 150); // Slightly slower for auto to let user see
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

  const ranked = [...values].sort((a, b) => b.score - a.score);
  
  const top3Div = document.getElementById('top3');
  top3Div.innerHTML = '';
  
  const fullListDiv = document.getElementById('full-list');
  fullListDiv.innerHTML = '';

  ranked.slice(0, 3).forEach((v, i) => {
    const el = document.createElement('div');
    el.className = 'top-value';
    el.innerHTML = `<span>#${i+1} ${v.name}</span> <span>${v.score} pts</span>`;
    top3Div.appendChild(el);
  });

  const listItems = ranked.slice(3);
  const totalItems = listItems.length;

  listItems.forEach((v, i) => {
    const el = document.createElement('div');
    const isBottom3 = i >= totalItems - 3;
    el.className = isBottom3 ? 'bottom-value' : 'list-item';
    el.innerHTML = `<span>#${i+4} ${v.name}</span> <span>${v.score} pts</span>`;
    fullListDiv.appendChild(el);
  });
}

function save() {
  localStorage.setItem('values_app_state', JSON.stringify({ values, history, conflicts }));
}

function reset() {
  if(confirm("Start over completely?")) {
    localStorage.removeItem('values_app_state');
    location.reload();
  }
}

// Global Handlers
document.getElementById('choice1').onclick = () => handleChoice(0);
document.getElementById('choice2').onclick = () => handleChoice(1);

// Start
init();
