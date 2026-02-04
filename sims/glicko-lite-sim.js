/**
 * Glicko-Lite Simulation for Values App
 * Comparing accuracy vs current Accumulator system
 * 
 * Run: node sims/glicko-lite-sim.js
 */

const NUM_VALUES = 53; // Same as real app
const NUM_MATCHES = 120; // Goal matches
const NUM_SIMULATIONS = 500;

// Glicko-Lite Config
const RD_DECAY = 0.95;
const MIN_RD = 50;
const K_BASE = 40;
const CONFIDENT_MULTIPLIER = 1.5;
const INFERRED_MULTIPLIER = 0.5;

// Each value has a "true rank" (1 = best, 53 = worst)
// The sim will always pick the "better" value (lower true rank)
function createValues() {
    return Array.from({ length: NUM_VALUES }, (_, i) => ({
        id: i,
        trueRank: i + 1, // 1 is best
        // Glicko-Lite
        rating: 1500,
        rd: 350,
        // Old Accumulator (for comparison)
        score: 0,
        matches: 0,
        playedAgainst: new Set()
    }));
}

// --- GLICKO-LITE SYSTEM ---

function calculateWinGlicko(winner, loser, isConfident, isInferred) {
    let K = K_BASE;
    if (isConfident) K *= CONFIDENT_MULTIPLIER;
    if (isInferred) K *= INFERRED_MULTIPLIER;
    
    const volatilityMultiplier = (winner.rd + loser.rd) / 700;
    const finalK = K * volatilityMultiplier;
    
    const expected = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
    const delta = finalK * (1 - expected);
    
    winner.rating += delta;
    loser.rating -= delta;
    
    winner.rd = Math.max(MIN_RD, winner.rd * RD_DECAY);
    loser.rd = Math.max(MIN_RD, loser.rd * RD_DECAY);
}

function pickMatchGlicko(values, matchCount) {
    const unplayed = [];
    
    // Build list of unplayed pairs
    for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
            if (!values[i].playedAgainst.has(j)) {
                unplayed.push([i, j]);
            }
        }
    }
    
    if (unplayed.length === 0) {
        // All pairs played, pick random
        const i = Math.floor(Math.random() * values.length);
        let j = Math.floor(Math.random() * values.length);
        while (j === i) j = Math.floor(Math.random() * values.length);
        return [values[i], values[j]];
    }
    
    // Phase 1 (Discovery): High RD pairs
    // Phase 2 (Tournament): Close rating pairs
    const isDiscovery = matchCount < 15;
    
    if (isDiscovery) {
        // Pick pair with highest combined RD
        unplayed.sort((a, b) => {
            const rdA = values[a[0]].rd + values[a[1]].rd;
            const rdB = values[b[0]].rd + values[b[1]].rd;
            return rdB - rdA;
        });
    } else {
        // Pick pair with closest ratings
        unplayed.sort((a, b) => {
            const diffA = Math.abs(values[a[0]].rating - values[a[1]].rating);
            const diffB = Math.abs(values[b[0]].rating - values[b[1]].rating);
            return diffA - diffB;
        });
    }
    
    const [i, j] = unplayed[0];
    return [values[i], values[j]];
}

function runGlickoSim() {
    const values = createValues();
    
    for (let m = 0; m < NUM_MATCHES; m++) {
        const [v1, v2] = pickMatchGlicko(values, m);
        
        // Determine winner (lower trueRank = better)
        const winner = v1.trueRank < v2.trueRank ? v1 : v2;
        const loser = winner === v1 ? v2 : v1;
        
        // Simulate confidence (random ~60% of the time for clear wins)
        const ratingDiff = Math.abs(v1.trueRank - v2.trueRank);
        const isConfident = ratingDiff > 10 ? Math.random() < 0.8 : Math.random() < 0.4;
        
        calculateWinGlicko(winner, loser, isConfident, false);
        
        winner.playedAgainst.add(loser.id);
        loser.playedAgainst.add(winner.id);
    }
    
    // Sort by rating (descending)
    const ranked = [...values].sort((a, b) => b.rating - a.rating);
    
    return {
        top1Correct: ranked[0].trueRank === 1,
        top3Correct: ranked.slice(0, 3).filter(v => v.trueRank <= 3).length,
        top5Correct: ranked.slice(0, 5).filter(v => v.trueRank <= 5).length,
        trueWinnerRank: ranked.findIndex(v => v.trueRank === 1) + 1
    };
}

// --- OLD ACCUMULATOR SYSTEM (for comparison) ---

function pickMatchAccumulator(values) {
    // Current app logic: sort by matches, then random
    const candidates = [...values].sort((a, b) => {
        if (a.matches === b.matches) return 0.5 - Math.random();
        return a.matches - b.matches;
    });
    
    let p1 = candidates[0];
    let p2 = null;
    
    for (let i = 1; i < candidates.length; i++) {
        if (!p1.playedAgainst.has(candidates[i].id)) {
            p2 = candidates[i];
            break;
        }
    }
    if (!p2) p2 = candidates[1];
    
    return [p1, p2];
}

function runAccumulatorSim() {
    const values = createValues();
    
    for (let m = 0; m < NUM_MATCHES; m++) {
        const [v1, v2] = pickMatchAccumulator(values);
        
        const winner = v1.trueRank < v2.trueRank ? v1 : v2;
        const loser = winner === v1 ? v2 : v1;
        
        // Simulate confidence
        const ratingDiff = Math.abs(v1.trueRank - v2.trueRank);
        const isConfident = ratingDiff > 10 ? Math.random() < 0.8 : Math.random() < 0.4;
        
        // Old scoring
        winner.score += isConfident ? 2 : 1;
        winner.matches++;
        loser.matches++;
        
        winner.playedAgainst.add(loser.id);
        loser.playedAgainst.add(winner.id);
    }
    
    const ranked = [...values].sort((a, b) => b.score - a.score);
    
    return {
        top1Correct: ranked[0].trueRank === 1,
        top3Correct: ranked.slice(0, 3).filter(v => v.trueRank <= 3).length,
        top5Correct: ranked.slice(0, 5).filter(v => v.trueRank <= 5).length,
        trueWinnerRank: ranked.findIndex(v => v.trueRank === 1) + 1
    };
}

// --- RUN SIMULATIONS ---

console.log(`\n🧪 Running ${NUM_SIMULATIONS} simulations...\n`);

const glickoResults = { top1: 0, top3Total: 0, top5Total: 0, winnerRanks: [] };
const accumResults = { top1: 0, top3Total: 0, top5Total: 0, winnerRanks: [] };

for (let i = 0; i < NUM_SIMULATIONS; i++) {
    const g = runGlickoSim();
    glickoResults.top1 += g.top1Correct ? 1 : 0;
    glickoResults.top3Total += g.top3Correct;
    glickoResults.top5Total += g.top5Correct;
    glickoResults.winnerRanks.push(g.trueWinnerRank);
    
    const a = runAccumulatorSim();
    accumResults.top1 += a.top1Correct ? 1 : 0;
    accumResults.top3Total += a.top3Correct;
    accumResults.top5Total += a.top5Correct;
    accumResults.winnerRanks.push(a.trueWinnerRank);
}

const avgWinnerRankGlicko = glickoResults.winnerRanks.reduce((a, b) => a + b, 0) / NUM_SIMULATIONS;
const avgWinnerRankAccum = accumResults.winnerRanks.reduce((a, b) => a + b, 0) / NUM_SIMULATIONS;

console.log('═══════════════════════════════════════════════════════════');
console.log('                    SIMULATION RESULTS                      ');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('┌─────────────────────┬────────────────┬────────────────┐');
console.log('│       Metric        │  ACCUMULATOR   │  GLICKO-LITE   │');
console.log('├─────────────────────┼────────────────┼────────────────┤');
console.log(`│ #1 Accuracy         │     ${(accumResults.top1 / NUM_SIMULATIONS * 100).toFixed(1).padStart(5)}%    │     ${(glickoResults.top1 / NUM_SIMULATIONS * 100).toFixed(1).padStart(5)}%    │`);
console.log(`│ Top 3 Avg Correct   │     ${(accumResults.top3Total / NUM_SIMULATIONS).toFixed(2).padStart(5)}/3    │     ${(glickoResults.top3Total / NUM_SIMULATIONS).toFixed(2).padStart(5)}/3    │`);
console.log(`│ Top 5 Avg Correct   │     ${(accumResults.top5Total / NUM_SIMULATIONS).toFixed(2).padStart(5)}/5    │     ${(glickoResults.top5Total / NUM_SIMULATIONS).toFixed(2).padStart(5)}/5    │`);
console.log(`│ True #1 Avg Rank    │     #${avgWinnerRankAccum.toFixed(1).padStart(5)}     │     #${avgWinnerRankGlicko.toFixed(1).padStart(5)}     │`);
console.log('└─────────────────────┴────────────────┴────────────────┘');
console.log('');
console.log(`Simulations: ${NUM_SIMULATIONS} | Matches per run: ${NUM_MATCHES} | Values: ${NUM_VALUES}`);
console.log('');

// Save results
const fs = require('fs');
const results = {
    timestamp: new Date().toISOString(),
    config: { NUM_VALUES, NUM_MATCHES, NUM_SIMULATIONS },
    accumulator: {
        top1Accuracy: accumResults.top1 / NUM_SIMULATIONS,
        top3AvgCorrect: accumResults.top3Total / NUM_SIMULATIONS,
        top5AvgCorrect: accumResults.top5Total / NUM_SIMULATIONS,
        avgWinnerRank: avgWinnerRankAccum
    },
    glickoLite: {
        top1Accuracy: glickoResults.top1 / NUM_SIMULATIONS,
        top3AvgCorrect: glickoResults.top3Total / NUM_SIMULATIONS,
        top5AvgCorrect: glickoResults.top5Total / NUM_SIMULATIONS,
        avgWinnerRank: avgWinnerRankGlicko
    }
};

fs.writeFileSync('sims/glicko-lite-results.json', JSON.stringify(results, null, 2));
console.log('Results saved to sims/glicko-lite-results.json');
