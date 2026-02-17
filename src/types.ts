export interface Team {
  id: string;
  name: string;
  flagCode: string; // ISO code for flag asset
  iihfRank: number;
  ratingPoints?: number;
  ovr?: number;
}

export type MatchStage = "group" | "playoff";
export type MatchRound = "GROUP" | "R16" | "QF" | "SF" | "F" | "3P";

export interface Match {
  id: string;
  home: Team;
  away: Team;
  date: string;
  homeScore?: number;
  awayScore?: number;
  overtime?: boolean;
  shootout?: boolean;
  stage?: MatchStage;
  round?: MatchRound;
  groupId?: string;
  groupName?: string;
}

export interface Group {
  id: string;
  name: string;
  teams: Team[];
  matches: Match[];
}
