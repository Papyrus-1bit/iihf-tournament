import type { Match, MatchStage, Team } from "./types";

const SAVES_STORAGE_KEY = "iihfTournamentSaves";
const DEFAULT_GPG = 2.6;
const BASE_LAMBDA = 2.45;

interface TeamHistory {
  games: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: number[];
}

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

const isPlayedMatch = (match: Match) =>
  match.homeScore !== undefined && match.awayScore !== undefined;

const getStrength = (team: Team) => {
  if (team.ratingPoints && team.ratingPoints > 0) return team.ratingPoints;
  const safeRank = Math.max(1, team.iihfRank || 1);
  return 3000 / safeRank;
};

const getSavedHistoryMatches = (): Match[] => {
  if (typeof window === "undefined") return [];
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
};

const collectHistory = (context?: SimulationContext) => {
  const external = context?.historyMatches ?? [];
  const stored = getSavedHistoryMatches();
  return [...stored, ...external]
    .filter((match) => match.id !== context?.currentMatchId)
    .filter(isPlayedMatch)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
};

const buildTeamHistoryMap = (history: Match[]) => {
  const map = new Map<string, TeamHistory>();
  const touch = (teamId: string) => {
    const existing = map.get(teamId);
    if (existing) return existing;
    const created: TeamHistory = {
      games: 0,
      wins: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      form: [],
    };
    map.set(teamId, created);
    return created;
  };

  history.forEach((match) => {
    const home = touch(match.home.id);
    const away = touch(match.away.id);
    const homeGoals = match.homeScore ?? 0;
    const awayGoals = match.awayScore ?? 0;
    const isOtLike = !!match.overtime || !!match.shootout;

    home.games += 1;
    away.games += 1;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.form.push(isOtLike ? 0.8 : 1);
      away.form.push(isOtLike ? -0.5 : -1);
    } else if (homeGoals < awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.form.push(isOtLike ? 0.8 : 1);
      home.form.push(isOtLike ? -0.5 : -1);
    } else {
      home.form.push(0);
      away.form.push(0);
    }
  });
  return map;
};

const averageForm = (form: number[], count: number) => {
  const chunk = form.slice(-count);
  if (chunk.length === 0) return 0;
  return chunk.reduce((sum, value) => sum + value, 0) / chunk.length;
};

const buildHeadToHeadAdvantage = (homeId: string, awayId: string, history: Match[]) => {
  const h2h = history.filter(
    (match) =>
      (match.home.id === homeId && match.away.id === awayId) ||
      (match.home.id === awayId && match.away.id === homeId)
  );
  if (h2h.length === 0) return 0;

  let score = 0;
  h2h.forEach((match, index) => {
    const weight = 0.6 + (index + 1) / (h2h.length + 1);
    const homeTeamWon =
      match.homeScore !== undefined &&
      match.awayScore !== undefined &&
      match.homeScore > match.awayScore;
    const awayTeamWon =
      match.homeScore !== undefined &&
      match.awayScore !== undefined &&
      match.awayScore > match.homeScore;
    if (match.home.id === homeId) {
      if (homeTeamWon) score += weight;
      if (awayTeamWon) score -= weight;
    } else {
      if (awayTeamWon) score += weight;
      if (homeTeamWon) score -= weight;
    }
  });
  return clamp(score / (h2h.length * 1.6), -1, 1);
};

export const simulateMatchResult = (
  home: Team,
  away: Team,
  context?: SimulationContext
) => {
  const history = collectHistory(context);
  const teamHistory = buildTeamHistoryMap(history);
  const homeStats = teamHistory.get(home.id);
  const awayStats = teamHistory.get(away.id);

  const homeStrength = getStrength(home);
  const awayStrength = getStrength(away);
  const ratingEdge = clamp((homeStrength - awayStrength) / Math.max(homeStrength, awayStrength), -1, 1);
  const h2hEdge = buildHeadToHeadAdvantage(home.id, away.id, history);
  const formEdge = clamp(
    averageForm(homeStats?.form ?? [], 8) - averageForm(awayStats?.form ?? [], 8),
    -1,
    1
  );

  const homeAttack = homeStats?.games ? homeStats.goalsFor / homeStats.games : DEFAULT_GPG;
  const homeDefence = homeStats?.games ? homeStats.goalsAgainst / homeStats.games : DEFAULT_GPG;
  const awayAttack = awayStats?.games ? awayStats.goalsFor / awayStats.games : DEFAULT_GPG;
  const awayDefence = awayStats?.games ? awayStats.goalsAgainst / awayStats.games : DEFAULT_GPG;

  const blend = ratingEdge * 0.7 + h2hEdge * 0.45 + formEdge * 0.35;
  const homeLambdaRaw =
    BASE_LAMBDA *
    (1 + blend * 0.35) *
    clamp((homeAttack / DEFAULT_GPG) * (awayDefence / DEFAULT_GPG), 0.75, 1.35);
  const awayLambdaRaw =
    BASE_LAMBDA *
    (1 - blend * 0.3) *
    clamp((awayAttack / DEFAULT_GPG) * (homeDefence / DEFAULT_GPG), 0.75, 1.35);

  const homeLambda = clamp(homeLambdaRaw, 0.35, 6.2);
  const awayLambda = clamp(awayLambdaRaw, 0.35, 6.2);
  let homeGoals = poisson(homeLambda);
  let awayGoals = poisson(awayLambda);

  let overtime = false;
  let shootout = false;

  if (homeGoals === awayGoals) {
    const homeWinProb = clamp(0.5 + blend * 0.18, 0.3, 0.7);
    const isPlayoff = context?.stage === "playoff";
    const shootoutChance = isPlayoff ? 0 : 0.36;
    if (Math.random() < homeWinProb) {
      homeGoals += 1;
    } else {
      awayGoals += 1;
    }
    overtime = true;
    shootout = !isPlayoff && Math.random() < shootoutChance;
  }

  return { homeGoals, awayGoals, overtime, shootout };
};
