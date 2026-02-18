import type { FC } from "react";
import { Box, Text } from "@chakra-ui/react";
import { FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import Flag from "./Flag";
import type { PodiumCounts } from "../types";

interface RatingRow {
  id: string;
  name: string;
  flagCode: string;
  rating: number;
  ovr?: number;
}

interface Props {
  ratings: RatingRow[];
  baseRanks?: Record<string, number>;
  playerTeamIds?: string[];
  podium?: Record<string, PodiumCounts>;
  selectedTeamId?: string | null;
  onSelectTeam?: (teamId: string) => void;
}

const emptyPodium: PodiumCounts = { gold: 0, silver: 0, bronze: 0, finals: 0 };

const RatingTable: FC<Props> = ({
  ratings,
  baseRanks = {},
  playerTeamIds = [],
  podium = {},
  selectedTeamId,
  onSelectTeam,
}) => {
  if (ratings.length === 0) {
    return <Text>Нет данных по рейтингу</Text>;
  }

  return (
    <Box>
      <Box>
        <Box fontWeight="bold" mb={2} className="rating-row rating-header">
          <Box>#</Box>
          <Box>Команда</Box>
          <Box textAlign="center">OVR</Box>
          <Box textAlign="center">1</Box>
          <Box textAlign="center">2</Box>
          <Box textAlign="center">3</Box>
          <Box textAlign="center">Фин</Box>
          <Box textAlign="left">Рейтинг</Box>
        </Box>
        {ratings.map((team, index) => {
          const currentRank = index + 1;
          const baseRank = baseRanks[team.id];
          const delta = baseRank ? baseRank - currentRank : 0;
          const deltaColor = delta > 0 ? "green.600" : delta < 0 ? "red.600" : "gray.500";
          const podiumStats = podium[team.id] ?? emptyPodium;
          const highlight = playerTeamIds.includes(team.id)
            ? { background: "rgba(80, 200, 120, 0.12)" }
            : undefined;
          const isSelected = selectedTeamId === team.id;
          return (
            <Box
              key={team.id}
              py={1}
              style={highlight}
              className="table-row rating-row"
              data-selected={isSelected}
              data-testid={`rating-row-${team.id}`}
              onClick={() => onSelectTeam?.(team.id)}
              cursor={onSelectTeam ? "pointer" : "default"}
            >
              <Box>{currentRank}</Box>
              <Box display="flex" alignItems="center" gap={2}>
                <Flag code={team.flagCode} name={team.name} />
                <Text fontWeight="bold">{team.name}</Text>
              </Box>
              <Box textAlign="center">{team.ovr !== undefined ? team.ovr : "—"}</Box>
              <Box textAlign="center">{podiumStats.gold}</Box>
              <Box textAlign="center">{podiumStats.silver}</Box>
              <Box textAlign="center">{podiumStats.bronze}</Box>
              <Box textAlign="center">{podiumStats.finals}</Box>
              <Box textAlign="left">
                <Text as="span" fontWeight="bold">
                  {team.rating.toFixed(0)}
                </Text>{" "}
                <Text as="span" fontSize="sm" color={deltaColor}>
                  {delta === 0 ? (
                    "—"
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {delta > 0 ? <FiTrendingUp /> : <FiTrendingDown />} {Math.abs(delta)}
                    </span>
                  )}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default RatingTable;
