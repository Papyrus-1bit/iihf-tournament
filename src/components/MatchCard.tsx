import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { FiPlay } from "react-icons/fi";
import { Match } from "../types";
import { simulateMatchResult } from "../simulation";
import Flag from "./Flag";

interface Props {
  match: Match;
  onUpdate: (updates: Partial<Match>) => void;
  isLocked: boolean;
  playerTeamIds: string[];
  useShortNames?: boolean;
}

const MatchCard: React.FC<Props> = ({
  match,
  onUpdate,
  isLocked,
  playerTeamIds,
  useShortNames = false,
}) => {
  const [homeScore, setHomeScore] = useState(match.homeScore ?? "");
  const [awayScore, setAwayScore] = useState(match.awayScore ?? "");
  const [isOvertime, setIsOvertime] = useState(!!match.overtime);
  const [isShootout, setIsShootout] = useState(!!match.shootout);

  const hasSelection = playerTeamIds.length > 0;
  const isPlayerMatch =
    hasSelection &&
    (playerTeamIds.includes(match.home.id) || playerTeamIds.includes(match.away.id));
  const manualEnabled = !isLocked;
  const simulateEnabled = !isLocked;
  const roundLabels: Record<string, string> = {
    R16: "1/8",
    QF: "1/4",
    SF: "1/2",
    F: "Финал",
    "3P": "За 3-е",
  };

  useEffect(() => {
    setHomeScore(match.homeScore ?? "");
    setAwayScore(match.awayScore ?? "");
    setIsOvertime(!!match.overtime);
    setIsShootout(!!match.shootout);
  }, [match.homeScore, match.awayScore, match.overtime, match.shootout]);

  const handleSimulate = () => {
    if (!simulateEnabled) return;
    const result = simulateMatchResult(match.home, match.away);
    updateMatch(result.homeGoals, result.awayGoals, result.overtime, result.shootout);
  };

  const parseScore = (value: string | number) => {
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const tryUpdateScores = (
    nextHomeScore: string | number,
    nextAwayScore: string | number,
    nextOvertime: boolean,
    nextShootout: boolean
  ) => {
    const homeParsed = parseScore(nextHomeScore);
    const awayParsed = parseScore(nextAwayScore);
    if (homeParsed === null || awayParsed === null) return;
    updateMatch(homeParsed, awayParsed, nextOvertime, nextShootout);
  };

  const updateMatch = (home: number, away: number, overtime: boolean, shootout: boolean) => {
    let nextHome = home;
    let nextAway = away;
    let nextOvertime = overtime;
    let nextShootout = shootout;

    if (match.stage === "playoff" && nextHome === nextAway) {
      const homeStrength =
        match.home.ratingPoints ?? (match.home.iihfRank ? 1 / match.home.iihfRank : 1);
      const awayStrength =
        match.away.ratingPoints ?? (match.away.iihfRank ? 1 / match.away.iihfRank : 1);
      const homeWinProb = homeStrength / (homeStrength + awayStrength);
      if (Math.random() < homeWinProb) {
        nextHome += 1;
      } else {
        nextAway += 1;
      }
      if (!nextOvertime && !nextShootout) {
        nextOvertime = true;
      }
    }

    onUpdate({
      homeScore: nextHome,
      awayScore: nextAway,
      overtime: nextOvertime,
      shootout: nextShootout,
    });
    setHomeScore(nextHome);
    setAwayScore(nextAway);
    setIsOvertime(nextOvertime);
    setIsShootout(nextShootout);
  };

  const getResultMarker = () => {
    if (match.homeScore === undefined || match.awayScore === undefined) return null;
    const priorityTeamId =
      playerTeamIds.find((id) => id === match.home.id || id === match.away.id) ?? match.home.id;
    const isHome = priorityTeamId === match.home.id;
    const teamGoals = isHome ? match.homeScore : match.awayScore;
    const oppGoals = isHome ? match.awayScore : match.homeScore;
    if (teamGoals === oppGoals) return "T";
    const won = teamGoals > oppGoals;
    if (match.shootout) return won ? "SOW" : "SOL";
    if (match.overtime) return won ? "OTW" : "OTL";
    return won ? "W" : "L";
  };

  const marker = getResultMarker();
  const extraValue = isShootout ? "SO" : isOvertime ? "OT" : "REG";
  const radioName = `extra-${match.id}`;

  const scoreInputStyle: CSSProperties = {
    width: "40px",
    padding: "2px 6px",
    border: "1px solid #CBD5E0",
    borderRadius: "6px",
    fontSize: "12px",
  };

  const getShortName = (name: string) => {
    if (!useShortNames) return name;
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

  // cast HStack to any due to mismatching Chakra typings
  const HStackAny = HStack as any;

  return (
    <Box
      borderWidth={1}
      borderRadius="md"
      p={2}
      mb={2}
      opacity={isLocked ? 0.6 : 1}
      className="match-card"
      data-player={isPlayerMatch}
    >
      <Box display="flex" alignItems="center" gap={2} mb={1} whiteSpace="nowrap">
        {match.stage === "group" && match.groupName && (
          <Text fontSize="xs" color="gray.600">
            {match.groupName}
          </Text>
        )}
        {match.stage === "playoff" && match.round && (
          <Text fontSize="xs" color="purple.600">
            {roundLabels[match.round] ?? match.round}
          </Text>
        )}
        <Box display="inline-flex" alignItems="center" gap={1}>
          <Text as="span" color={playerTeamIds.includes(match.home.id) ? "green.700" : "inherit"}>
            <Flag code={match.home.flagCode} name={match.home.name} /> {getShortName(match.home.name)}
          </Text>
        </Box>
        <Text as="span">—</Text>
        <Box display="inline-flex" alignItems="center" gap={1}>
          <Text as="span" color={playerTeamIds.includes(match.away.id) ? "green.700" : "inherit"}>
            <Flag code={match.away.flagCode} name={match.away.name} /> {getShortName(match.away.name)}
          </Text>
        </Box>
      </Box>
      <HStackAny spacing={2}>
        <input
          style={scoreInputStyle}
          value={homeScore}
          onChange={(e) => {
            const next = e.target.value;
            setHomeScore(next);
            tryUpdateScores(next, awayScore, isOvertime, isShootout);
          }}
          placeholder="Home"
          disabled={!manualEnabled}
        />
        <Text>-</Text>
        <input
          style={scoreInputStyle}
          value={awayScore}
          onChange={(e) => {
            const next = e.target.value;
            setAwayScore(next);
            tryUpdateScores(homeScore, next, isOvertime, isShootout);
          }}
          placeholder="Away"
          disabled={!manualEnabled}
        />
        <label>
          <input
            type="radio"
            name={radioName}
            value="REG"
            checked={extraValue === "REG"}
            onChange={() => {
              setIsOvertime(false);
              setIsShootout(false);
              tryUpdateScores(homeScore, awayScore, false, false);
            }}
            disabled={!manualEnabled}
          />{" "}
          60
        </label>
        <label>
          <input
            type="radio"
            name={radioName}
            value="OT"
            checked={extraValue === "OT"}
            onChange={() => {
              setIsOvertime(true);
              setIsShootout(false);
              tryUpdateScores(homeScore, awayScore, true, false);
            }}
            disabled={!manualEnabled}
          />{" "}
          ОТ
        </label>
        <label>
          <input
            type="radio"
            name={radioName}
            value="SO"
            checked={extraValue === "SO"}
            onChange={() => {
              setIsOvertime(false);
              setIsShootout(true);
              tryUpdateScores(homeScore, awayScore, false, true);
            }}
            disabled={!manualEnabled}
          />{" "}
          Б
        </label>
        {marker && (
          <Text fontWeight="bold" color={marker.endsWith("W") ? "green.600" : marker === "T" ? "gray.500" : "red.600"}>
            {marker}
          </Text>
        )}
        <Button
          colorScheme="blue"
          size="sm"
          onClick={handleSimulate}
          disabled={!simulateEnabled}
          aria-label="Симулировать матч"
        >
          <FiPlay />
        </Button>
      </HStackAny>
    </Box>
  );
};

export default MatchCard;
