export interface Team {
  id: string;
  name: string;
  flagCode: string; // ISO code for flag asset
  iihfRank: number;
  ratingPoints?: number;
  ovr?: number;
}

export interface PodiumCounts {
  gold: number;
  silver: number;
  bronze: number;
  finals: number;
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

export interface RosterPlayer {
  id: string;
  name: string;
  role: "forward" | "defenseman" | "goalie";
  position: "F" | "D" | "G" | string;
  club?: string;
  overall?: number | null;
  photo_url?: string | null;
  jersey_number?: number | null;
  shoots?: string | null;
  source?: string | null;
}

export interface TeamLine {
  name: string;
  player_ids: string[];
}

export interface TeamRoster {
  code: string;
  name: string;
  team_ovr?: number | null;
  players?: RosterPlayer[];
  forwards: RosterPlayer[];
  defensemen: RosterPlayer[];
  goalies: RosterPlayer[];
  lineups?: Record<string, TeamLine[]>;
}
