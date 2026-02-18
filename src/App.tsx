import { useEffect, useRef, useState } from "react";
import { Box, Button, Heading, Input, Text } from "@chakra-ui/react";
import TournamentSetup from "./components/TournamentSetup";
import GroupEditor from "./components/GroupEditor";
import Calendar from "./components/Calendar";
import StandingsTable from "./components/StandingsTable";
import RatingTable from "./components/RatingTable";
import PlayoffBracket from "./components/PlayoffBracket";
import { Tab as UiTab, Tabs as UiTabs, UiRoot } from "./ui";
import { Group, Match, MatchRound, Team } from "./types";
import { fetchCountries } from "./api";
import {
  applyMatchesToGroups,
  assignMatchDates,
  generateGroupMatches,
  getLastScheduledDay,
  getTournamentStartDate,
} from "./scheduling";
import { calculateGroupStats, calculateOverallStats } from "./standings";

const RATINGS_STORAGE_KEY = "iihfRatings";
const SAVES_STORAGE_KEY = "iihfTournamentSaves";
const DEFAULT_RATING = 1500;

type PlayoffSeeding = "overall" | "byGroup" | "random" | "ratings";
type PlayoffBracketRule = "seeded" | "cross" | "random";

interface TournamentSaveData {
  tournamentName: string;
  groups: Group[];
  unassigned: Team[];
  playoffMatches: Match[];
  playoffSeeding: PlayoffSeeding;
  playoffBracketRule: PlayoffBracketRule;
  teamsPerGroupLimit: number;
  playerTeamIds: string[];
  isTournamentCreated: boolean;
  tournamentBaseRanks: Record<string, number>;
  ratingsCommitted: boolean;
}

interface TournamentSave {
  id: string;
  name: string;
  savedAt: string;
  data: TournamentSaveData;
}

const buildRankMap = (ratings: Record<string, number>) => {
  const sorted = Object.entries(ratings).sort((a, b) => b[1] - a[1]);
  const map: Record<string, number> = {};
  sorted.forEach(([id], index) => {
    map[id] = index + 1;
  });
  return map;
};

const getBracketSize = (groups: Group[]) => {
  const totalTeams = groups.reduce((sum, group) => sum + group.teams.length, 0);
  if (totalTeams >= 16) return 16;
  if (totalTeams >= 8) return 8;
  if (totalTeams >= 4) return 4;
  return 0;
};

const getRoundForSize = (size: number): MatchRound | null => {
  if (size === 16) return "R16";
  if (size === 8) return "QF";
  if (size === 4) return "SF";
  return null;
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isTournamentCreated, setIsTournamentCreated] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<Team[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<Match[]>([]);
  const [playoffSeeding, setPlayoffSeeding] = useState<PlayoffSeeding>("overall");
  const [playoffBracketRule, setPlayoffBracketRule] =
    useState<PlayoffBracketRule>("seeded");
  const [teamsPerGroupLimit, setTeamsPerGroupLimit] = useState(4);
  const [playerTeamIds, setPlayerTeamIds] = useState<string[]>([]);
  const [defaultRatings, setDefaultRatings] = useState<Record<string, number>>({});
  const [baseRatings, setBaseRatings] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Array<Team & { rating: number }>>([]);
  const [tournamentBaseRanks, setTournamentBaseRanks] = useState<Record<string, number>>({});
  const [ratingsCommitted, setRatingsCommitted] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [savedTournaments, setSavedTournaments] = useState<TournamentSave[]>([]);
  const [editingSaveId, setEditingSaveId] = useState<string | null>(null);
  const [editingSaveName, setEditingSaveName] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isImportDrag, setIsImportDrag] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "tournament" | "calendar" | "standings" | "playoff" | "rating"
  >("tournament");
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchCountries()
      .then((data) => {
        if (!active) return;
        const storedRaw = localStorage.getItem(RATINGS_STORAGE_KEY);
        let stored: Record<string, number> = {};
        if (storedRaw) {
          try {
            stored = JSON.parse(storedRaw) as Record<string, number>;
          } catch {
            stored = {};
          }
        }

        const entries = Object.entries(data).map(([code, info]) => ({
          code,
          name: info.name,
          rating: stored[code] ?? info.rating_points,
          ovr: info.ovr,
        }));

        const defaults: Record<string, number> = {};
        Object.entries(data).forEach(([code, info]) => {
          defaults[code] = info.rating_points;
        });
        setDefaultRatings(defaults);

        const nextBaseRatings: Record<string, number> = {};
        entries.forEach((e) => {
          nextBaseRatings[e.code] = e.rating;
        });
        setBaseRatings(nextBaseRatings);

        const sorted = [...entries].sort((a, b) => b.rating - a.rating);
        const rankMap = new Map(sorted.map((e, i) => [e.code, i + 1]));
        const mapped: Team[] = entries.map((e) => ({
          id: e.code,
          name: e.name,
          flagCode: e.code,
          iihfRank: rankMap.get(e.code) ?? entries.length,
          ratingPoints: e.rating,
          ovr: e.ovr,
        }));
        setTeams(mapped);
        setUnassigned(mapped);
        setTeamsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setTeamsError(err instanceof Error ? err.message : "Ошибка при загрузке команд");
      })
      .finally(() => {
        if (active) setTeamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(SAVES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TournamentSave[];
      if (Array.isArray(parsed)) {
        setSavedTournaments(parsed);
      }
    } catch {
      // ignore invalid stored saves
    }
  }, []);

  useEffect(() => {
    if (teams.length === 0) return;
    const teamMap = new Map(teams.map((team) => [team.id, team]));
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        teams: group.teams.map((team) => teamMap.get(team.id) ?? team),
        matches: group.matches.map((match) => ({
          ...match,
          home: teamMap.get(match.home.id) ?? match.home,
          away: teamMap.get(match.away.id) ?? match.away,
        })),
      }))
    );
    setPlayoffMatches((prev) =>
      prev.map((match) => ({
        ...match,
        home: teamMap.get(match.home.id) ?? match.home,
        away: teamMap.get(match.away.id) ?? match.away,
      }))
    );
    setUnassigned((prev) => prev.map((team) => teamMap.get(team.id) ?? team));
  }, [teams]);

  const handleCreateGroups = (
    newGroups: Group[],
    unassignedTeams: Team[],
    teamsPerGroup: number
  ) => {
    setGroups(newGroups);
    setUnassigned(unassignedTeams);
    setTeamsPerGroupLimit(teamsPerGroup);
    setIsTournamentCreated(false);
    setActiveTab("tournament");
    setPlayoffMatches([]);
    setRatingsCommitted(false);
  };

  const handleCreateTournament = () => {
    if (groups.length === 0) return;
    const rawMatches = generateGroupMatches(groups);
    const scheduledMatches = assignMatchDates(rawMatches, getTournamentStartDate());
    const scheduledGroups = applyMatchesToGroups(groups, scheduledMatches);
    setGroups(scheduledGroups);
    setPlayoffMatches([]);
    setIsTournamentCreated(true);
    setTournamentBaseRanks(buildRankMap(baseRatings));
    setRatingsCommitted(false);
    setActiveTab("calendar");
  };

  const handleEditTournament = () => {
    setGroups((prev) => prev.map((group) => ({ ...group, matches: [] })));
    setPlayoffMatches([]);
    setIsTournamentCreated(false);
    setRatingsCommitted(false);
    setActiveTab("tournament");
  };

  const buildSaveData = (): TournamentSaveData => ({
    tournamentName,
    groups,
    unassigned,
    playoffMatches,
    playoffSeeding,
    playoffBracketRule,
    teamsPerGroupLimit,
    playerTeamIds,
    isTournamentCreated,
    tournamentBaseRanks,
    ratingsCommitted,
  });

  const persistSaves = (next: TournamentSave[]) => {
    setSavedTournaments(next);
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(next));
  };

  const applySaveData = (data: Partial<TournamentSaveData>) => {
    setTournamentName(data.tournamentName ?? "");
    setGroups(data.groups ?? []);
    setUnassigned(data.unassigned ?? []);
    setPlayoffMatches(data.playoffMatches ?? []);
    setPlayoffSeeding(data.playoffSeeding ?? "overall");
    setPlayoffBracketRule(data.playoffBracketRule ?? "seeded");
    if (typeof data.teamsPerGroupLimit === "number") {
      setTeamsPerGroupLimit(data.teamsPerGroupLimit);
    } else if (data.groups && data.groups.length > 0) {
      const inferred = Math.max(...data.groups.map((group) => group.teams.length), 0);
      if (inferred > 0) setTeamsPerGroupLimit(inferred);
    }
    setPlayerTeamIds(data.playerTeamIds ?? []);
    setIsTournamentCreated(!!data.isTournamentCreated);
    setTournamentBaseRanks(data.tournamentBaseRanks ?? buildRankMap(baseRatings));
    setRatingsCommitted(!!data.ratingsCommitted);
    setActiveTab(data.isTournamentCreated ? "calendar" : "tournament");
  };

  const handleSaveTournament = () => {
    if (!isTournamentCreated) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `save-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name =
      tournamentName?.trim() ||
      `Турнир ${new Date().toLocaleDateString("ru-RU")}`;
    const save: TournamentSave = {
      id,
      name,
      savedAt: new Date().toISOString(),
      data: buildSaveData(),
    };
    persistSaves([save, ...savedTournaments]);
  };

  const handleLoadTournament = (save: TournamentSave) => {
    applySaveData(save.data);
  };

  const handleDeleteSave = (saveId: string) => {
    persistSaves(savedTournaments.filter((save) => save.id !== saveId));
  };

  const handleStartRenameSave = (save: TournamentSave) => {
    setEditingSaveId(save.id);
    setEditingSaveName(save.name);
  };

  const handleApplyRenameSave = () => {
    if (!editingSaveId) return;
    const nextName = editingSaveName.trim();
    if (!nextName) {
      setEditingSaveId(null);
      setEditingSaveName("");
      return;
    }
    const next = savedTournaments.map((save) =>
      save.id === editingSaveId ? { ...save, name: nextName } : save
    );
    persistSaves(next);
    setEditingSaveId(null);
    setEditingSaveName("");
  };

  const handleCancelRenameSave = () => {
    setEditingSaveId(null);
    setEditingSaveName("");
  };

  const handleExportSave = () => {
    if (!isTournamentCreated) return;
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      data: buildSaveData(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = tournamentName?.trim() || "tournament";
    link.href = url;
    link.download = `${baseName.replace(/\s+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSave = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { data?: TournamentSaveData };
      const data = parsed.data ?? parsed;
      applySaveData(data);
    } catch {
      // ignore invalid file
    }
  };

  const applyRatingsToTeams = (ratingMap: Record<string, number>) => {
    const updated = teams.map((team) => ({
      ...team,
      ratingPoints: ratingMap[team.id] ?? team.ratingPoints ?? DEFAULT_RATING,
    }));
    const sorted = [...updated].sort(
      (a, b) => (b.ratingPoints ?? DEFAULT_RATING) - (a.ratingPoints ?? DEFAULT_RATING)
    );
    const ranked = sorted.map((team, index) => ({
      ...team,
      iihfRank: index + 1,
    }));
    setTeams(ranked);
    setUnassigned(ranked);
  };

  const commitRatingsAsBase = (sourceRatings: Array<Team & { rating: number }> = ratings) => {
    if (sourceRatings.length === 0) return;
    const nextBase: Record<string, number> = {};
    sourceRatings.forEach((team) => {
      nextBase[team.id] = team.rating;
    });
    setBaseRatings(nextBase);
    localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(nextBase));
    applyRatingsToTeams(nextBase);
  };

  const handleNewTournament = () => {
    if (ratings.length > 0) {
      commitRatingsAsBase(ratings);
    } else {
      setUnassigned(teams);
    }
    setGroups([]);
    setPlayoffMatches([]);
    setIsTournamentCreated(false);
    setRatingsCommitted(false);
    setPlayerTeamIds([]);
    setActiveTab("tournament");
  };

  const handleResetRatings = () => {
    setBaseRatings(defaultRatings);
    localStorage.removeItem(RATINGS_STORAGE_KEY);
    setTournamentBaseRanks(buildRankMap(defaultRatings));
    applyRatingsToTeams(defaultRatings);
    setRatingsCommitted(false);
  };

  const togglePlayerTeam = (teamId: string) => {
    setPlayerTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  useEffect(() => {
    if (teams.length === 0) {
      setRatings([]);
      return;
    }
    const ratingsMap = new Map<string, number>();
    teams.forEach((team) => {
      ratingsMap.set(team.id, baseRatings[team.id] ?? DEFAULT_RATING);
    });

    const groupStageCompleteLocal =
      groups.length > 0 &&
      groups.every((group) =>
        group.matches.every((match) => match.homeScore !== undefined && match.awayScore !== undefined)
      );
    const bracketSizeLocal = getBracketSize(groups);
    const playoffRequiredLocal = bracketSizeLocal >= 4;
    const playoffCompleteLocal = !playoffRequiredLocal
      ? true
      : playoffMatches.length > 0 &&
        playoffMatches.every(
          (match) => match.homeScore !== undefined && match.awayScore !== undefined
        ) &&
        playoffMatches.some((match) => match.round === "F");
    const tournamentCompleteLocal = groupStageCompleteLocal && playoffCompleteLocal;

    const kFactor = 20;
    const applyMatch = (match: Match) => {
      if (match.homeScore === undefined || match.awayScore === undefined) return;
      const homeId = match.home.id;
      const awayId = match.away.id;
      const r1 = ratingsMap.get(homeId) ?? DEFAULT_RATING;
      const r2 = ratingsMap.get(awayId) ?? DEFAULT_RATING;
      const expected1 = 1 / (1 + 10 ** ((r2 - r1) / 400));
      const expected2 = 1 - expected1;
      const score1 =
        match.homeScore > match.awayScore ? 1 : match.homeScore === match.awayScore ? 0.5 : 0;
      const score2 = 1 - score1;
      ratingsMap.set(homeId, r1 + kFactor * (score1 - expected1));
      ratingsMap.set(awayId, r2 + kFactor * (score2 - expected2));
    };

    if (tournamentCompleteLocal) {
      groups.forEach((group) => {
        group.matches.forEach((match) => applyMatch(match));
      });

      playoffMatches.forEach((match) => applyMatch(match));
    }

    const nextRatings = teams
      .map((team) => ({
        ...team,
        rating: ratingsMap.get(team.id) ?? baseRatings[team.id] ?? DEFAULT_RATING,
      }))
      .sort((a, b) => b.rating - a.rating);
    setRatings(nextRatings);
  }, [teams, baseRatings, groups, playoffMatches]);

  const groupMatches = groups.flatMap((group) => group.matches);
  const bracketSize = getBracketSize(groups);
  const initialRound = getRoundForSize(bracketSize);

  const buildSeeding = (size: number) => {
    if (size === 0) return [];
    const overallStats = calculateOverallStats(groups);
    const groupStats = groups.map((group) => calculateGroupStats(group));

    if (playoffSeeding === "overall") {
      return overallStats.slice(0, size).map((s) => s.team);
    }

    if (playoffSeeding === "ratings") {
      return [...teams]
        .sort((a, b) => (baseRatings[b.id] ?? DEFAULT_RATING) - (baseRatings[a.id] ?? DEFAULT_RATING))
        .slice(0, size);
    }

    if (playoffSeeding === "random") {
      const pool = overallStats.slice(0, size).map((s) => s.team);
      return shuffle(pool);
    }

    const perGroup = Math.max(1, Math.floor(size / groupStats.length));
    const selected: Team[] = [];
    const selectedIds = new Set<string>();
    groupStats.forEach((stats) => {
      stats.slice(0, perGroup).forEach((s) => {
        selected.push(s.team);
        selectedIds.add(s.team.id);
      });
    });

    if (selected.length < size) {
      const remaining = overallStats.filter((s) => !selectedIds.has(s.team.id));
      remaining.slice(0, size - selected.length).forEach((s) => {
        selected.push(s.team);
        selectedIds.add(s.team.id);
      });
    }

    return selected.slice(0, size);
  };

  const buildCrossGroupPairs = (seeded: Team[]) => {
    if (groups.length !== 2) return null;
    if (seeded.length % 2 !== 0) return null;
    const perGroup = Math.floor(seeded.length / 2);
    if (perGroup === 0) return null;
    const seededIds = new Set(seeded.map((team) => team.id));
    const groupStats = groups.map((group) =>
      calculateGroupStats(group).filter((stat) => seededIds.has(stat.teamId))
    );
    if (groupStats.some((stats) => stats.length < perGroup)) return null;
    const groupA = groupStats[0].slice(0, perGroup).map((stat) => stat.team);
    const groupB = groupStats[1].slice(0, perGroup).map((stat) => stat.team);
    return groupA.map((team, index) => [team, groupB[perGroup - 1 - index]] as const);
  };

  const buildSeededPairs = (seeded: Team[]) => {
    const pairs: Array<[Team, Team]> = [];
    const total = seeded.length;
    const count = total / 2;
    for (let i = 0; i < count; i += 1) {
      pairs.push([seeded[i], seeded[total - 1 - i]]);
    }
    return pairs;
  };

  const buildSequentialPairs = (seeded: Team[]) => {
    const pairs: Array<[Team, Team]> = [];
    for (let i = 0; i < seeded.length; i += 2) {
      if (!seeded[i + 1]) break;
      pairs.push([seeded[i], seeded[i + 1]]);
    }
    return pairs;
  };

  const buildRoundMatches = (
    round: MatchRound,
    seeded: Team[],
    rule: PlayoffBracketRule = "seeded"
  ) => {
    let pairs: Array<[Team, Team]> = [];
    if (rule === "random") {
      pairs = buildSequentialPairs(shuffle(seeded));
    } else if (rule === "cross") {
      const crossPairs = buildCrossGroupPairs(seeded);
      pairs = crossPairs ?? buildSeededPairs(seeded);
    } else {
      pairs = buildSeededPairs(seeded);
    }

    return pairs.map(([home, away], index) => ({
      id: `PO-${round}-${index + 1}`,
      home,
      away,
      date: "",
      overtime: false,
      shootout: false,
      stage: "playoff",
      round,
    }));
  };

  const buildNextRoundFromWinners = (round: MatchRound, matches: Match[]) => {
    const winners = matches.map((match) =>
      (match.homeScore ?? 0) > (match.awayScore ?? 0) ? match.home : match.away
    );
    return buildRoundMatches(round, winners, "seeded");
  };

  const buildThirdPlaceMatch = (matches: Match[]): Match[] => {
    if (matches.length < 2) return [];
    const losers = matches.map((match) =>
      (match.homeScore ?? 0) > (match.awayScore ?? 0) ? match.away : match.home
    );
    const match: Match = {
      id: "PO-3P-1",
      home: losers[0],
      away: losers[1],
      date: "",
      overtime: false,
      shootout: false,
      stage: "playoff",
      round: "3P",
    };
    return [match];
  };

  const groupStageComplete =
    groupMatches.length > 0 &&
    groupMatches.every((match) => match.homeScore !== undefined && match.awayScore !== undefined);

  useEffect(() => {
    if (!isTournamentCreated) return;
    if (!groupStageComplete) return;
    if (bracketSize < 4 || !initialRound) {
      if (playoffMatches.length > 0) {
        setPlayoffMatches([]);
      }
      return;
    }
    if (playoffMatches.length === 0) {
      const seeded = buildSeeding(bracketSize);
      const roundMatches = buildRoundMatches(initialRound, seeded, playoffBracketRule);
      const lastDay = getLastScheduledDay(groupMatches);
      const startDate =
        lastDay !== null ? new Date((lastDay + 1) * 24 * 60 * 60 * 1000) : getTournamentStartDate();
      const scheduled = assignMatchDates(roundMatches, startDate, groupMatches);
      setPlayoffMatches(scheduled);
    }
  }, [
    isTournamentCreated,
    groupStageComplete,
    bracketSize,
    initialRound,
    playoffMatches.length,
    playoffSeeding,
    playoffBracketRule,
    groups,
    baseRatings,
    teams,
  ]);

  useEffect(() => {
    if (!isTournamentCreated) return;
    if (playoffMatches.length === 0) return;

    const roundMatches = (round: MatchRound) =>
      playoffMatches.filter((match) => match.round === round);

    const isRoundComplete = (round: MatchRound) => {
      const matches = roundMatches(round);
      if (matches.length === 0) return false;
      return matches.every((match) => match.homeScore !== undefined && match.awayScore !== undefined);
    };

    const lastDay = getLastScheduledDay([...groupMatches, ...playoffMatches]);
    const nextStartDate =
      lastDay !== null ? new Date((lastDay + 1) * 24 * 60 * 60 * 1000) : getTournamentStartDate();

    if (roundMatches("R16").length > 0 && isRoundComplete("R16") && roundMatches("QF").length === 0) {
      const nextRoundMatches = buildNextRoundFromWinners("QF", roundMatches("R16"));
      const scheduled = assignMatchDates(nextRoundMatches, nextStartDate, [
        ...groupMatches,
        ...playoffMatches,
      ]);
      setPlayoffMatches((prev) => [...prev, ...scheduled]);
      return;
    }

    if (roundMatches("QF").length > 0 && isRoundComplete("QF") && roundMatches("SF").length === 0) {
      const nextRoundMatches = buildNextRoundFromWinners("SF", roundMatches("QF"));
      const scheduled = assignMatchDates(nextRoundMatches, nextStartDate, [
        ...groupMatches,
        ...playoffMatches,
      ]);
      setPlayoffMatches((prev) => [...prev, ...scheduled]);
      return;
    }

    if (roundMatches("SF").length > 0 && isRoundComplete("SF")) {
      const hasFinal = roundMatches("F").length > 0;
      const hasThird = roundMatches("3P").length > 0;
      if (!hasFinal) {
        const finalMatches = buildNextRoundFromWinners("F", roundMatches("SF"));
        const scheduledFinal = assignMatchDates(finalMatches, nextStartDate, [
          ...groupMatches,
          ...playoffMatches,
        ]);
        setPlayoffMatches((prev) => [...prev, ...scheduledFinal]);
      }
      if (!hasThird) {
        const thirdPlace = buildThirdPlaceMatch(roundMatches("SF"));
        if (thirdPlace.length > 0) {
          const scheduledThird = assignMatchDates(thirdPlace, nextStartDate, [
            ...groupMatches,
            ...playoffMatches,
          ]);
          setPlayoffMatches((prev) => [...prev, ...scheduledThird]);
        }
      }
    }
  }, [isTournamentCreated, playoffMatches, groupMatches]);

  const updateMatchById = (matchId: string, updates: Partial<Match>) => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        matches: group.matches.map((match) =>
          match.id === matchId ? { ...match, ...updates } : match
        ),
      }))
    );
    setPlayoffMatches((prev) =>
      prev.map((match) => (match.id === matchId ? { ...match, ...updates } : match))
    );
  };

  const playoffRequired = bracketSize >= 4;
  const playoffComplete = !playoffRequired
    ? true
    : playoffMatches.length > 0 &&
      playoffMatches.every((match) => match.homeScore !== undefined && match.awayScore !== undefined) &&
      playoffMatches.some((match) => match.round === "F");
  const tournamentComplete = groupStageComplete && playoffComplete;

  useEffect(() => {
    if (!isTournamentCreated) return;
    if (!tournamentComplete) return;
    if (ratingsCommitted) return;
    if (ratings.length === 0) return;
    commitRatingsAsBase(ratings);
    setRatingsCommitted(true);
  }, [isTournamentCreated, tournamentComplete, ratingsCommitted, ratings]);

  const tabs = [
    { id: "tournament", label: "Турнир", disabled: false },
    { id: "calendar", label: "Расписание игр", disabled: !isTournamentCreated },
    { id: "standings", label: "Таблица", disabled: !isTournamentCreated },
    { id: "playoff", label: "Плей-офф", disabled: !isTournamentCreated || !playoffRequired },
    { id: "rating", label: "Рейтинг команд", disabled: false },
  ] as const;

  const displayBaseRanks =
    Object.keys(tournamentBaseRanks).length > 0 ? tournamentBaseRanks : buildRankMap(baseRatings);
  
  return (
    <UiRoot>
      <Box p={4} maxW="1120px" mx="auto">
      <Heading
        mb={4}
        cursor="pointer"
        onClick={() => setIsEditingTitle(true)}
      >
        {tournamentName.trim() || "IIHF турнир"}
      </Heading>
      <Box mb={4}>
        <UiTabs>
          {tabs.map((tab) => (
            <UiTab
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={tab.disabled}
            >
              {tab.label}
            </UiTab>
          ))}
        </UiTabs>
      </Box>
      {teamsLoading && <Text mb={4}>Загрузка команд...</Text>}
      {teamsError && <Text mb={4} color="red.500">{teamsError}</Text>}
      {activeTab === "tournament" && (
        <>
          <Box mb={4} borderWidth={1} borderRadius="md" p={3}>
            <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Text fontWeight="bold" mb={1}>Данные турнира</Text>
                {isEditingTitle ? (
                  <Input
                    size="sm"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setIsEditingTitle(false);
                    }}
                    maxW="240px"
                    autoFocus
                  />
                ) : (
                  <Text
                    fontSize="sm"
                    color="gray.600"
                    cursor="pointer"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {tournamentName.trim() || "Нажмите, чтобы задать название"}
                  </Text>
                )}
              </Box>
              <Box display="flex" gap={1} alignItems="center">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleSaveTournament}
                  disabled={!isTournamentCreated}
                  aria-label="Сохранить"
                >
                  💾
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleExportSave}
                  disabled={!isTournamentCreated}
                  aria-label="Экспорт"
                >
                  ⬇
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Импорт"
                >
                  ⬆
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    handleImportSave(file);
                    e.currentTarget.value = "";
                  }}
                />
              </Box>
            </Box>
          </Box>

          <Box
            mb={4}
            borderWidth={1}
            borderRadius="md"
            p={3}
            borderStyle={isImportDrag ? "dashed" : "solid"}
            borderColor={isImportDrag ? "blue.400" : "gray.200"}
            background={isImportDrag ? "blue.50" : "white"}
            onDragOver={(e) => {
              e.preventDefault();
              setIsImportDrag(true);
            }}
            onDragLeave={() => setIsImportDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsImportDrag(false);
              const file = e.dataTransfer.files?.[0] ?? null;
              handleImportSave(file);
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Text fontWeight="bold">Сохранения</Text>
              <Text fontSize="xs" color="gray.500">
                Перетащите файл сюда для импорта
              </Text>
            </Box>
            {savedTournaments.length === 0 && (
              <Text fontSize="sm" color="gray.500">Пока нет сохранений.</Text>
            )}
            {savedTournaments.map((save) => (
              <Box
                key={save.id}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                borderTopWidth={1}
                py={2}
                gap={2}
              >
                {editingSaveId === save.id ? (
                  <>
                    <Input
                      size="sm"
                      value={editingSaveName}
                      onChange={(e) => setEditingSaveName(e.target.value)}
                      maxW="240px"
                    />
                    <Box display="flex" gap={2}>
                      <Button size="xs" onClick={handleApplyRenameSave}>Ок</Button>
                      <Button size="xs" variant="outline" onClick={handleCancelRenameSave}>Отмена</Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <Box>
                      <Text fontWeight="bold">{save.name}</Text>
                      <Text fontSize="xs" color="gray.500">
                        {new Date(save.savedAt).toLocaleString("ru-RU")}
                      </Text>
                    </Box>
                    <Box display="flex" gap={1} alignItems="center">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleLoadTournament(save)}
                        aria-label="Загрузить"
                      >
                        ⏎
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleStartRenameSave(save)}
                        aria-label="Редактировать"
                      >
                        ✎
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleDeleteSave(save.id)}
                        aria-label="Удалить"
                      >
                        ✕
                      </Button>
                    </Box>
                  </>
                )}
              </Box>
            ))}
          </Box>

          {!isTournamentCreated && (
            <>
              <TournamentSetup teams={teams} onCreate={handleCreateGroups} />
              {groups.length > 0 && teams.length > 0 && (
                <>
                  <GroupEditor
                    groups={groups}
                    setGroups={setGroups}
                    allTeams={teams}
                    unassigned={unassigned}
                    setUnassigned={setUnassigned}
                    playerTeamIds={playerTeamIds}
                    onTogglePlayerTeam={togglePlayerTeam}
                    maxTeamsPerGroup={teamsPerGroupLimit}
                  />
                  <Box mb={4}>
                    <Text fontSize="sm" color="gray.600">
                      Клик по карточке команды — выделить “свою” команду.
                    </Text>
                    <Button size="xs" mt={2} variant="outline" onClick={() => setPlayerTeamIds([])}>
                      Сбросить выбор
                    </Button>
                  </Box>
                  <Box mb={4} display="flex" gap={3} flexWrap="wrap" alignItems="center">
                    <label>
                      <select
                        value={playoffSeeding}
                        onChange={(e) => setPlayoffSeeding(e.target.value as PlayoffSeeding)}
                        style={{ width: "260px" }}
                      >
                        <option value="overall">Общий рейтинг групп</option>
                        <option value="byGroup">Топ по группам + лучшие</option>
                        <option value="ratings">По историческому рейтингу</option>
                        <option value="random">Случайная сетка</option>
                      </select>
                    </label>
                    <label>
                      <select
                        value={playoffBracketRule}
                        onChange={(e) =>
                          setPlayoffBracketRule(e.target.value as PlayoffBracketRule)
                        }
                        style={{ width: "260px" }}
                      >
                        <option value="seeded">Классическая (1-8, 2-7...)</option>
                        <option value="cross">Кросс-группы (A1-B4...)</option>
                        <option value="random">Случайные пары</option>
                      </select>
                    </label>
                    <Text fontSize="sm" color="gray.500">
                      Размер сетки: {bracketSize >= 4 ? bracketSize : "плей-офф не будет"}
                    </Text>
                  </Box>
                  <Button mb={2} size="sm" colorScheme="blue" onClick={handleCreateTournament}>
                    Создать турнир
                  </Button>
                </>
              )}
            </>
          )}
          {isTournamentCreated && (
            <>
              <Button mb={2} size="sm" variant="outline" onClick={handleEditTournament}>
                Редактировать турнир
              </Button>
              <Button mb={4} size="sm" colorScheme="red" onClick={handleNewTournament}>
                Новый турнир
              </Button>
              {tournamentComplete ? (
                <Text color="green.600">Турнир завершён. Рейтинг обновлён.</Text>
              ) : (
                <Text color="gray.600">Турнир создан. Перейдите в "Расписание игр", чтобы управлять матчами.</Text>
              )}
            </>
          )}
        </>
      )}

      {activeTab === "calendar" && isTournamentCreated && (
        <>
          <Calendar
            groups={groups}
            playoffMatches={playoffMatches}
            onUpdateMatch={updateMatchById}
            playerTeamIds={playerTeamIds}
          />
        </>
      )}

      {activeTab === "calendar" && !isTournamentCreated && (
        <Text color="gray.600">Создайте турнир сначала.</Text>
      )}

      {activeTab === "standings" && isTournamentCreated && (
        <StandingsTable groups={groups} playerTeamIds={playerTeamIds} />
      )}

      {activeTab === "standings" && !isTournamentCreated && (
        <Text color="gray.600">Создайте турнир сначала.</Text>
      )}

      {activeTab === "playoff" && isTournamentCreated && (
        <>
          {playoffRequired ? (
            <PlayoffBracket matches={playoffMatches} playerTeamIds={playerTeamIds} />
          ) : (
            <Text color="gray.600">Плей-офф не проводится для текущего количества команд.</Text>
          )}
        </>
      )}

      {activeTab === "playoff" && !isTournamentCreated && (
        <Text color="gray.600">Создайте турнир сначала.</Text>
      )}

      {activeTab === "rating" && (
        <>
          <Button mb={4} size="sm" variant="outline" onClick={handleResetRatings}>
            Сбросить рейтинг к дефолтному
          </Button>
          <RatingTable ratings={ratings} baseRanks={displayBaseRanks} playerTeamIds={playerTeamIds} />
        </>
      )}
      </Box>
    </UiRoot>
  );
}

export default App;
