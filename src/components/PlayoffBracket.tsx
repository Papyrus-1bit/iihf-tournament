import type { FC } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { Match, MatchRound } from "../types";
import Flag from "./Flag";

interface Props {
  matches: Match[];
  playerTeamIds?: string[];
  eliminatedTeamIds?: string[];
}

const roundGroups: Array<{ id: string; label: string; rounds: MatchRound[] }> = [
  { id: "R16", label: "1/8 финала", rounds: ["R16"] },
  { id: "QF", label: "1/4 финала", rounds: ["QF"] },
  { id: "SF", label: "1/2 финала", rounds: ["SF"] },
  { id: "Finals", label: "Финал", rounds: ["F", "3P"] },
];

const shortName = (name: string) => {
  if (name.length <= 10) return name;
  const parts = name.split(" ").filter(Boolean);
  if (parts.length > 1) {
    const initials = parts.map((part) => part[0]).join("");
    if (initials.length > 1 && initials.length <= 4) {
      return initials.toUpperCase();
    }
  }
  return `${name.slice(0, 9)}...`;
};

const PlayoffBracket: FC<Props> = ({
  matches,
  playerTeamIds = [],
  eliminatedTeamIds = [],
}) => {
  if (matches.length === 0) {
    return <Text>Плей-офф пока не сформирован.</Text>;
  }

  const matchesByRound = new Map<MatchRound, Match[]>();
  matches.forEach((match) => {
    if (!match.round) return;
    if (!matchesByRound.has(match.round)) {
      matchesByRound.set(match.round, []);
    }
    matchesByRound.get(match.round)!.push(match);
  });

  const eliminated = new Set(eliminatedTeamIds);

  return (
    <Box className="bracket-grid">
      {roundGroups.map(({ id, label, rounds }) => {
        const roundMatches = rounds.flatMap((round) => matchesByRound.get(round) ?? []);
        if (roundMatches.length === 0) return null;
        return (
          <Box key={id} className="bracket-column">
            <Heading size="xs" mb={2}>{label}</Heading>
            <Box display="flex" flexDirection="column" gap={2}>
              {rounds.map((round) => {
                const matchesForRound = matchesByRound.get(round) ?? [];
                if (matchesForRound.length === 0) return null;
                const roundLabel = round === "3P" ? "Матч за 3-е" : round === "F" ? "Финал" : null;
                return (
                  <Box key={round} display="flex" flexDirection="column" gap={2}>
                    {roundLabel && (
                      <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="0.08em">
                        {roundLabel}
                      </Text>
                    )}
                    {matchesForRound.map((match) => {
                      const homeSelected = playerTeamIds.includes(match.home.id);
                      const awaySelected = playerTeamIds.includes(match.away.id);
                      const played = match.homeScore !== undefined && match.awayScore !== undefined;
                      const homeLost = played && (match.homeScore ?? 0) < (match.awayScore ?? 0);
                      const awayLost = played && (match.awayScore ?? 0) < (match.homeScore ?? 0);
                      return (
                        <Box
                          key={match.id}
                          className="bracket-match"
                          data-player={homeSelected || awaySelected}
                        >
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center" gap={2}>
                              <span
                                className="bracket-flag"
                                data-eliminated={eliminated.has(match.home.id)}
                              >
                                <Flag code={match.home.flagCode} name={match.home.name} size={18} />
                              </span>
                              <Text
                                fontSize="sm"
                                textDecoration={homeLost ? "line-through" : "none"}
                                color={homeLost ? "gray.500" : "inherit"}
                              >
                                {shortName(match.home.name)}
                              </Text>
                            </Box>
                            <Text fontWeight="bold" fontSize="sm">
                              {played ? match.homeScore : "—"}
                            </Text>
                          </Box>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center" gap={2}>
                              <span
                                className="bracket-flag"
                                data-eliminated={eliminated.has(match.away.id)}
                              >
                                <Flag code={match.away.flagCode} name={match.away.name} size={18} />
                              </span>
                              <Text
                                fontSize="sm"
                                textDecoration={awayLost ? "line-through" : "none"}
                                color={awayLost ? "gray.500" : "inherit"}
                              >
                                {shortName(match.away.name)}
                              </Text>
                            </Box>
                            <Text fontWeight="bold" fontSize="sm">
                              {played ? match.awayScore : "—"}
                            </Text>
                          </Box>
                          {played && (match.overtime || match.shootout) && (
                            <Text fontSize="xs" color="gray.500" mt={1}>
                              {match.shootout ? "SO" : "OT"}
                            </Text>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default PlayoffBracket;
