// Shared boulder scoring rules.
// A score row stores the total number of attempts plus the attempt number on which
// zone 1, zone 2 and top were reached (0 = not reached). The result of a boulder is
// "attempt of the best achievement / points" — later attempts do not change it.

function scorePoints(score) {
  const best = score.best_achievement || 0;
  if (best >= 30) {
    if (score.top_attempts > 0) return score.top_attempts === 1 ? 40 : 30;
    return best === 40 || score.attempts === 1 ? 40 : 30;
  }
  if (best === 20) return 20;
  if (best === 10) return 10;
  return 0;
}

// Attempts that count for the result (falls back to total attempts for older rows)
function resultAttempts(score) {
  const best = score.best_achievement || 0;
  const total = score.attempts || 0;
  if (best >= 30) return score.top_attempts || total;
  if (best === 20) return score.zone2_attempts || total;
  if (best === 10) return score.zone1_attempts || total;
  return total;
}

function summarizeScores(scores) {
  let totalPoints = 0;
  let totalAttempts = 0;
  let totalTops = 0;
  let totalZones = 0;
  let topAttempts = 0;
  let zoneAttempts = 0;

  for (const score of scores) {
    const best = score.best_achievement || 0;
    const att = resultAttempts(score);
    if (best >= 30) {
      totalTops++;
      topAttempts += att;
    } else if (best === 20 || best === 10) {
      totalZones++;
      zoneAttempts += att;
    }
    totalPoints += scorePoints(score);
    totalAttempts += att;
  }

  return { totalPoints, totalAttempts, totalTops, totalZones, topAttempts, zoneAttempts };
}

module.exports = { scorePoints, resultAttempts, summarizeScores };
