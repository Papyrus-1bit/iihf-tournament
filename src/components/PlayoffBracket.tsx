import type { FC } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { Match, MatchRound } from "../types";
import Flag from "./Flag";

interface Props {
  matches: Match[];
  playerTeamIds?: string[];
}

const roundOrder: Array<{ round: MatchRound; label: string }> = [
  { round: "R16", label: "1/8 финала" },
  { round: "QF", label: "1/4 финала" },
  { round: "SF", label: "1/2 финала" },
  { round: "F", label: "Финал" },
  { round: "3P", label: "Матч за 3-е" },
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

const PlayoffBracket: FC<Props> = ({ matches, playerTeamIds = [] }) => {
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

  return (
    <Box display="flex" gap={4} overflowX="auto" pb={2}>
      {roundOrder.map(({ round, label }) => {
        const roundMatches = matchesByRound.get(round) ?? [];
        if (roundMatches.length === 0) return null;
        return (
          <Box key={round} minW="240px" p={3} className="panel">
            <Heading size="xs" mb={2}>{label}</Heading>
            <Box display="flex" flexDirection="column" gap={2}>
              {roundMatches.map((match) => {
                const homeSelected = playerTeamIds.includes(match.home.id);
                const awaySelected = playerTeamIds.includes(match.away.id);
                const played = match.homeScore !== undefined && match.awayScore !== undefined;
                const homeLost = played && (match.homeScore ?? 0) < (match.awayScore ?? 0);
                const awayLost = played && (match.awayScore ?? 0) < (match.homeScore ?? 0);
                return (
                  <Box
                    key={match.id}
                    p={2}
                    className="card"
                    background={homeSelected || awaySelected ? "rgba(80, 200, 120, 0.08)" : "transparent"}
                  >
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center" gap={2}>
                        <Flag code={match.home.flagCode} name={match.home.name} />
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
                        <Flag code={match.away.flagCode} name={match.away.name} />
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
          </Box>
        );
      })}
    </Box>
  );
};

export default PlayoffBracket;
