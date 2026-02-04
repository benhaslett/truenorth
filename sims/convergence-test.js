/**
 * Convergence Test: Does Glicko-Lite get more accurate with more matches?
 * Testing: 120, 150, 200, 300, 500 matches
 */

const NUM_VALUES = 53;
const NUM_SIMULATIONS = 200; // Fewer sims per test for speed
const MATCH_COUNTS = [120, 150, 200, 300, 500];

// Glicko-Lite Config
const RD_DECAY = 0.95;
const MIN_RD = 50;
const K_BASE = 40;
const CONFIDENT_MULTIPLIER = 1.5;

function createValues() {
    return Array.from({ length: NUM_VALUES }, (_, i) => ({
        id: i,
        trueRank: i + 1,
        rating: 1500,
        rd: 350,
        playedAgainst: new Set()
    }));
}

function calculateWinGlicko(winner, loser, isConfident) {
    let K = K_BASE;
    if (isConfident) K *= CONFIDENT_MULTIPLIER;
    
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
    
    for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
            if (!values[i].playedAgainst.has(j)) {
                unplayed.push([i, j]);
            }
        }
    }
    
    if (unplayed.length === 0) {
        const i = Math.floor(Math.random() * values.length);
        let j = Math.floor(Math.random() * values.length);
        while (j === i) j = Math.floor(Math.random() * values.length);
        return [values[i], values[j]];
    }
    
    const isDiscovery = matchCount < 15;
    
    if (isDiscovery) {
        unplayed.sort((a, b) => {
            const rdA = values[a[0]].rd + values[a[1]].rd;
            const rdB = values[b[0]].rd + values[b[1]].rd;
            return rdB - rdA;
        });
    } else {
        unplayed.sort((a, b) => {
            const diffA = Math.abs(values[a[0]].rating - values[a[1]].rating);
            const diffB = Math.abs(values[b[0]].rating - values[b[1]].rating);
            return diffA - diffB;
        });
    }
    
    const [i, j] = unplayed[0];
    return [values[i], values[j]];
}

function runSim(numMatches) {
    const values = createValues();
    
    for (let m = 0; m < numMatches; m++) {
        const [v1, v2] = pickMatchGlicko(values, m);
        
        const winner = v1.trueRank < v2.trueRank ? v1 : v2;
        const loser = winner === v1 ? v2 : v1;
        
        const ratingDiff = Math.abs(v1.trueRank - v2.trueRank);
        const isConfident = ratingDiff > 10 ? Math.random() < 0.8 : Math.random() < 0.4;
        
        calculateWinGlicko(winner, loser, isConfident);
        
        winner.playedAgainst.add(loser.id);
        loser.playedAgainst.add(winner.id);
    }
    
    const ranked = [...values].sort((a, b) => b.rating - a.rating);
    
    return {
        top1Correct: ranked[0].trueRank === 1,
        top3Correct: ranked.slice(0, 3).filter(v => v.trueRank <= 3).length,
        top5Correct: ranked.slice(0, 5).filter(v => v.trueRank <= 5).length,
        trueWinnerRank: ranked.findIndex(v => v.trueRank === 1) + 1
    };
}

// --- RUN ---
console.log('\n🔬 CONVERGENCE TEST: Glicko-Lite accuracy vs match count\n');
console.log('┌──────────┬────────────┬────────────┬────────────┬─────────────┐');
console.log('│ Matches  │ #1 Correct │ Top 3 Avg  │ Top 5 Avg  │ Winner Rank │');
console.log('├──────────┼────────────┼────────────┼────────────┼─────────────┤');

const results = [];

for (const numMatches of MATCH_COUNTS) {
    let top1 = 0, top3 = 0, top5 = 0, rankSum = 0;
    
    for (let i = 0; i < NUM_SIMULATIONS; i++) {
        const r = runSim(numMatches);
        top1 += r.top1Correct ? 1 : 0;
        top3 += r.top3Correct;
        top5 += r.top5Correct;
        rankSum += r.trueWinnerRank;
    }
    
    const row = {
        matches: numMatches,
        top1Pct: (top1 / NUM_SIMULATIONS * 100).toFixed(1),
        top3Avg: (top3 / NUM_SIMULATIONS).toFixed(2),
        top5Avg: (top5 / NUM_SIMULATIONS).toFixed(2),
        avgRank: (rankSum / NUM_SIMULATIONS).toFixed(1)
    };
    results.push(row);
    
    console.log(`│ ${String(numMatches).padStart(6)}   │   ${row.top1Pct.padStart(5)}%   │   ${row.top3Avg}/3   │   ${row.top5Avg}/5   │    #${row.avgRank.padStart(4)}    │`);
}

console.log('└──────────┴────────────┴────────────┴────────────┴─────────────┘');
console.log(`\nSimulations per test: ${NUM_SIMULATIONS}`);
console.log('');

// Save
const fs = require('fs');
fs.writeFileSync('sims/convergence-results.json', JSON.stringify(results, null, 2));
console.log('Results saved to sims/convergence-results.json');
