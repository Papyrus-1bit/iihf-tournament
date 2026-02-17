import React, { useMemo, useRef } from "react";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { Group, Match } from "../types";
import MatchCard from "./MatchCard";
import { simulateMatchResult } from "../simulation";
import { getDisplayDate } from "../scheduling";

interface Props {
  groups: Group[];
  playoffMatches: Match[];
  onUpdateMatch: (matchId: string, updates: Partial<Match>) => void;
  playerTeamIds: string[];
}

const Calendar: React.FC<Props> = ({ groups, playoffMatches, onUpdateMatch, playerTeamIds }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const groupMatches = useMemo(
    () => groups.flatMap((group) => group.matches),
    [groups]
  );
  const allMatches = useMemo(
    () => [...groupMatches, ...playoffMatches].filter((m) => m.date),
    [groupMatches, playoffMatches]
  );

  const matchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    allMatches.forEach((match) => {
      if (!map.has(match.date)) {
        map.set(match.date, []);
      }
      map.get(match.date)!.push(match);
    });
    return map;
  }, [allMatches]);

  const orderedDates = useMemo(
    () => Array.from(matchesByDate.keys()).sort(),
    [matchesByDate]
  );

  const activeDate = useMemo(() => {
    for (const date of orderedDates) {
      const matches = matchesByDate.get(date) ?? [];
      if (matches.some((m) => m.homeScore === undefined || m.awayScore === undefined)) {
        return date;
      }
    }
    return null;
  }, [orderedDates, matchesByDate]);

  const handleSimulateDay = (date: string) => {
    const matches = matchesByDate.get(date) ?? [];
    const hasSelection = playerTeamIds.length > 0;
    matches.forEach((match) => {
      if (match.homeScore !== undefined && match.awayScore !== undefined) return;
      const isPlayerMatch =
        hasSelection &&
        (playerTeamIds.includes(match.home.id) || playerTeamIds.includes(match.away.id));
      if (isPlayerMatch) return;
      const result = simulateMatchResult(match.home, match.away);
      onUpdateMatch(match.id, {
        homeScore: result.homeGoals,
        awayScore: result.awayGoals,
        overtime: result.overtime,
        shootout: result.shootout,
      });
    });
  };

  if (orderedDates.length === 0) {
    return <Text>Нет матчей для отображения.</Text>;
  }

  const scrollByAmount = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = direction === "left" ? -320 : 320;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <Box mb={4}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Heading size="sm">Календарь</Heading>
        <Box display="flex" gap={2}>
          <Button size="xs" variant="outline" onClick={() => scrollByAmount("left")} aria-label="Назад">
            ◀
          </Button>
          <Button size="xs" variant="outline" onClick={() => scrollByAmount("right")} aria-label="Вперёд">
            ▶
          </Button>
        </Box>
      </Box>
      <Box
        ref={scrollRef}
        display="flex"
        gap={3}
        overflowX="auto"
        pb={2}
        scrollSnapType="x mandatory"
      >
        {orderedDates.map((date) => {
          const matches = matchesByDate.get(date) ?? [];
          const isActiveDay = activeDate === date;
          const hasSelection = playerTeamIds.length > 0;
          const canSimulateAny = matches.some((match) => {
            if (match.homeScore !== undefined && match.awayScore !== undefined) return false;
            const isPlayerMatch =
              hasSelection &&
              (playerTeamIds.includes(match.home.id) || playerTeamIds.includes(match.away.id));
            return !isPlayerMatch;
          });
          const allowSimulateDay = isActiveDay && canSimulateAny;
          const isUpcoming = activeDate !== null && date > activeDate;
          return (
            <Box
              key={date}
              minW="280px"
              flex="0 0 280px"
              p={3}
              borderWidth={1}
              borderRadius="md"
              borderColor={isActiveDay ? "blue.400" : isUpcoming ? "gray.200" : "gray.100"}
              background={isActiveDay ? "blue.50" : isUpcoming ? "gray.50" : "white"}
              scrollSnapAlign="start"
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Heading size="xs">{getDisplayDate(date)}</Heading>
                {allowSimulateDay && (
                  <Button size="xs" variant="outline" onClick={() => handleSimulateDay(date)} aria-label="Симулировать день">
                    ⏵
                  </Button>
                )}
              </Box>
              {isActiveDay && (
                <Text fontSize="xs" color="blue.600" mb={2}>
                  Активный день
                </Text>
              )}
              {isUpcoming && (
                <Text fontSize="xs" color="gray.500" mb={2}>
                  Предстоящие матчи
                </Text>
              )}
              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onUpdate={(updates) => onUpdateMatch(match.id, updates)}
                  isLocked={activeDate !== null && match.date > activeDate}
                  playerTeamIds={playerTeamIds}
                  useShortNames
                />
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default Calendar;
