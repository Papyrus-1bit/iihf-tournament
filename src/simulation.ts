import type { Team } from "./types";

const poisson = (lambda: number) => {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
};

const getStrength = (rank: number, maxRank: number) => {
  const safeRank = Math.max(1, rank);
  return (maxRank + 1 - safeRank) / maxRank;
};

export const simulateMatchResult = (home: Team, away: Team) => {
  let ratio = 1;
  let homeStrength = 1;
  let awayStrength = 1;

  if (home.ratingPoints && away.ratingPoints) {
    homeStrength = home.ratingPoints;
    awayStrength = away.ratingPoints;
    ratio = homeStrength / awayStrength;
  } else {
    const maxRank = Math.max(home.iihfRank, away.iihfRank, 1);
    homeStrength = getStrength(home.iihfRank, maxRank);
    awayStrength = getStrength(away.iihfRank, maxRank);
    ratio = homeStrength / awayStrength;
  }

  const base = 2.6;
  const exponent = 0.55;
  const homeLambda = Math.max(0.2, base * Math.pow(ratio, exponent));
  const awayLambda = Math.max(0.2, base * Math.pow(1 / ratio, exponent));

  let homeGoals = poisson(homeLambda);
  let awayGoals = poisson(awayLambda);
  let overtime = false;
  let shootout = false;

  if (homeGoals === awayGoals) {
    const homeWinProb = homeStrength / (homeStrength + awayStrength);
    const isOvertime = Math.random() < 0.65;
    if (Math.random() < homeWinProb) {
      homeGoals += 1;
    } else {
      awayGoals += 1;
    }
    overtime = isOvertime;
    shootout = !isOvertime;
  }

  return { homeGoals, awayGoals, overtime, shootout };
};
