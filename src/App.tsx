import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Input, Text } from "@chakra-ui/react";
import TournamentSetup from "./components/TournamentSetup";
import GroupEditor from "./components/GroupEditor";
import Calendar from "./components/Calendar";
import StandingsTable from "./components/StandingsTable";
import RatingTable from "./components/RatingTable";
import PlayoffBracket from "./components/PlayoffBracket";
import Flag from "./components/Flag";
import FederationLogo from "./components/FederationLogo";
import { IconButton, StatCard, UiRoot } from "./ui";
import {
  FiDownload,
  FiEdit2,
  FiFolder,
  FiPlus,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { Group, Match, MatchRound, PodiumCounts, Team } from "./types";
import { fetchCountries } from "./api";
import {
  applyMatchesToGroups,
  assignMatchDates,
  generateGroupMatches,
  getLastScheduledDay,
  getTournamentStartDate,
} from "./scheduling";
import { calculateGroupStats, calculateOverallStats } from "./standings";

const SELECTED_TEAM_KEY = "iihfSelectedTeam";
const RATINGS_STORAGE_KEY = "iihfRatings";
const RATINGS_DELTA_KEY = "iihfRatingDelta";
const PODIUM_STORAGE_KEY = "iihfPodium";
const PODIUM_VERSION_KEY = "iihfPodiumVersion";
const PODIUM_VERSION = "4";
const SAVES_STORAGE_KEY = "iihfTournamentSaves";
const AUTO_SAVE_KEY = "iihfCurrentTournament";
const DEFAULT_RATING = 1500;

type PlayoffSeeding = "overall" | "byGroup" | "random" | "ratings";
type PlayoffBracketRule = "seeded" | "cross" | "random";

interface TournamentSaveData {
  saveId?: string | null;
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
  tournamentBaseRatings: Record<string, number>;
  ratingsCommitted: boolean;
}

const emptyPodium = (): PodiumCounts => ({
  gold: 0,
  silver: 0,
  bronze: 0,
  finals: 0,
});

const mergePodium = (
  base: Record<string, PodiumCounts>,
  add: Record<string, PodiumCounts>
) => {
  const next: Record<string, PodiumCounts> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(add)]);
  keys.forEach((id) => {
    const a = base[id] ?? emptyPodium();
    const b = add[id] ?? emptyPodium();
    next[id] = {
      gold: a.gold + b.gold,
      silver: a.silver + b.silver,
      bronze: a.bronze + b.bronze,
      finals: a.finals + b.finals,
    };
  });
  return next;
};

const resolvePodiumBase = (
  fallback: Record<string, PodiumCounts>,
  stored: Record<string, PodiumCounts>
) => {
  const next: Record<string, PodiumCounts> = {};
  const keys = new Set([...Object.keys(fallback), ...Object.keys(stored)]);
  keys.forEach((id) => {
    const base = fallback[id] ?? emptyPodium();
    const saved = stored[id];
    if (!saved) {
      next[id] = base;
      return;
    }
    next[id] = {
      gold: Math.max(saved.gold ?? 0, base.gold),
      silver: Math.max(saved.silver ?? 0, base.silver),
      bronze: Math.max(saved.bronze ?? 0, base.bronze),
      finals: Math.max(saved.finals ?? 0, base.finals),
    };
  });
  return next;
};

const isPlayedMatch = (match: Match) =>
  match.homeScore !== undefined && match.awayScore !== undefined;

const buildPodiumDeltaFromPlayoffMatches = (playoffMatches: Match[]) => {
  const finalMatch = playoffMatches.find(
    (match) => match.round === "F" && isPlayedMatch(match)
  );
  if (!finalMatch) return {};

  const resolveWinner = (match: Match) =>
    isPlayedMatch(match)
      ? (match.homeScore ?? 0) >= (match.awayScore ?? 0)
        ? match.home
        : match.away
      : null;
  const resolveLoser = (match: Match) =>
    isPlayedMatch(match)
      ? (match.homeScore ?? 0) >= (match.awayScore ?? 0)
        ? match.away
        : match.home
      : null;

  const delta: Record<string, PodiumCounts> = {};
  const bump = (teamId: string, changes: Partial<PodiumCounts>) => {
    const current = delta[teamId] ?? emptyPodium();
    delta[teamId] = {
      gold: current.gold + (changes.gold ?? 0),
      silver: current.silver + (changes.silver ?? 0),
      bronze: current.bronze + (changes.bronze ?? 0),
      finals: current.finals + (changes.finals ?? 0),
    };
  };

  const winner = resolveWinner(finalMatch);
  const loser = resolveLoser(finalMatch);
  if (winner && loser) {
    bump(winner.id, { gold: 1, finals: 1 });
    bump(loser.id, { silver: 1, finals: 1 });
  }

  const thirdMatch = playoffMatches.find(
    (match) => match.round === "3P" && isPlayedMatch(match)
  );
  if (thirdMatch) {
    const bronzeWinner = resolveWinner(thirdMatch);
    if (bronzeWinner) {
      bump(bronzeWinner.id, { bronze: 1 });
    }
  }
  return delta;
};

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

const buildTournamentRatingsMap = (
  teams: Team[],
  baseRatings: Record<string, number>,
  groups: Group[],
  playoffMatches: Match[]
) => {
  const ratingsMap = new Map<string, number>();
  teams.forEach((team) => {
    ratingsMap.set(team.id, baseRatings[team.id] ?? DEFAULT_RATING);
  });

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

  groups.forEach((group) => {
    group.matches.forEach((match) => applyMatch(match));
  });
  playoffMatches.forEach((match) => applyMatch(match));

  return ratingsMap;
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const FIRST_TOURNAMENT_YEAR = 2025;

const extractTournamentYear = (value: string) => {
  const match = value.match(/IIHF\s+(\d{4})/i);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
};

const getNextTournamentName = (
  saves: TournamentSave[],
  currentTournamentName = ""
) => {
  let maxYear = FIRST_TOURNAMENT_YEAR - 1;
  const currentYear = extractTournamentYear(currentTournamentName);
  if (currentYear) maxYear = Math.max(maxYear, currentYear);
  saves.forEach((save) => {
    const fromSaveName = extractTournamentYear(save.name);
    const fromDataName = extractTournamentYear(save.data?.tournamentName ?? "");
    if (fromSaveName) maxYear = Math.max(maxYear, fromSaveName);
    if (fromDataName) maxYear = Math.max(maxYear, fromDataName);
  });
  return `IIHF ${maxYear + 1}`;
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
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [defaultRatings, setDefaultRatings] = useState<Record<string, number>>({});
  const [baseRatings, setBaseRatings] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Array<Team & { rating: number }>>([]);
  const [ratingDeltas, setRatingDeltas] = useState<Record<string, number>>({});
  const [defaultPodiumBase, setDefaultPodiumBase] = useState<Record<string, PodiumCounts>>({});
  const [podiumBase, setPodiumBase] = useState<Record<string, PodiumCounts>>({});
  const [tournamentBaseRanks, setTournamentBaseRanks] = useState<Record<string, number>>({});
  const [tournamentBaseRatings, setTournamentBaseRatings] = useState<Record<string, number>>({});
  const [ratingsCommitted, setRatingsCommitted] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [savedTournaments, setSavedTournaments] = useState<TournamentSave[]>([]);
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null);
  const [editingSaveId, setEditingSaveId] = useState<string | null>(null);
  const [editingSaveName, setEditingSaveName] = useState("");
  const [isImportDrag, setIsImportDrag] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [showFinalScreen, setShowFinalScreen] = useState(false);
  const [ratingAnimationKey, setRatingAnimationKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAutoSaveRef = useRef<Partial<TournamentSaveData> | null>(null);

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

        const storedVersion = localStorage.getItem(PODIUM_VERSION_KEY);
        if (storedVersion !== PODIUM_VERSION) {
          localStorage.removeItem(PODIUM_STORAGE_KEY);
          localStorage.setItem(PODIUM_VERSION_KEY, PODIUM_VERSION);
        }
        const podiumRaw = localStorage.getItem(PODIUM_STORAGE_KEY);
        let storedPodiums: Record<string, PodiumCounts> = {};
        if (podiumRaw) {
          try {
            storedPodiums = JSON.parse(podiumRaw) as Record<string, PodiumCounts>;
          } catch {
            storedPodiums = {};
          }
        }

        const entries = Object.entries(data).map(([code, info]) => ({
          code,
          name: info.name,
          rating: stored[code] ?? info.rating_points,
          ovr: info.ovr,
        }));

        const deltaRaw = localStorage.getItem(RATINGS_DELTA_KEY);
        let storedDeltas: Record<string, number> = {};
        if (deltaRaw) {
          try {
            storedDeltas = JSON.parse(deltaRaw) as Record<string, number>;
          } catch {
            storedDeltas = {};
          }
        }
        setRatingDeltas(storedDeltas);

        const defaults: Record<string, number> = {};
        Object.entries(data).forEach(([code, info]) => {
          defaults[code] = info.rating_points;
        });
        setDefaultRatings(defaults);

        const fallbackPodiums: Record<string, PodiumCounts> = {};
        Object.entries(data).forEach(([code, info]) => {
          const base = info.podiums ?? emptyPodium();
          fallbackPodiums[code] = {
            gold: base.gold ?? 0,
            silver: base.silver ?? 0,
            bronze: base.bronze ?? 0,
            finals:
              typeof base.finals === "number"
                ? base.finals
                : (base.gold ?? 0) + (base.silver ?? 0),
          };
        });
        setDefaultPodiumBase(fallbackPodiums);
        setPodiumBase(resolvePodiumBase(fallbackPodiums, storedPodiums));

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
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<TournamentSaveData>;
      pendingAutoSaveRef.current = parsed;
    } catch {
      pendingAutoSaveRef.current = null;
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

  const overallStats = useMemo(() => calculateOverallStats(groups), [groups]);
  const groupStats = useMemo(
    () => groups.map((group) => calculateGroupStats(group)),
    [groups]
  );

  useEffect(() => {
    if (teams.length === 0) return;
    if (selectedTeamId && teams.some((team) => team.id === selectedTeamId)) {
      return;
    }
    const stored = localStorage.getItem(SELECTED_TEAM_KEY);
    if (stored && teams.some((team) => team.id === stored)) {
      setSelectedTeamId(stored);
      return;
    }
    const preferred = overallStats[0]?.team?.id ?? teams[0]?.id ?? null;
    if (preferred) {
      setSelectedTeamId(preferred);
    }
  }, [teams, overallStats, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) return;
    localStorage.setItem(SELECTED_TEAM_KEY, selectedTeamId);
  }, [selectedTeamId]);

  const handleCreateGroups = (
    newGroups: Group[],
    unassignedTeams: Team[],
    teamsPerGroup: number
  ) => {
    setGroups(newGroups);
    setUnassigned(unassignedTeams);
    setTeamsPerGroupLimit(teamsPerGroup);
    setIsTournamentCreated(false);
    setPlayoffMatches([]);
    setRatingsCommitted(false);
    setTournamentBaseRatings({});
    setShowFinalScreen(false);
  };

  const resetTournamentState = (clearName = false) => {
    setGroups([]);
    setUnassigned(teams);
    setPlayoffMatches([]);
    setIsTournamentCreated(false);
    setRatingsCommitted(false);
    setPlayerTeamIds([]);
    setTournamentBaseRanks({});
    setTournamentBaseRatings({});
    setActiveSaveId(null);
    setShowFinalScreen(false);
    if (clearName) setTournamentName("");
    localStorage.removeItem(AUTO_SAVE_KEY);
  };

  const handleCreateTournament = () => {
    if (groups.length === 0) return;
    if (!tournamentName.trim()) {
      setTournamentName(getNextTournamentName(savedTournaments, tournamentName));
    }
    const rawMatches = generateGroupMatches(groups);
    const scheduledMatches = assignMatchDates(rawMatches, getTournamentStartDate());
    const scheduledGroups = applyMatchesToGroups(groups, scheduledMatches);
    setGroups(scheduledGroups);
    setPlayoffMatches([]);
    setIsTournamentCreated(true);
    setTournamentBaseRanks(buildRankMap(baseRatings));
    setTournamentBaseRatings({ ...baseRatings });
    setRatingsCommitted(false);
    setActiveSaveId(null);
    setIsSetupOpen(false);
    setShowFinalScreen(false);
  };

  const handleOpenSetup = () => {
    if (!isTournamentCreated || !tournamentName.trim()) {
      setTournamentName(getNextTournamentName(savedTournaments, tournamentName));
    }
    setIsSetupOpen(true);
  };

  const handleCloseSetup = () => {
    setIsSetupOpen(false);
  };


  const buildSaveData = (): TournamentSaveData => ({
    saveId: activeSaveId,
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
    tournamentBaseRatings,
    ratingsCommitted,
  });

  const persistSaves = (next: TournamentSave[]) => {
    setSavedTournaments(next);
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(next));
  };

  const applySaveData = (data: Partial<TournamentSaveData>) => {
    setActiveSaveId(data.saveId ?? null);
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
    setTournamentBaseRatings(data.tournamentBaseRatings ?? {});
    setRatingsCommitted(!!data.ratingsCommitted);
  };

  useEffect(() => {
    if (Object.keys(baseRatings).length === 0) return;
    if (!pendingAutoSaveRef.current) return;
    applySaveData(pendingAutoSaveRef.current);
    pendingAutoSaveRef.current = null;
  }, [baseRatings]);

  useEffect(() => {
    if (teams.length === 0) return;
    const data = buildSaveData();
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
  }, [
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
    tournamentBaseRatings,
    ratingsCommitted,
    teams.length,
  ]);

  const handleSaveTournament = () => {
    if (!isTournamentCreated) return;
    const id =
      activeSaveId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `save-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const name =
      tournamentName?.trim() ||
      getNextTournamentName(savedTournaments, tournamentName);
    const data = { ...buildSaveData(), saveId: id };
    const save: TournamentSave = {
      id,
      name,
      savedAt: new Date().toISOString(),
      data,
    };
    persistSaves([save, ...savedTournaments.filter((entry) => entry.id !== id)]);
    setActiveSaveId(id);
  };

  const handleLoadTournament = (save: TournamentSave) => {
    applySaveData(save.data);
    setActiveSaveId(save.id);
    setIsSetupOpen(false);
    setShowFinalScreen(false);
  };

  const handleDeleteSave = (saveId: string) => {
    const next = savedTournaments.filter((save) => save.id !== saveId);
    persistSaves(next);
    if (activeSaveId === saveId) {
      setActiveSaveId(null);
    }
    handleRebuildRatingsFromSaves(next);
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
      const parsed = JSON.parse(text) as unknown;
      let data: Partial<TournamentSaveData> | null = null;
      if (parsed && typeof parsed === "object" && "data" in parsed) {
        const maybe = (parsed as { data?: TournamentSaveData }).data;
        if (maybe) data = maybe;
      } else if (parsed && typeof parsed === "object") {
        data = parsed as Partial<TournamentSaveData>;
      }
      if (data) {
        applySaveData(data);
        setActiveSaveId(null);
      }
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

  const triggerRatingTableAnimation = () => {
    setRatingAnimationKey((prev) => prev + 1);
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

  const handleRebuildRatingsFromSaves = (saves: TournamentSave[] = savedTournaments) => {
    if (
      teams.length === 0 ||
      Object.keys(defaultRatings).length === 0 ||
      Object.keys(defaultPodiumBase).length === 0
    ) {
      return;
    }
    const ordered = [...saves].sort(
      (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
    );
    let nextRatings = { ...defaultRatings };
    let nextPodium = { ...defaultPodiumBase };

    ordered.forEach((save) => {
      const data = save.data;
      if (!data?.ratingsCommitted) return;
      const map = buildTournamentRatingsMap(
        teams,
        nextRatings,
        data.groups ?? [],
        data.playoffMatches ?? []
      );
      const merged: Record<string, number> = {};
      teams.forEach((team) => {
        merged[team.id] = Math.round(
          map.get(team.id) ?? nextRatings[team.id] ?? DEFAULT_RATING
        );
      });
      nextRatings = merged;
      nextPodium = mergePodium(
        nextPodium,
        buildPodiumDeltaFromPlayoffMatches(data.playoffMatches ?? [])
      );
    });

    const nextDeltas: Record<string, number> = {};
    teams.forEach((team) => {
      const base = defaultRatings[team.id] ?? DEFAULT_RATING;
      const current = nextRatings[team.id] ?? base;
      const delta = Math.round(current - base);
      if (delta !== 0) {
        nextDeltas[team.id] = delta;
      }
    });

    setRatingDeltas(nextDeltas);
    localStorage.setItem(RATINGS_DELTA_KEY, JSON.stringify(nextDeltas));
    setBaseRatings(nextRatings);
    localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(nextRatings));
    setTournamentBaseRanks(buildRankMap(nextRatings));
    applyRatingsToTeams(nextRatings);
    setPodiumBase(nextPodium);
    localStorage.setItem(PODIUM_STORAGE_KEY, JSON.stringify(nextPodium));
    localStorage.setItem(PODIUM_VERSION_KEY, PODIUM_VERSION);
    triggerRatingTableAnimation();
  };


  const handleResetRatings = () => {
    setBaseRatings(defaultRatings);
    localStorage.removeItem(RATINGS_STORAGE_KEY);
    localStorage.removeItem(RATINGS_DELTA_KEY);
    setRatingDeltas({});
    setTournamentBaseRanks(buildRankMap(defaultRatings));
    applyRatingsToTeams(defaultRatings);
    setPodiumBase(defaultPodiumBase);
    localStorage.setItem(PODIUM_STORAGE_KEY, JSON.stringify(defaultPodiumBase));
    localStorage.setItem(PODIUM_VERSION_KEY, PODIUM_VERSION);
    setRatingsCommitted(false);
    triggerRatingTableAnimation();
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
    let ratingsMap = new Map<string, number>();
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

    if (tournamentCompleteLocal && !ratingsCommitted) {
      ratingsMap = buildTournamentRatingsMap(teams, baseRatings, groups, playoffMatches);
    }

    const nextRatings = teams
      .map((team) => ({
        ...team,
        rating: ratingsMap.get(team.id) ?? baseRatings[team.id] ?? DEFAULT_RATING,
      }))
      .sort((a, b) => b.rating - a.rating);
    setRatings(nextRatings);
  }, [teams, baseRatings, groups, playoffMatches, ratingsCommitted]);

  const groupMatches = useMemo(
    () => groups.flatMap((group) => group.matches),
    [groups]
  );
  const allMatches = useMemo(
    () => [...groupMatches, ...playoffMatches],
    [groupMatches, playoffMatches]
  );
  const historicalTeamStatsById = useMemo(() => {
    const stats: Record<
      string,
      {
        played: number;
        wins: number;
        losses: number;
        otGames: number;
        shootoutGames: number;
        form: Array<"W" | "L" | "T">;
      }
    > = {};
    const applyMatch = (match: Match, teamId: string, isHome: boolean) => {
      const current = stats[teamId] ?? {
        played: 0,
        wins: 0,
        losses: 0,
        otGames: 0,
        shootoutGames: 0,
        form: [],
      };
      const goalsFor = isHome ? match.homeScore ?? 0 : match.awayScore ?? 0;
      const goalsAgainst = isHome ? match.awayScore ?? 0 : match.homeScore ?? 0;
      if (goalsFor > goalsAgainst) {
        current.wins += 1;
        current.form.push("W");
      } else if (goalsFor < goalsAgainst) {
        current.losses += 1;
        current.form.push("L");
      } else {
        current.form.push("T");
      }
      current.played += 1;
      if (match.overtime) current.otGames += 1;
      if (match.shootout) current.shootoutGames += 1;
      stats[teamId] = current;
    };

    savedTournaments.forEach((save) => {
      if (save.id === activeSaveId) return;
      const data = save.data;
      if (!data?.ratingsCommitted) return;
      const saveMatches = [
        ...(data.groups ?? []).flatMap((group) => group.matches),
        ...(data.playoffMatches ?? []),
      ]
        .filter(isPlayedMatch)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      saveMatches.forEach((match) => {
        applyMatch(match, match.home.id, true);
        applyMatch(match, match.away.id, false);
      });
    });
    return stats;
  }, [savedTournaments, activeSaveId]);
  const bracketSize = useMemo(() => getBracketSize(groups), [groups]);
  const initialRound = useMemo(() => getRoundForSize(bracketSize), [bracketSize]);
  const participantTeams = useMemo(
    () =>
      Array.from(
        new Map(groups.flatMap((group) => group.teams).map((team) => [team.id, team])).values()
      ),
    [groups]
  );
  const participantCount = participantTeams.length;
  const groupCount = groups.length;
  const teamSummary = useMemo(() => {
    const fallbackTeam =
      teams.length > 0
        ? [...teams].sort(
            (a, b) => (b.ratingPoints ?? 0) - (a.ratingPoints ?? 0)
          )[0]
        : null;
    const selectedTeam =
      teams.find((team) => team.id === selectedTeamId) ??
      overallStats[0]?.team ??
      fallbackTeam;
    if (!selectedTeam) return null;
    const historical = historicalTeamStatsById[selectedTeam.id];
    const teamMatches = allMatches
      .filter(
        (match) =>
          (match.home.id === selectedTeam.id || match.away.id === selectedTeam.id) &&
          match.homeScore !== undefined &&
          match.awayScore !== undefined
      )
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let wins = historical?.wins ?? 0;
    let losses = historical?.losses ?? 0;
    let otGames = historical?.otGames ?? 0;
    let shootoutGames = historical?.shootoutGames ?? 0;
    const form: Array<"W" | "L" | "T"> = [...(historical?.form ?? [])];
    teamMatches.forEach((match) => {
      const isHome = match.home.id === selectedTeam.id;
      const goalsFor = isHome ? match.homeScore ?? 0 : match.awayScore ?? 0;
      const goalsAgainst = isHome ? match.awayScore ?? 0 : match.homeScore ?? 0;
      if (goalsFor > goalsAgainst) {
        wins += 1;
        form.push("W");
      } else if (goalsFor < goalsAgainst) {
        losses += 1;
        form.push("L");
      } else {
        form.push("T");
      }
      if (match.overtime) otGames += 1;
      if (match.shootout) shootoutGames += 1;
    });
    const played = (historical?.played ?? 0) + teamMatches.length;
    const winPct = played > 0 ? Math.round((wins / played) * 100) : 0;
    const last10 = form.slice(-10);
    return {
      team: selectedTeam,
      played,
      wins,
      losses,
      otGames,
      shootoutGames,
      winPct,
      last10,
    };
  }, [allMatches, overallStats, selectedTeamId, teams, historicalTeamStatsById]);

  const buildSeeding = (size: number) => {
    if (size === 0) return [];

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
    const filtered = groupStats.map((stats) =>
      stats.filter((stat) => seededIds.has(stat.teamId))
    );
    if (filtered.some((stats) => stats.length < perGroup)) return null;
    const groupA = filtered[0].slice(0, perGroup).map((stat) => stat.team);
    const groupB = filtered[1].slice(0, perGroup).map((stat) => stat.team);
    return groupA.map(
      (team, index) => [team, groupB[perGroup - 1 - index]] as [Team, Team]
    );
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
  ): Match[] => {
    let pairs: Array<[Team, Team]> = [];
    if (rule === "random") {
      pairs = buildSequentialPairs(shuffle(seeded));
    } else if (rule === "cross") {
      const crossPairs = buildCrossGroupPairs(seeded);
      pairs = crossPairs ?? buildSeededPairs(seeded);
    } else {
      pairs = buildSeededPairs(seeded);
    }

    return pairs.map(([home, away], index): Match => ({
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

  const groupStageComplete = useMemo(
    () =>
      groupMatches.length > 0 &&
      groupMatches.every(
        (match) => match.homeScore !== undefined && match.awayScore !== undefined
      ),
    [groupMatches]
  );

  const eliminatedTeamIds = useMemo(() => {
    const eliminated = new Set<string>();
    if (!isTournamentCreated) return eliminated;
    if (groupStageComplete && bracketSize >= 4) {
      const seeded = buildSeeding(bracketSize);
      const seededIds = new Set(seeded.map((team) => team.id));
      participantTeams.forEach((team) => {
        if (!seededIds.has(team.id)) eliminated.add(team.id);
      });
    }
    playoffMatches.forEach((match) => {
      if (match.homeScore === undefined || match.awayScore === undefined) return;
      if (match.homeScore === match.awayScore) return;
      const loser = match.homeScore > match.awayScore ? match.away : match.home;
      eliminated.add(loser.id);
    });
    return eliminated;
  }, [
    isTournamentCreated,
    groupStageComplete,
    bracketSize,
    participantTeams,
    playoffMatches,
  ]);

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

    const samePairs = (a: Match[], b: Match[]) => {
      if (a.length !== b.length) return false;
      return a.every(
        (match, index) =>
          match.home.id === b[index].home.id && match.away.id === b[index].away.id
      );
    };

    const attachDates = (nextMatches: Match[], existing: Match[]) => {
      if (existing.length === nextMatches.length && existing.every((m) => m.date)) {
        return nextMatches.map((match, index) => ({
          ...match,
          date: existing[index]?.date ?? match.date,
        }));
      }
      return nextMatches;
    };

    const lastDay = getLastScheduledDay([...groupMatches, ...playoffMatches]);
    const nextStartDate =
      lastDay !== null ? new Date((lastDay + 1) * 24 * 60 * 60 * 1000) : getTournamentStartDate();

    if (roundMatches("R16").length > 0 && isRoundComplete("R16")) {
      const nextRoundMatches = buildNextRoundFromWinners("QF", roundMatches("R16"));
      const existing = roundMatches("QF");
      if (existing.length === 0) {
        const scheduled = assignMatchDates(nextRoundMatches, nextStartDate, [
          ...groupMatches,
          ...playoffMatches,
        ]);
        setPlayoffMatches((prev) => [...prev, ...scheduled]);
        return;
      }
      if (!samePairs(nextRoundMatches, existing)) {
        const nextWithDates = attachDates(nextRoundMatches, existing);
        setPlayoffMatches((prev) => [
          ...prev.filter(
            (match) => !["QF", "SF", "F", "3P"].includes(match.round ?? "")
          ),
          ...nextWithDates,
        ]);
        return;
      }
    }

    if (roundMatches("QF").length > 0 && isRoundComplete("QF")) {
      const nextRoundMatches = buildNextRoundFromWinners("SF", roundMatches("QF"));
      const existing = roundMatches("SF");
      if (existing.length === 0) {
        const scheduled = assignMatchDates(nextRoundMatches, nextStartDate, [
          ...groupMatches,
          ...playoffMatches,
        ]);
        setPlayoffMatches((prev) => [...prev, ...scheduled]);
        return;
      }
      if (!samePairs(nextRoundMatches, existing)) {
        const nextWithDates = attachDates(nextRoundMatches, existing);
        setPlayoffMatches((prev) => [
          ...prev.filter((match) => !["SF", "F", "3P"].includes(match.round ?? "")),
          ...nextWithDates,
        ]);
        return;
      }
    }

    if (roundMatches("SF").length > 0 && isRoundComplete("SF")) {
      const finalMatches = buildNextRoundFromWinners("F", roundMatches("SF"));
      const thirdPlace = buildThirdPlaceMatch(roundMatches("SF"));
      const existingFinal = roundMatches("F");
      const existingThird = roundMatches("3P");
      const finalMismatch =
        (existingFinal.length === 0 && finalMatches.length > 0) ||
        (existingFinal.length > 0 && !samePairs(finalMatches, existingFinal));
      const thirdMismatch =
        (existingThird.length === 0 && thirdPlace.length > 0) ||
        (existingThird.length > 0 && !samePairs(thirdPlace, existingThird));

      if (finalMismatch || thirdMismatch) {
        const nextFinal = attachDates(finalMatches, existingFinal);
        const nextThird = attachDates(thirdPlace, existingThird);
        const scheduledFinal =
          nextFinal.length > 0
            ? assignMatchDates(nextFinal, nextStartDate, [...groupMatches, ...playoffMatches])
            : [];
        const scheduledThird =
          nextThird.length > 0
            ? assignMatchDates(nextThird, nextStartDate, [...groupMatches, ...playoffMatches])
            : [];
        setPlayoffMatches((prev) => [
          ...prev.filter((match) => !["F", "3P"].includes(match.round ?? "")),
          ...scheduledFinal,
          ...scheduledThird,
        ]);
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
    if (teams.length === 0) return;
    const finalRatingsMap = buildTournamentRatingsMap(teams, baseRatings, groups, playoffMatches);
    const finalRatings = teams
      .map((team) => ({
        ...team,
        rating: finalRatingsMap.get(team.id) ?? baseRatings[team.id] ?? DEFAULT_RATING,
      }))
      .sort((a, b) => b.rating - a.rating);

    setRatings(finalRatings);
    const deltaUpdates: Record<string, number> = {};
    finalRatings.forEach((team) => {
      const base =
        tournamentBaseRatings[team.id] ??
        baseRatings[team.id] ??
        team.rating;
      const delta = Math.round(team.rating - base);
      if (delta !== 0) {
        deltaUpdates[team.id] = (ratingDeltas[team.id] ?? 0) + delta;
      }
    });
    if (Object.keys(deltaUpdates).length > 0) {
      const next = { ...ratingDeltas, ...deltaUpdates };
      setRatingDeltas(next);
      localStorage.setItem(RATINGS_DELTA_KEY, JSON.stringify(next));
    }
    commitRatingsAsBase(finalRatings);
    const podiumDelta = playoffRequired
      ? buildPodiumDeltaFromPlayoffMatches(playoffMatches)
      : {};
    if (Object.keys(podiumDelta).length > 0) {
      setPodiumBase((prev) => {
        const next = mergePodium(prev, podiumDelta);
        localStorage.setItem(PODIUM_STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(PODIUM_VERSION_KEY, PODIUM_VERSION);
        return next;
      });
    }
    triggerRatingTableAnimation();
    setRatingsCommitted(true);
  }, [
    isTournamentCreated,
    tournamentComplete,
    ratingsCommitted,
    teams,
    groups,
    ratingDeltas,
    playoffRequired,
    playoffMatches,
    tournamentBaseRatings,
    baseRatings,
  ]);

  useEffect(() => {
    if (tournamentComplete) {
      setShowFinalScreen(true);
    }
  }, [tournamentComplete]);

  const ratingById = useMemo(() => {
    const map = new Map<string, number>();
    ratings.forEach((team) => map.set(team.id, team.rating));
    return map;
  }, [ratings]);

  const finalPlacements = useMemo(() => {
    if (!tournamentComplete) return [];
    const finalMatch = playoffMatches.find(
      (match) =>
        match.round === "F" && match.homeScore !== undefined && match.awayScore !== undefined
    );
    if (!finalMatch) {
      const fallback = overallStats.slice(0, 4).map((stat) => stat.team);
      return fallback.map((team, index) => {
        const base =
          tournamentBaseRatings[team.id] ??
          baseRatings[team.id] ??
          ratingById.get(team.id) ??
          0;
        const current = ratingById.get(team.id) ?? base;
        return {
          place: index + 1,
          team,
          delta: Math.round(current - base),
          rating: Math.round(current),
        };
      });
    }
    const winner =
      (finalMatch.homeScore ?? 0) >= (finalMatch.awayScore ?? 0)
        ? finalMatch.home
        : finalMatch.away;
    const runnerUp =
      (finalMatch.homeScore ?? 0) >= (finalMatch.awayScore ?? 0)
        ? finalMatch.away
        : finalMatch.home;
    let third: Team | null = null;
    let fourth: Team | null = null;
    const thirdMatch = playoffMatches.find(
      (match) =>
        match.round === "3P" && match.homeScore !== undefined && match.awayScore !== undefined
    );
    if (thirdMatch) {
      third =
        (thirdMatch.homeScore ?? 0) >= (thirdMatch.awayScore ?? 0)
          ? thirdMatch.home
          : thirdMatch.away;
      fourth =
        (thirdMatch.homeScore ?? 0) >= (thirdMatch.awayScore ?? 0)
          ? thirdMatch.away
          : thirdMatch.home;
    } else {
      const sfMatches = playoffMatches.filter(
        (match) =>
          match.round === "SF" &&
          match.homeScore !== undefined &&
          match.awayScore !== undefined
      );
      if (sfMatches.length >= 2) {
        const losers = sfMatches.map((match) =>
          (match.homeScore ?? 0) >= (match.awayScore ?? 0) ? match.away : match.home
        );
        third = losers[0];
        fourth = losers[1];
      }
    }
    return [winner, runnerUp, third, fourth]
      .filter((team): team is Team => !!team)
      .map((team, index) => {
        const base =
          tournamentBaseRatings[team.id] ??
          baseRatings[team.id] ??
          ratingById.get(team.id) ??
          0;
        const current = ratingById.get(team.id) ?? base;
        return {
          place: index + 1,
          team,
          delta: Math.round(current - base),
          rating: Math.round(current),
        };
      });
  }, [tournamentComplete, playoffMatches, baseRatings, ratingById]);

  const selectedPodium = teamSummary
    ? podiumBase[teamSummary.team.id] ?? emptyPodium()
    : emptyPodium();
  const medalsTotal = selectedPodium.gold + selectedPodium.silver + selectedPodium.bronze;
  const winGaugeColor =
    (teamSummary?.winPct ?? 0) > 50
      ? "#22c55e"
      : (teamSummary?.winPct ?? 0) < 50
        ? "#ef4444"
        : "#f5f5f7";
  const winGaugeAngle = Math.max(0, Math.min(360, ((teamSummary?.winPct ?? 0) / 100) * 360));
  
  return (
    <UiRoot>
      <Box p={4} maxW="1120px" mx="auto" className="ui-stack">
      <button
        type="button"
        className="hero-create-button"
        onClick={handleOpenSetup}
        title="Создать турнир"
        aria-label="Создать турнир"
      >
        <span className="hero-create-icon">
          <FiPlus />
        </span>
        <span className="hero-create-label">Создать турнир</span>
      </button>
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
      {teamsLoading && <Text>Загрузка команд...</Text>}
      {teamsError && <Text color="red.500">{teamsError}</Text>}
      <Box className="ui-stack">
        <Box className="hero-bar" data-testid="tournament-hero">
          <Box className="hero-head-row">
            <Box className="hero-brand">
              <img
                src="/iihf-logo2.svg"
                alt="IIHF"
                className="hero-logo"
                loading="lazy"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                style={{ cursor: "pointer" }}
              />
              {tournamentName.trim() && (
                <Text className="ui-subtitle">{tournamentName.trim()}</Text>
              )}
            </Box>
            <Box className="hero-actions">
              {isTournamentCreated && (
                <>
                  <IconButton
                    onClick={handleSaveTournament}
                    title="Сохранить"
                    aria-label="Сохранить"
                  >
                    <FiSave />
                  </IconButton>
                  <IconButton
                    onClick={handleExportSave}
                    title="Экспорт"
                    aria-label="Экспорт"
                  >
                    <FiDownload />
                  </IconButton>
                </>
              )}
            </Box>
          </Box>
          {isTournamentCreated && (
            <Box className="hero-secondary-row">
              <Box className="hero-facts-inline">
                <StatCard label="Команд" value={participantCount} />
                <StatCard label="Групп" value={groupCount || "—"} />
              </Box>
              {participantTeams.length > 0 && (
                <Box className="participant-strip participant-strip--inline">
                  {participantTeams.map((team) => (
                    <span
                      key={team.id}
                      className="participant-flag"
                      data-eliminated={eliminatedTeamIds.has(team.id)}
                    >
                      <Flag code={team.flagCode} name={team.name} size={22} />
                    </span>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
        {isTournamentCreated && (
          <>
            {tournamentComplete ? (
              <Text color="green.600">Турнир завершён. Рейтинг обновлён.</Text>
            ) : (
              <Text color="gray.600">
                Турнир создан. Управляйте матчами ниже.
              </Text>
            )}
            <Box className="ui-panel">
              <Calendar
                groups={groups}
                playoffMatches={playoffMatches}
                onUpdateMatch={updateMatchById}
                playerTeamIds={playerTeamIds}
                embedded
              />
            </Box>
            <Box className="ui-panel">
              <StandingsTable groups={groups} playerTeamIds={playerTeamIds} />
            </Box>
            <Box className="ui-panel">
              {playoffRequired ? (
                <PlayoffBracket
                  matches={playoffMatches}
                  playerTeamIds={playerTeamIds}
                  eliminatedTeamIds={Array.from(eliminatedTeamIds)}
                />
              ) : (
                <Text color="gray.600">
                  Плей-офф не проводится для текущего количества команд.
                </Text>
              )}
            </Box>
          </>
        )}
      </Box>
      <Box className="ui-stack summary-table-stack">
        <Box className="ui-card team-summary-card" data-testid="team-summary-card">
          {teamSummary ? (
            <>
              <Box
                className={`team-summary-hero${
                  teamSummary.last10.length === 0 ? " team-summary-hero--centered" : ""
                }`}
              >
                <Box className="team-summary-left">
                  <FederationLogo
                    code={teamSummary.team.flagCode}
                    name={teamSummary.team.name}
                    size={96}
                  />
                  <Box className="team-summary-title-col">
                    <Box className="team-summary-kicker">
                      <Flag
                        code={teamSummary.team.flagCode}
                        name={teamSummary.team.name}
                        size={18}
                      />
                      <span>{teamSummary.team.ovr ? `OVR ${teamSummary.team.ovr}` : "OVR —"}</span>
                    </Box>
                    <Text className="top-team-name" data-testid="team-summary-name">
                      {teamSummary.team.name}
                    </Text>
                    {teamSummary.last10.length > 0 && (
                      <Box className="team-summary-last-games">
                        <Box className="top-team-form">
                          {teamSummary.last10.map((result, index) => (
                            <span key={index} className="form-dot" data-result={result} />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
                <Box className="team-summary-right">
                  <span className="team-summary-factoid-label">{teamSummary.played} матчей</span>
                  <div
                    className="win-rate-gauge"
                    style={{
                      background: `conic-gradient(${winGaugeColor} ${winGaugeAngle}deg, rgba(255,255,255,0.14) 0deg)`,
                    }}
                  >
                    <div className="win-rate-gauge__inner">
                      <strong>{teamSummary.winPct}%</strong>
                    </div>
                  </div>
                  <Box className="team-summary-medals-empty">
                    <span className="team-summary-medals-stack">
                      <i data-medal="gold" />
                      <i data-medal="silver" />
                      <i data-medal="bronze" />
                    </span>
                    <strong>{medalsTotal}</strong>
                  </Box>
                </Box>
              </Box>
            </>
          ) : (
            <Text fontSize="sm" color="gray.500">
              Недостаточно данных для отображения статистики.
            </Text>
          )}
        </Box>

        <Box className="ui-card">
          <Box className="rating-card-header">
            <Text className="ui-subtitle">Рейтинг команд</Text>
            <Box display="flex" gap={1}>
              <IconButton
                title="Обновить рейтинг по сохранениям"
                aria-label="Обновить рейтинг по сохранениям"
                onClick={() => handleRebuildRatingsFromSaves()}
              >
                <FiRefreshCw />
              </IconButton>
              <IconButton
                title="Сбросить рейтинг"
                aria-label="Сбросить рейтинг"
                onClick={handleResetRatings}
              >
                <FiRotateCcw />
              </IconButton>
            </Box>
          </Box>
          <Box mt={3}>
            <RatingTable
              key={`rating-table-${ratingAnimationKey}`}
              ratings={ratings}
              ratingDeltas={ratingDeltas}
              playerTeamIds={playerTeamIds}
              podium={podiumBase}
              selectedTeamId={selectedTeamId}
              onSelectTeam={(teamId) => setSelectedTeamId(teamId)}
            />
          </Box>
        </Box>
      </Box>

      {isSetupOpen && (
        <Box
          className="ui-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseSetup();
          }}
        >
          <Box
            className="ui-modal"
            role="dialog"
            aria-modal="true"
            data-testid="tournament-modal"
          >
            <Box className="ui-modal-header">
              <Text className="ui-modal-title">Новый турнир</Text>
              <button
                type="button"
                className="ui-icon-button"
                onClick={handleCloseSetup}
                aria-label="Закрыть"
              >
                <FiX />
              </button>
            </Box>
            <Box className="ui-modal-body">
              <Box className="ui-panel ui-panel-plain">
                <Text className="ui-section-title">Групповой этап</Text>
                <Box mt={3}>
                  <TournamentSetup teams={teams} onCreate={handleCreateGroups} embedded />
                </Box>
              </Box>

              {groups.length > 0 && teams.length > 0 && (
                <>
                  <Box className="ui-divider" />
                  <Box className="ui-panel ui-panel-plain">
                    <Text className="ui-section-title">Плей-офф</Text>
                    <Box mt={3} display="flex" gap={3} flexWrap="wrap" alignItems="center">
                      <label>
                        <select
                          value={playoffSeeding}
                          onChange={(e) => setPlayoffSeeding(e.target.value as PlayoffSeeding)}
                          style={{ width: "260px" }}
                          className="ui-select"
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
                          className="ui-select"
                        >
                          <option value="seeded">Классическая (1-8, 2-7...)</option>
                          <option value="cross">Кросс-группы (A1-B4...)</option>
                          <option value="random">Случайные пары</option>
                        </select>
                      </label>
                    </Box>
                  </Box>

                  <Box className="ui-divider" />
                  <Box className="ui-panel ui-panel-plain">
                    <GroupEditor
                      groups={groups}
                      setGroups={setGroups}
                      allTeams={teams}
                      unassigned={unassigned}
                      setUnassigned={setUnassigned}
                      playerTeamIds={playerTeamIds}
                      onTogglePlayerTeam={togglePlayerTeam}
                      maxTeamsPerGroup={teamsPerGroupLimit}
                      lineCards
                    />
                    <Box>
                      <Text fontSize="sm" color="gray.600">
                        Клик по карточке команды — выделить “свою” команду.
                      </Text>
                      <Button size="xs" mt={2} variant="outline" onClick={() => setPlayerTeamIds([])}>
                        Сбросить выбор
                      </Button>
                    </Box>
                  </Box>
                </>
              )}

              <Box className="ui-divider" />
              <Box
                className="ui-panel ui-panel-plain"
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
                style={{
                  borderWidth: isImportDrag ? "1px" : "0px",
                  borderStyle: isImportDrag ? "dashed" : "solid",
                  borderColor: isImportDrag ? "rgba(200, 16, 46, 0.6)" : "transparent",
                  background: isImportDrag ? "rgba(200, 16, 46, 0.12)" : "transparent",
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Text className="ui-section-title">Прошлые турниры</Text>
                    <IconButton
                      onClick={() => fileInputRef.current?.click()}
                      title="Импорт"
                      aria-label="Импорт"
                    >
                      <FiUpload />
                    </IconButton>
                  </Box>
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
                            <FiFolder />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleStartRenameSave(save)}
                            aria-label="Редактировать"
                          >
                            <FiEdit2 />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleDeleteSave(save.id)}
                            aria-label="Удалить"
                          >
                            <FiTrash2 />
                          </Button>
                        </Box>
                      </>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box className="ui-modal-footer">
              <Button size="sm" variant="outline" onClick={handleCloseSetup}>
                Отмена
              </Button>
              {groups.length > 0 && (
                <Button size="sm" colorScheme="blue" onClick={handleCreateTournament}>
                  Создать турнир
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}
      {showFinalScreen && tournamentComplete && (
        <Box className="final-screen">
          <Box className="final-screen__card">
            <Text className="final-screen__title">Турнир завершён</Text>
            <Text className="final-screen__subtitle">
              Финальные места и изменение рейтинга
            </Text>
            <Box className="final-podium">
              {finalPlacements.map((entry) => {
                const deltaLabel =
                  entry.delta > 0 ? `+${entry.delta}` : `${entry.delta}`;
                return (
                  <Box key={entry.team.id} className="final-podium__slot" data-place={entry.place}>
                    <Text className="final-podium__place">{entry.place}</Text>
                    <Box className="final-podium__team">
                      <Flag code={entry.team.flagCode} name={entry.team.name} size={28} />
                      <Box>
                        <Text className="final-podium__name">{entry.team.name}</Text>
                        <Text className="final-podium__meta">
                          Рейтинг {entry.rating}{" "}
                          <span
                            className="final-podium__delta"
                            data-up={entry.delta > 0}
                            data-down={entry.delta < 0}
                          >
                            {deltaLabel}
                          </span>
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            <Box className="final-screen__actions">
              <Button size="sm" onClick={handleSaveTournament}>
                Сохранить турнир
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  handleSaveTournament();
                  resetTournamentState(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Вернуться на главную
              </Button>
            </Box>
          </Box>
        </Box>
      )}
      </Box>
    </UiRoot>
  );
}

export default App;
