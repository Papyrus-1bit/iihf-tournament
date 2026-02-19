import type { Match, MatchStage, Team } from "./types";
import { buildPredictiveLambdas } from "./predictiveModel";

interface SimulationContext {
  historyMatches?: Match[];
  currentMatchId?: string;
  stage?: MatchStage;
}

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const simulateMatchResult = (
  home: Team,
  away: Team,
  context?: SimulationContext
) => {
  const prediction = buildPredictiveLambdas(home, away, context);

  let homeGoals = poisson(prediction.homeLambda);
  let awayGoals = poisson(prediction.awayLambda);

  let overtime = false;
  let shootout = false;

  if (homeGoals === awayGoals) {
    const isPlayoff = context?.stage === "playoff";
    const shootoutChance = isPlayoff ? 0 : 0.34;

    if (Math.random() < clamp(prediction.homeWinProbability, 0.25, 0.75)) {
      homeGoals += 1;
    } else {
      awayGoals += 1;
    }

    overtime = true;
    shootout = !isPlayoff && Math.random() < shootoutChance;
  }

  return { homeGoals, awayGoals, overtime, shootout };
};
