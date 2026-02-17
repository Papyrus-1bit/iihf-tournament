import { Group, Match } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayNumber = (date: Date) => Math.floor(date.getTime() / DAY_MS);
const fromDayNumber = (day: number) => new Date(day * DAY_MS);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const parseIsoDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const parseIsoDateLocal = (iso: string) => new Date(`${iso}T00:00:00`);

export const getTournamentStartDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 4, 9));
};

export const formatIsoFromDay = (day: number) => toIsoDate(fromDayNumber(day));

const updateTeamState = (
  state: Map<string, { lastDay: number; consecutive: number }>,
  teamId: string,
  day: number
) => {
  const prev = state.get(teamId);
  const consecutive = prev && prev.lastDay === day - 1 ? prev.consecutive + 1 : 1;
  state.set(teamId, { lastDay: day, consecutive });
};

const canPlayOnDay = (
  state: Map<string, { lastDay: number; consecutive: number }>,
  teamId: string,
  day: number,
  teamsToday: Set<string>
) => {
  if (teamsToday.has(teamId)) return false;
  const prev = state.get(teamId);
  if (prev && prev.lastDay === day - 1 && prev.consecutive >= 3) return false;
  return true;
};

const buildInitialState = (history: Match[]) => {
  const state = new Map<string, { lastDay: number; consecutive: number }>();
  const ordered = [...history]
    .filter((m) => m.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  ordered.forEach((match) => {
    const day = toDayNumber(parseIsoDate(match.date));
    updateTeamState(state, match.home.id, day);
    updateTeamState(state, match.away.id, day);
  });

  return state;
};

export const assignMatchDates = (matches: Match[], startDate: Date, history: Match[] = []) => {
  const scheduled = matches.map((m) => ({ ...m }));
  const remaining = [...scheduled];
  const state = buildInitialState(history);
  let day = toDayNumber(startDate);

  while (remaining.length > 0) {
    let scheduledToday = false;
    const teamsToday = new Set<string>();

    for (let i = 0; i < remaining.length; ) {
      const match = remaining[i];
      const homeId = match.home.id;
      const awayId = match.away.id;

      if (
        canPlayOnDay(state, homeId, day, teamsToday) &&
        canPlayOnDay(state, awayId, day, teamsToday)
      ) {
        match.date = formatIsoFromDay(day);
        updateTeamState(state, homeId, day);
        updateTeamState(state, awayId, day);
        teamsToday.add(homeId);
        teamsToday.add(awayId);
        remaining.splice(i, 1);
        scheduledToday = true;
        continue;
      }

      i += 1;
    }

    day += 1;
    if (!scheduledToday) {
      continue;
    }
  }

  return scheduled;
};

export const generateGroupMatches = (groups: Group[]) => {
  const matches: Match[] = [];
  groups.forEach((group) => {
    const n = group.teams.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        matches.push({
          id: `${group.id}-match-${i}-${j}`,
          home: group.teams[i],
          away: group.teams[j],
          date: "",
          overtime: false,
          shootout: false,
          stage: "group",
          round: "GROUP",
          groupId: group.id,
          groupName: group.name,
        });
      }
    }
  });
  return matches;
};

export const applyMatchesToGroups = (groups: Group[], matches: Match[]) => {
  const matchesByGroup = new Map<string, Match[]>();
  matches.forEach((match) => {
    const groupId = match.groupId;
    if (!groupId) return;
    if (!matchesByGroup.has(groupId)) {
      matchesByGroup.set(groupId, []);
    }
    matchesByGroup.get(groupId)!.push(match);
  });

  return groups.map((group) => ({
    ...group,
    matches: matchesByGroup.get(group.id) ?? [],
  }));
};

export const getLastScheduledDay = (matches: Match[]) => {
  const dated = matches.filter((m) => m.date);
  if (dated.length === 0) return null;
  const latest = dated.reduce((acc, m) => (m.date > acc ? m.date : acc), dated[0].date);
  return toDayNumber(parseIsoDate(latest));
};

export const getDisplayDate = (iso: string) => {
  const date = parseIsoDateLocal(iso);
  return date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
};
