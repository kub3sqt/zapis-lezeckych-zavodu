const { db } = require('./backend/db');
require('./backend/routes/children'); // To verify require works

const normalize = str => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

function getSimilarityScore(cFirst, cLast, typedFirst, typedLast, isNickname) {
  let score = 0;
  
  if (isNickname) {
    const typedTarget = typedFirst || typedLast;
    if (cLast.includes(typedTarget) || typedTarget.includes(cLast)) return 10;
    if (cFirst.includes(typedTarget) || typedTarget.includes(cFirst)) return 8;
  } else {
    function levenshtein(s, t) {
      if (s === t) return 0;
      if (s.length === 0) return t.length;
      if (t.length === 0) return s.length;
      const v0 = new Array(t.length + 1);
      const v1 = new Array(t.length + 1);
      for (let i = 0; i <= t.length; i++) v0[i] = i;
      for (let i = 0; i < s.length; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < t.length; j++) {
          const cost = (s[i] === t[j]) ? 0 : 1;
          v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
      }
      return v1[t.length];
    }
    
    if (cFirst === typedFirst && cLast === typedLast) return 100;
    
    if (cLast === typedLast) {
      if (cFirst.includes(typedFirst) || typedFirst.includes(cFirst)) return 20;
      if (levenshtein(cFirst, typedFirst) <= 3) return 15;
      if (cFirst.substring(0, 3) === typedFirst.substring(0, 3) && cFirst.length >= 3) return 12;
      if (cFirst.substring(0, 2) === typedFirst.substring(0, 2) && levenshtein(cFirst, typedFirst) <= 4) return 10;
    }
    if (cFirst === typedFirst) {
      if (cLast.includes(typedLast) || typedLast.includes(cLast)) return 20;
      if (levenshtein(cLast, typedLast) <= 3) return 15;
    }
    
    if (cFirst === typedLast && cLast === typedFirst) return 18;
  }
  return score;
}

function check(cFirstRaw, cLastRaw, typeFirstRaw, typeLastRaw) {
    const cFirst = normalize(cFirstRaw);
    const cLast = normalize(cLastRaw);
    const typedFirst = normalize(typeFirstRaw);
    const typedLast = normalize(typeLastRaw);
    const isNickname = (!typedFirst && typedLast) || (typedFirst && !typedLast);
    return getSimilarityScore(cFirst, cLast, typedFirst, typedLast, isNickname);
}

console.log("Matěj Šimek vs Matýsek Šimek:", check("Matěj", "Šimek", "Matýsek", "Šimek")); // Expect positive score
console.log("Lukáš Korch vs Korchy:", check("Lukáš", "Korch", "", "Korchy")); // Expect positive score
console.log("Lukáš Korch vs Lukáš Korchy:", check("Lukáš", "Korch", "Lukáš", "Korchy")); // Expect positive score
console.log("Anna Nováková vs Anička Nováková:", check("Anna", "Nováková", "Anička", "Nováková")); // Expect positive score
