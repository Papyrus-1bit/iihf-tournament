import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Input, Text } from "@chakra-ui/react";
import TournamentSetup from "./components/TournamentSetup";
import GroupEditor from "./components/GroupEditor";
import Calendar from "./components/Calendar";
import StandingsTable from "./components/StandingsTable";
import RatingTable from "./components/RatingTable";
import PlayoffBracket from "./components/PlayoffBracket";
import Flag from "./components/Flag";
import { IconButton, StatCard, UiRoot } from "./ui";
import {
  FiDownload,
  FiEdit2,
  FiFolder,
  FiPlusSquare,
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
const PODIUM_STORAGE_KEY = "iihfPodium";
const PODIUM_VERSION_KEY = "iihfPodiumVersion";
const PODIUM_VERSION = "4";
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
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [defaultRatings, setDefaultRatings] = useState<Record<string, number>>({});
  const [baseRatings, setBaseRatings] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Array<Team & { rating: number }>>([]);
  const [podiumBase, setPodiumBase] = useState<Record<string, PodiumCounts>>({});
  const [tournamentBaseRanks, setTournamentBaseRanks] = useState<Record<string, number>>({});
  const [ratingsCommitted, setRatingsCommitted] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [savedTournaments, setSavedTournaments] = useState<TournamentSave[]>([]);
  const [editingSaveId, setEditingSaveId] = useState<string | null>(null);
  const [editingSaveName, setEditingSaveName] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isImportDrag, setIsImportDrag] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
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
    setIsSetupOpen(false);
  };

  const handleCloseSetup = () => {
    setIsSetupOpen(false);
    setIsEditingTitle(false);
  };

  const handleEditTournament = () => {
    setGroups((prev) => prev.map((group) => ({ ...group, matches: [] })));
    setPlayoffMatches([]);
    setIsTournamentCreated(false);
    setRatingsCommitted(false);
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
      const parsed = JSON.parse(text) as unknown;
      let data: Partial<TournamentSaveData> | null = null;
      if (parsed && typeof parsed === "object" && "data" in parsed) {
        const maybe = (parsed as { data?: TournamentSaveData }).data;
        if (maybe) data = maybe;
      } else if (parsed && typeof parsed === "object") {
        data = parsed as Partial<TournamentSaveData>;
      }
      if (data) applySaveData(data);
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

  const groupMatches = useMemo(
    () => groups.flatMap((group) => group.matches),
    [groups]
  );
  const allMatches = useMemo(
    () => [...groupMatches, ...playoffMatches],
    [groupMatches, playoffMatches]
  );
  const bracketSize = useMemo(() => getBracketSize(groups), [groups]);
  const initialRound = useMemo(() => getRoundForSize(bracketSize), [bracketSize]);
  const totalTeams = teams.length;
  const unassignedCount = unassigned.length;
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
    const teamMatches = allMatches
      .filter(
        (match) =>
          (match.home.id === selectedTeam.id || match.away.id === selectedTeam.id) &&
          match.homeScore !== undefined &&
          match.awayScore !== undefined
      )
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let wins = 0;
    let losses = 0;
    let otGames = 0;
    let shootoutGames = 0;
    const form: Array<"W" | "L" | "T"> = [];
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
    const played = teamMatches.length;
    const winPct = played > 0 ? Math.round((wins / played) * 100) : 0;
    const last10 = form.slice(-10);
    return {
      team: selectedTeam,
      wins,
      losses,
      otGames,
      shootoutGames,
      winPct,
      last10,
    };
  }, [allMatches, overallStats, selectedTeamId, teams]);

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

  const participantTeams = useMemo(
    () =>
      Array.from(
        new Map(groups.flatMap((group) => group.teams).map((team) => [team.id, team])).values()
      ),
    [groups]
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
    if (playoffRequired) {
      const finalMatch = playoffMatches.find((match) => match.round === "F");
      if (
        finalMatch &&
        finalMatch.homeScore !== undefined &&
        finalMatch.awayScore !== undefined
      ) {
        const resolveWinner = (match: Match) =>
          match.homeScore !== undefined && match.awayScore !== undefined
            ? match.homeScore >= match.awayScore
              ? match.home
              : match.away
            : null;
        const resolveLoser = (match: Match) =>
          match.homeScore !== undefined && match.awayScore !== undefined
            ? match.homeScore >= match.awayScore
              ? match.away
              : match.home
            : null;

        const winner = resolveWinner(finalMatch);
        const loser = resolveLoser(finalMatch);
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

        if (winner && loser) {
          bump(winner.id, { gold: 1, finals: 1 });
          bump(loser.id, { silver: 1, finals: 1 });
        }

        const thirdMatch = playoffMatches.find((match) => match.round === "3P");
        if (
          thirdMatch &&
          thirdMatch.homeScore !== undefined &&
          thirdMatch.awayScore !== undefined
        ) {
          const bronzeWinner = resolveWinner(thirdMatch);
          if (bronzeWinner) {
            bump(bronzeWinner.id, { bronze: 1 });
          }
        }

        if (Object.keys(delta).length > 0) {
          setPodiumBase((prev) => {
            const next = mergePodium(prev, delta);
            localStorage.setItem(PODIUM_STORAGE_KEY, JSON.stringify(next));
            localStorage.setItem(PODIUM_VERSION_KEY, PODIUM_VERSION);
            return next;
          });
        }
      }
    }
    setRatingsCommitted(true);
  }, [
    isTournamentCreated,
    tournamentComplete,
    ratingsCommitted,
    ratings,
    playoffRequired,
    playoffMatches,
  ]);

  const displayBaseRanks = useMemo(
    () =>
      Object.keys(tournamentBaseRanks).length > 0
        ? tournamentBaseRanks
        : buildRankMap(baseRatings),
    [tournamentBaseRanks, baseRatings]
  );
  
  return (
    <UiRoot>
      <Box p={4} maxW="1120px" mx="auto" className="ui-stack">
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
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
            <Box display="flex" flexDirection="column" gap={2}>
              <img
                src="/iihf-logo.svg"
                alt="IIHF"
                className="hero-logo"
                loading="lazy"
              />
              {tournamentName.trim() && (
                <Text className="ui-subtitle">{tournamentName.trim()}</Text>
              )}
            </Box>
            <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
              <IconButton
                onClick={() => setIsSetupOpen(true)}
                title="Новый турнир"
                aria-label="Новый турнир"
              >
                <FiPlusSquare />
              </IconButton>
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
        </Box>
        {isTournamentCreated && (
          <Box className="hero-stats">
            <Box className="swiss-facts">
              <StatCard label="Команд" value={totalTeams} />
              <StatCard label="Групп" value={groupCount || "—"} />
              <StatCard label="Нераспр." value={unassignedCount} />
              <StatCard label="Сетка" value={bracketSize >= 4 ? bracketSize : "—"} />
            </Box>
            {participantTeams.length > 0 && (
              <Box className="participant-strip">
                {participantTeams.map((team) => (
                  <span
                    key={team.id}
                    className="participant-flag"
                    data-eliminated={eliminatedTeamIds.has(team.id)}
                  >
                    <Flag code={team.flagCode} name={team.name} size={26} />
                  </span>
                ))}
              </Box>
            )}
          </Box>
        )}
        {!isTournamentCreated && groups.length > 0 && teams.length > 0 && (
          <Text fontSize="sm" color="gray.600">
            Распределение команд доступно в настройках турнира.
          </Text>
        )}
        {isTournamentCreated && (
          <>
            <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
              <Button size="sm" variant="outline" onClick={handleEditTournament}>
                Редактировать турнир
              </Button>
              <Button size="sm" colorScheme="red" onClick={handleNewTournament}>
                Новый турнир
              </Button>
            </Box>
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
                <PlayoffBracket matches={playoffMatches} playerTeamIds={playerTeamIds} />
              ) : (
                <Text color="gray.600">
                  Плей-офф не проводится для текущего количества команд.
                </Text>
              )}
            </Box>
          </>
        )}
      </Box>
      <Box className="ui-stack">
        <Box className="ui-card" data-testid="team-summary-card">
          <Text className="ui-subtitle">Команда</Text>
          {teamSummary ? (
            <>
              <Box className="top-team-row">
                <Box className="top-team-header">
                  <Flag
                    code={teamSummary.team.flagCode}
                    name={teamSummary.team.name}
                    size={60}
                  />
                  <Box>
                    <Text className="top-team-name" data-testid="team-summary-name">
                      {teamSummary.team.name}
                    </Text>
                    <Text className="top-team-meta">
                      {teamSummary.team.ovr ? `OVR ${teamSummary.team.ovr}` : "OVR —"}
                    </Text>
                  </Box>
                </Box>
                <Box className="top-team-facts top-team-facts--inline">
                <div className="top-team-fact">
                  <span>В</span>
                  <strong>{teamSummary.wins}</strong>
                </div>
                <div className="top-team-fact">
                  <span>П</span>
                  <strong>{teamSummary.losses}</strong>
                </div>
                <div className="top-team-fact">
                  <span>ОТ</span>
                  <strong>{teamSummary.otGames}</strong>
                </div>
                <div className="top-team-fact">
                  <span>Б</span>
                  <strong>{teamSummary.shootoutGames}</strong>
                </div>
                <div className="top-team-fact">
                  <span>% побед</span>
                  <strong>{teamSummary.winPct}%</strong>
                </div>
              </Box>
              </Box>
              <Box mt={3}>
                <Text className="ui-subtitle">Последние 10 матчей</Text>
                <Box className="top-team-form">
                  {Array.from({ length: 10 }).map((_, index) => {
                    const offset = Math.max(0, 10 - teamSummary.last10.length);
                    const result =
                      index < offset ? "E" : teamSummary.last10[index - offset] ?? "E";
                    return <span key={index} className="form-dot" data-result={result} />;
                  })}
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
          <Text className="ui-subtitle">Рейтинг команд</Text>
          <Box mt={3}>
            <RatingTable
              ratings={ratings}
              baseRanks={displayBaseRanks}
              playerTeamIds={playerTeamIds}
              podium={podiumBase}
              selectedTeamId={selectedTeamId}
              onSelectTeam={(teamId) => setSelectedTeamId(teamId)}
            />
          </Box>
          <Box mt={2}>
            <Button size="sm" variant="outline" onClick={handleResetRatings}>
              Сбросить рейтинг
            </Button>
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
                <Text fontSize="sm" color="gray.500" mb={1}>
                  Название турнира
                </Text>
                {isEditingTitle ? (
                  <Input
                    size="sm"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setIsEditingTitle(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <Text
                    fontSize="sm"
                    cursor="pointer"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {tournamentName.trim() || "Нажмите, чтобы задать название"}
                  </Text>
                )}
              </Box>
              <Box className="ui-divider" />
              <Box className="ui-panel ui-panel-plain">
                <Text className="ui-section-title">Настройка групп</Text>
                <Box mt={3}>
                  <TournamentSetup teams={teams} onCreate={handleCreateGroups} embedded />
                </Box>
              </Box>

              {groups.length > 0 && teams.length > 0 && (
                <>
                  <Box className="ui-divider" />
                  <Box className="ui-panel ui-panel-plain">
                    <Text className="ui-section-title">Настройки сетки</Text>
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
                      <Text fontSize="sm" color="gray.500">
                        Размер сетки: {bracketSize >= 4 ? bracketSize : "плей-офф не будет"}
                      </Text>
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
      </Box>
    </UiRoot>
  );
}

export default App;
