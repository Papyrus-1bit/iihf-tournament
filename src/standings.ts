import { Group, Team } from "./types";

export interface TeamStats {
  teamId: string;
  teamName: string;
  flagCode: string;
  played: number;
  won: number;
  lost: number;
  ot: number;
  points: number;
  gf: number;
  ga: number;
  team: Team;
}

const initStats = (team: Team): TeamStats => ({
  teamId: team.id,
  teamName: team.name,
  flagCode: team.flagCode,
  played: 0,
  won: 0,
  lost: 0,
  ot: 0,
  points: 0,
  gf: 0,
  ga: 0,
  team,
});

export const calculateGroupStats = (group: Group) => {
  const statsMap: Record<string, TeamStats> = {};
  group.teams.forEach((team) => {
    statsMap[team.id] = initStats(team);
  });

  group.matches.forEach((match) => {
    if (match.homeScore === undefined || match.awayScore === undefined) return;
    const home = statsMap[match.home.id];
    const away = statsMap[match.away.id];
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.gf += match.homeScore;
    home.ga += match.awayScore;
    away.gf += match.awayScore;
    away.ga += match.homeScore;

    const isExtraTime = !!match.overtime || !!match.shootout;
    if (match.homeScore > match.awayScore) {
      home.won += 1;
      if (isExtraTime) {
        home.points += 2;
        away.points += 1;
        away.ot += 1;
      } else {
        home.points += 3;
        away.lost += 1;
      }
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      if (isExtraTime) {
        away.points += 2;
        home.points += 1;
        home.ot += 1;
      } else {
        away.points += 3;
        home.lost += 1;
      }
    } else {
      home.ot += 1;
      away.ot += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  return Object.values(statsMap).sort(
    (a, b) =>
      b.points - a.points ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf
  );
};

export const calculateOverallStats = (groups: Group[]) => {
  const combined: Record<string, TeamStats> = {};
  groups.forEach((group) => {
    group.teams.forEach((team) => {
      if (!combined[team.id]) {
        combined[team.id] = initStats(team);
      }
    });
  });

  groups.forEach((group) => {
    group.matches.forEach((match) => {
      if (match.homeScore === undefined || match.awayScore === undefined) return;
      const home = combined[match.home.id];
      const away = combined[match.away.id];
      if (!home || !away) return;

      home.played += 1;
      away.played += 1;
      home.gf += match.homeScore;
      home.ga += match.awayScore;
      away.gf += match.awayScore;
      away.ga += match.homeScore;

      const isExtraTime = !!match.overtime || !!match.shootout;
      if (match.homeScore > match.awayScore) {
        home.won += 1;
        if (isExtraTime) {
          home.points += 2;
          away.points += 1;
          away.ot += 1;
        } else {
          home.points += 3;
          away.lost += 1;
        }
      } else if (match.homeScore < match.awayScore) {
        away.won += 1;
        if (isExtraTime) {
          away.points += 2;
          home.points += 1;
          home.ot += 1;
        } else {
          away.points += 3;
          home.lost += 1;
        }
      } else {
        home.ot += 1;
        away.ot += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  });

  return Object.values(combined).sort(
    (a, b) =>
      b.points - a.points ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf
  );
};
