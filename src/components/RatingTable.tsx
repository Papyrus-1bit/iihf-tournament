import type { FC } from "react";
import { Box, Text } from "@chakra-ui/react";
import Flag from "./Flag";

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
}

const RatingTable: FC<Props> = ({ ratings, baseRanks = {}, playerTeamIds = [] }) => {
  if (ratings.length === 0) {
    return <Text>Нет данных по рейтингу</Text>;
  }

  return (
    <Box className="panel" p={3}>
      <Box>
        <Box fontWeight="bold" display="flex" justifyContent="space-between" mb={2}>
          <Box flex={1}>#</Box>
          <Box flex={4}>Команда</Box>
          <Box flex={1} textAlign="center">OVR</Box>
          <Box flex={2} textAlign="right">Рейтинг</Box>
        </Box>
        {ratings.map((team, index) => {
          const currentRank = index + 1;
          const baseRank = baseRanks[team.id];
          const delta = baseRank ? baseRank - currentRank : 0;
          const deltaText = delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}`;
          const deltaColor = delta > 0 ? "green.600" : delta < 0 ? "red.600" : "gray.500";
          const highlight = playerTeamIds.includes(team.id) ? { background: "green.50" } : undefined;
          return (
            <Box
              key={team.id}
              display="flex"
              justifyContent="space-between"
              py={1}
              style={highlight}
              className="table-row"
            >
              <Box flex={1}>{currentRank}</Box>
              <Box flex={4} display="flex" alignItems="center" gap={2}>
                <Flag code={team.flagCode} name={team.name} />
                <Text fontWeight="bold">{team.name}</Text>
              </Box>
              <Box flex={1} textAlign="center">
                {team.ovr !== undefined ? team.ovr : "—"}
              </Box>
              <Box flex={2} textAlign="right">
                <Text as="span" fontWeight="bold">
                  {team.rating.toFixed(0)}
                </Text>{" "}
                <Text as="span" fontSize="sm" color={deltaColor}>
                  {deltaText}
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
