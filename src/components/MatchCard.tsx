import { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { FiPlay } from "react-icons/fi";
import { Match } from "../types";
import { simulateMatchResult } from "../simulation";
import FederationLogo from "./FederationLogo";
import { IconButton } from "../ui";

interface Props {
  match: Match;
  onUpdate: (updates: Partial<Match>) => void;
  isLocked: boolean;
  playerTeamIds: string[];
  useShortNames?: boolean;
  featured?: boolean;
  compact?: boolean;
}

const MatchCard: React.FC<Props> = ({
  match,
  onUpdate,
  isLocked,
  playerTeamIds,
  useShortNames = false,
  featured = false,
  compact = false,
}) => {
  const [homeScore, setHomeScore] = useState(
    match.homeScore !== undefined ? String(match.homeScore) : "0"
  );
  const [awayScore, setAwayScore] = useState(
    match.awayScore !== undefined ? String(match.awayScore) : "0"
  );
  const [isOvertime, setIsOvertime] = useState(!!match.overtime);
  const [isShootout, setIsShootout] = useState(!!match.shootout);

  const hasSelection = playerTeamIds.length > 0;
  const isPlayerMatch =
    hasSelection &&
    (playerTeamIds.includes(match.home.id) || playerTeamIds.includes(match.away.id));
  const manualEnabled = !isLocked;
  const simulateEnabled = !isLocked;
  const isPlayed = match.homeScore !== undefined && match.awayScore !== undefined;
  const roundLabels: Record<string, string> = {
    R16: "1/8",
    QF: "1/4",
    SF: "1/2",
    F: "Финал",
    "3P": "За 3-е",
  };

  useEffect(() => {
    setHomeScore(match.homeScore !== undefined ? String(match.homeScore) : "0");
    setAwayScore(match.awayScore !== undefined ? String(match.awayScore) : "0");
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
    setHomeScore(String(nextHome));
    setAwayScore(String(nextAway));
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

  if (compact) {
    const extraLabel = match.shootout ? "Б" : match.overtime ? "ОТ" : null;
    return (
      <Box
        borderWidth={1}
        borderRadius="md"
        p={2}
        mb={2}
        opacity={isLocked ? 0.6 : 1}
        className="match-card"
        data-player={isPlayerMatch}
        data-compact="true"
      >
        <Box className="match-compact-row">
          <Box className="match-compact-team">
            <FederationLogo code={match.home.flagCode} name={match.home.name} size={26} />
            <span>{getShortName(match.home.name)}</span>
          </Box>
          <span className="match-compact-score">
            <input
              className="match-score-input match-score-input--compact"
              value={homeScore}
              onChange={(e) => {
                const next = e.target.value;
                setHomeScore(next);
                tryUpdateScores(next, awayScore, isOvertime, isShootout);
              }}
              disabled={!manualEnabled}
              inputMode="numeric"
              onFocus={(e) => e.currentTarget.select()}
            />
            <span className="match-score-sep">-</span>
            <input
              className="match-score-input match-score-input--compact"
              value={awayScore}
              onChange={(e) => {
                const next = e.target.value;
                setAwayScore(next);
                tryUpdateScores(homeScore, next, isOvertime, isShootout);
              }}
              disabled={!manualEnabled}
              inputMode="numeric"
              onFocus={(e) => e.currentTarget.select()}
            />
            {extraLabel && <span className="match-compact-ot">{extraLabel}</span>}
            {marker && <span className="match-compact-marker" data-result={marker}>{marker}</span>}
          </span>
          <Box className="match-compact-team right">
            <span>{getShortName(match.away.name)}</span>
            <FederationLogo code={match.away.flagCode} name={match.away.name} size={26} />
          </Box>
          {!isPlayed && (
            <IconButton
              onClick={handleSimulate}
              disabled={!simulateEnabled}
              aria-label="Симулировать матч"
            >
              <FiPlay />
            </IconButton>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      borderWidth={1}
      borderRadius="md"
      p={3}
      mb={3}
      opacity={isLocked ? 0.6 : 1}
      className="match-card"
      data-player={isPlayerMatch}
      data-featured={featured}
    >
      <Box className="match-card-header">
        <span>
          {match.stage === "group" && match.groupName
            ? match.groupName
            : match.stage === "playoff" && match.round
            ? roundLabels[match.round] ?? match.round
            : "Матч"}
        </span>
        {marker && (
          <span
            className="match-card-marker"
            style={{
              color: marker.endsWith("W")
                ? "#22c55e"
                : marker === "T"
                ? "rgba(245,245,247,0.6)"
                : "#ef4444",
            }}
          >
            {marker}
          </span>
        )}
      </Box>
      <Box className="match-card-main">
        <Box className="match-team">
          <FederationLogo code={match.home.flagCode} name={match.home.name} size={40} />
          <Box>
            <Text className="match-team-name">{getShortName(match.home.name)}</Text>
            <Text className="match-team-meta">
              {match.home.ovr ? `OVR ${match.home.ovr}` : "OVR —"}
            </Text>
          </Box>
        </Box>
        <Box className="match-score">
          <input
            className="match-score-input"
            value={homeScore}
            onChange={(e) => {
              const next = e.target.value;
              setHomeScore(next);
              tryUpdateScores(next, awayScore, isOvertime, isShootout);
            }}
            placeholder="—"
            disabled={!manualEnabled}
            inputMode="numeric"
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="match-score-sep">VS</span>
          <input
            className="match-score-input"
            value={awayScore}
            onChange={(e) => {
              const next = e.target.value;
              setAwayScore(next);
              tryUpdateScores(homeScore, next, isOvertime, isShootout);
            }}
            placeholder="—"
            disabled={!manualEnabled}
            inputMode="numeric"
            onFocus={(e) => e.currentTarget.select()}
          />
        </Box>
        <Box className="match-team right">
          <Box>
            <Text className="match-team-name">{getShortName(match.away.name)}</Text>
            <Text className="match-team-meta">
              {match.away.ovr ? `OVR ${match.away.ovr}` : "OVR —"}
            </Text>
          </Box>
          <FederationLogo code={match.away.flagCode} name={match.away.name} size={40} />
        </Box>
      </Box>
      <Box className="match-card-controls">
        <Box className="match-card-toggle">
          <Text className="match-team-meta">СИМ</Text>
          {!isPlayed && (
            <IconButton
              onClick={handleSimulate}
              disabled={!simulateEnabled}
              aria-label="Симулировать матч"
            >
              <FiPlay />
            </IconButton>
          )}
        </Box>
        <Box className="match-card-toggle">
          <label className="match-toggle">
            <input
              type="checkbox"
              checked={isOvertime}
              onChange={() => {
                const next = !isOvertime;
                setIsOvertime(next);
                if (next) {
                  setIsShootout(false);
                }
                tryUpdateScores(homeScore, awayScore, next, false);
              }}
              disabled={!manualEnabled}
            />
            <span className="match-toggle-track" />
            <span className="match-toggle-text">ОТ</span>
          </label>
          <label className="match-toggle">
            <input
              type="checkbox"
              checked={isShootout}
              onChange={() => {
                const next = !isShootout;
                setIsShootout(next);
                if (next) {
                  setIsOvertime(false);
                }
                tryUpdateScores(homeScore, awayScore, false, next);
              }}
              disabled={!manualEnabled}
            />
            <span className="match-toggle-track" />
            <span className="match-toggle-text">Б</span>
          </label>
        </Box>
      </Box>
    </Box>
  );
};

export default MatchCard;
