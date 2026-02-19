import type { Match, MatchStage, Team } from "./types";

const SAVES_STORAGE_KEY = "iihfTournamentSaves";
const HISTORICAL_CACHE_KEY = "iihfHistoricalMatches";
const DEFAULT_GPG = 2.6;

interface SimulationContext {
  historyMatches?: Match[];
  currentMatchId?: string;
  stage?: MatchStage;
}

interface TeamSignal {
  attack: number;
  defence: number;
  form: number;
  reliability: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isPlayedMatch = (match: Match) =>
  match.homeScore !== undefined && match.awayScore !== undefined;

const toWeight = (indexFromEnd: number, halfLife = 8) => Math.exp(-indexFromEnd / halfLife);

const getStrength = (team: Team) => {
  if (team.ratingPoints && team.ratingPoints > 0) return team.ratingPoints;
  const safeRank = Math.max(1, team.iihfRank || 1);
  return 3000 / safeRank;
};

const readHistoryFromStorage = (): Match[] => {
  if (typeof window === "undefined") return [];

  const fromSaves = (() => {
    try {
      const raw = localStorage.getItem(SAVES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<{
        data?: { groups?: Array<{ matches?: Match[] }>; playoffMatches?: Match[] };
      }>;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((save) => [
        ...(save.data?.groups ?? []).flatMap((group) => group.matches ?? []),
        ...(save.data?.playoffMatches ?? []),
      ]);
    } catch {
      return [];
    }
  })();

  const fromCache = (() => {
    try {
      const raw = localStorage.getItem(HISTORICAL_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Match[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return [...fromSaves, ...fromCache];
};

const dedupeMatches = (matches: Match[]) => {
  const map = new Map<string, Match>();
  matches.forEach((match) => {
    const key = `${match.id}|${match.home.id}|${match.away.id}|${match.homeScore}|${match.awayScore}|${match.date ?? ""}`;
    map.set(key, match);
  });
  return Array.from(map.values());
};

export const collectHistoricalMatches = (context?: SimulationContext) => {
  const external = context?.historyMatches ?? [];
  return dedupeMatches([...readHistoryFromStorage(), ...external])
    .filter((match) => match.id !== context?.currentMatchId)
    .filter(isPlayedMatch)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
};

const buildTeamSignal = (teamId: string, history: Match[]): TeamSignal => {
  const relevant = history.filter(
    (match) => match.home.id === teamId || match.away.id === teamId
  );

  if (relevant.length === 0) {
    return {
      attack: DEFAULT_GPG,
      defence: DEFAULT_GPG,
      form: 0,
      reliability: 0,
    };
  }

  let weightedGoalsFor = 0;
  let weightedGoalsAgainst = 0;
  let weightedForm = 0;
  let totalWeight = 0;

  relevant.forEach((match, idx) => {
    const indexFromEnd = relevant.length - 1 - idx;
    const weight = toWeight(indexFromEnd, 9);
    const isHome = match.home.id === teamId;
    const goalsFor = isHome ? match.homeScore ?? 0 : match.awayScore ?? 0;
    const goalsAgainst = isHome ? match.awayScore ?? 0 : match.homeScore ?? 0;

    weightedGoalsFor += goalsFor * weight;
    weightedGoalsAgainst += goalsAgainst * weight;

    const rawForm = goalsFor > goalsAgainst ? 1 : goalsFor < goalsAgainst ? -1 : 0;
    const formModifier = match.shootout ? 0.75 : match.overtime ? 0.85 : 1;
    weightedForm += rawForm * formModifier * weight;
    totalWeight += weight;
  });

  const attack = weightedGoalsFor / Math.max(totalWeight, 1e-6);
  const defence = weightedGoalsAgainst / Math.max(totalWeight, 1e-6);
  const form = weightedForm / Math.max(totalWeight, 1e-6);
  const reliability = clamp(relevant.length / 18, 0, 1);

  return {
    attack: clamp(attack, 0.2, 6.0),
    defence: clamp(defence, 0.2, 6.0),
    form: clamp(form, -1, 1),
    reliability,
  };
};

const buildHeadToHeadEdge = (homeId: string, awayId: string, history: Match[]) => {
  const h2h = history.filter(
    (match) =>
      (match.home.id === homeId && match.away.id === awayId) ||
      (match.home.id === awayId && match.away.id === homeId)
  );

  if (h2h.length === 0) return 0;

  let score = 0;
  let totalWeight = 0;
  h2h.forEach((match, idx) => {
    const indexFromEnd = h2h.length - 1 - idx;
    const weight = toWeight(indexFromEnd, 6);
    const homePerspectiveWin =
      (match.home.id === homeId && (match.homeScore ?? 0) > (match.awayScore ?? 0)) ||
      (match.away.id === homeId && (match.awayScore ?? 0) > (match.homeScore ?? 0));
    const homePerspectiveLoss =
      (match.home.id === homeId && (match.homeScore ?? 0) < (match.awayScore ?? 0)) ||
      (match.away.id === homeId && (match.awayScore ?? 0) < (match.homeScore ?? 0));

    if (homePerspectiveWin) score += weight;
    if (homePerspectiveLoss) score -= weight;
    totalWeight += weight;
  });

  return clamp(score / Math.max(totalWeight, 1e-6), -1, 1);
};

export const buildPredictiveLambdas = (
  home: Team,
  away: Team,
  context?: SimulationContext
) => {
  const history = collectHistoricalMatches(context);
  const homeSignal = buildTeamSignal(home.id, history);
  const awaySignal = buildTeamSignal(away.id, history);

  const leagueGpg =
    history.length > 0
      ? history.reduce((sum, match) => sum + (match.homeScore ?? 0) + (match.awayScore ?? 0), 0) /
        (history.length * 2)
      : DEFAULT_GPG;

  const homeStrength = getStrength(home);
  const awayStrength = getStrength(away);
  const ratingEdge = clamp(
    (homeStrength - awayStrength) / Math.max(homeStrength, awayStrength, 1),
    -1,
    1
  );

  const h2hEdge = buildHeadToHeadEdge(home.id, away.id, history);
  const formEdge = clamp(homeSignal.form - awaySignal.form, -1, 1);
  const reliability = Math.max(homeSignal.reliability, awaySignal.reliability);

  const edgeBlend =
    ratingEdge * 0.55 +
    h2hEdge * (0.25 + reliability * 0.1) +
    formEdge * 0.2;

  const attackDefenceHome = clamp(
    (homeSignal.attack / Math.max(leagueGpg, 0.2)) *
      (awaySignal.defence / Math.max(leagueGpg, 0.2)),
    0.7,
    1.45
  );
  const attackDefenceAway = clamp(
    (awaySignal.attack / Math.max(leagueGpg, 0.2)) *
      (homeSignal.defence / Math.max(leagueGpg, 0.2)),
    0.7,
    1.45
  );

  const stageTempo = context?.stage === "playoff" ? 0.94 : 1;

  const base = clamp(leagueGpg, 1.8, 3.8) * stageTempo;
  const homeLambda = clamp(base * (1 + edgeBlend * 0.3) * attackDefenceHome, 0.3, 6.5);
  const awayLambda = clamp(base * (1 - edgeBlend * 0.28) * attackDefenceAway, 0.3, 6.5);

  const homeWinProbability = clamp(0.5 + edgeBlend * 0.22, 0.25, 0.75);

  return {
    homeLambda,
    awayLambda,
    homeWinProbability,
    diagnostics: {
      edgeBlend,
      ratingEdge,
      h2hEdge,
      formEdge,
      reliability,
      historyCount: history.length,
    },
  };
};
