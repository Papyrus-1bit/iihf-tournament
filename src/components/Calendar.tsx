import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { FiChevronLeft, FiChevronRight, FiPlay } from "react-icons/fi";
import { Group, Match } from "../types";
import MatchCard from "./MatchCard";
import { simulateMatchResult } from "../simulation";
import { getDisplayDate } from "../scheduling";
import { IconButton } from "../ui";

interface Props {
  groups: Group[];
  playoffMatches: Match[];
  onUpdateMatch: (matchId: string, updates: Partial<Match>) => void;
  playerTeamIds: string[];
  embedded?: boolean;
}

const Calendar: React.FC<Props> = ({
  groups,
  playoffMatches,
  onUpdateMatch,
  playerTeamIds,
  embedded = false,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const groupMatches = useMemo(
    () => groups.flatMap((group) => group.matches),
    [groups]
  );
  const allMatches = useMemo(
    () => [...groupMatches, ...playoffMatches].filter((m) => m.date),
    [groupMatches, playoffMatches]
  );

  const hasSelection = playerTeamIds.length > 0;
  const [viewMode, setViewMode] = useState<"team" | "all">(
    hasSelection ? "team" : "all"
  );
  const [expandedOtherDates, setExpandedOtherDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    setViewMode(hasSelection ? "team" : "all");
  }, [hasSelection]);

  const selectedMatches = useMemo(() => {
    if (!hasSelection) return allMatches;
    const selected = new Set(playerTeamIds);
    return allMatches.filter(
      (match) => selected.has(match.home.id) || selected.has(match.away.id)
    );
  }, [allMatches, hasSelection, playerTeamIds]);

  const displayMatches = useMemo(() => {
    if (!hasSelection) return allMatches;
    return viewMode === "all" ? allMatches : selectedMatches;
  }, [allMatches, hasSelection, viewMode, selectedMatches]);

  const matchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    displayMatches.forEach((match) => {
      if (!map.has(match.date)) {
        map.set(match.date, []);
      }
      map.get(match.date)!.push(match);
    });
    return map;
  }, [displayMatches]);

  const matchesByDateAll = useMemo(() => {
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
    const allDates = Array.from(new Set(allMatches.map((match) => match.date))).sort();
    for (const date of allDates) {
      const matches = allMatches.filter((m) => m.date === date);
      if (matches.some((m) => m.homeScore === undefined || m.awayScore === undefined)) {
        return date;
      }
    }
    return null;
  }, [allMatches]);

  const focusNextDate = (date: string) => {
    const index = orderedDates.indexOf(date);
    if (index === -1) return;
    const nextDate = orderedDates[index + 1];
    if (!nextDate) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(
        `[data-date="${nextDate}"]`
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    });
  };

  const handleSimulateDay = (date: string, pool?: Match[], advanceFocus = false) => {
    const matches = pool ?? matchesByDate.get(date) ?? [];
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
    if (advanceFocus) {
      focusNextDate(date);
    }
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
    <Box mb={embedded ? 0 : 4}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} gap={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Heading size="sm">Расписание матчей</Heading>
        {hasSelection && (
          <label>
            <select
              className="ui-select"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as "team" | "all")}
            >
              <option value="team">Команда</option>
              <option value="all">Расписание матчей</option>
            </select>
          </label>
        )}
        </Box>
        <Box display="flex" gap={2}>
          <IconButton onClick={() => scrollByAmount("left")} aria-label="Назад">
            <FiChevronLeft />
          </IconButton>
          <IconButton onClick={() => scrollByAmount("right")} aria-label="Вперёд">
            <FiChevronRight />
          </IconButton>
        </Box>
      </Box>
      <Box
        ref={scrollRef}
        display="flex"
        gap={3}
        overflowX="auto"
        pb={2}
        scrollSnapType="x mandatory"
        className="calendar-strip"
      >
        {orderedDates.map((date) => {
          const matches = matchesByDate.get(date) ?? [];
          const allMatchesForDate = matchesByDateAll.get(date) ?? [];
          const isActiveDay = activeDate === date;
          const canSimulateAny = matches.some((match) => {
            if (match.homeScore !== undefined && match.awayScore !== undefined) return false;
            const isPlayerMatch =
              hasSelection &&
              (playerTeamIds.includes(match.home.id) || playerTeamIds.includes(match.away.id));
            return !isPlayerMatch;
          });
          const allowSimulateDay = isActiveDay && canSimulateAny;
          const isUpcoming = activeDate !== null && date > activeDate;
          const selectedSet = new Set(playerTeamIds);
          const otherMatches =
            hasSelection && viewMode === "team"
              ? allMatchesForDate.filter(
                  (match) =>
                    !selectedSet.has(match.home.id) && !selectedSet.has(match.away.id)
                )
              : [];
          const isOtherExpanded = expandedOtherDates.has(date);
          return (
            <Box
              key={date}
              minW="clamp(340px, 42vw, 560px)"
              flex="0 0 auto"
              p={3}
              scrollSnapAlign="start"
              className="calendar-day"
              data-upcoming={isUpcoming}
              data-date={date}
            >
              <Box className="calendar-day-header">
                <Box>
                  <Text className="calendar-day-title">{getDisplayDate(date)}</Text>
                  <Text className="calendar-day-subtitle">
                    {matches.length} матч{matches.length === 1 ? "" : matches.length < 5 ? "а" : "ей"}
                  </Text>
                </Box>
                {allowSimulateDay && (
                  <IconButton
                    onClick={() => handleSimulateDay(date, matches, true)}
                    aria-label="Симулировать день"
                  >
                    <FiPlay />
                  </IconButton>
                )}
              </Box>
              {matches.map((match, index) => {
                const isSelectedMatch =
                  playerTeamIds.includes(match.home.id) ||
                  playerTeamIds.includes(match.away.id);
                return (
                <MatchCard
                  key={match.id}
                  match={match}
                  onUpdate={(updates) => onUpdateMatch(match.id, updates)}
                  isLocked={activeDate !== null && match.date > activeDate}
                  playerTeamIds={playerTeamIds}
                  useShortNames
                  featured={index === 0}
                  compact={hasSelection && viewMode === "all" && !isSelectedMatch}
                />
              );
              })}
              {hasSelection && viewMode === "team" && otherMatches.length > 0 && (
                <Box mt={2} className="ui-section">
                  <Box display="flex" gap={2} flexWrap="wrap">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setExpandedOtherDates((prev) => {
                          const next = new Set(prev);
                          if (next.has(date)) {
                            next.delete(date);
                          } else {
                            next.add(date);
                          }
                          return next;
                        })
                      }
                    >
                      {isOtherExpanded ? "Скрыть другие игры" : "Другие игры"}
                    </Button>
                    {isOtherExpanded && isActiveDay && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleSimulateDay(date, otherMatches)}
                      >
                        Симулировать другие игры
                      </Button>
                    )}
                  </Box>
                  {isOtherExpanded && (
                    <Box mt={2} className="ui-section">
                      {otherMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          onUpdate={(updates) => onUpdateMatch(match.id, updates)}
                          isLocked={activeDate !== null && match.date > activeDate}
                          playerTeamIds={playerTeamIds}
                          useShortNames
                          compact
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default Calendar;
