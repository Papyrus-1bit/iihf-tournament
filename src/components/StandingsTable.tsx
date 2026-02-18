import type { FC } from "react";
import { useState } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { Group } from "../types";
import { calculateGroupStats, calculateOverallStats } from "../standings";
import Flag from "./Flag";

interface Props {
  groups: Group[];
  playerTeamIds?: string[];
}

const StandingsTable: FC<Props> = ({ groups, playerTeamIds = [] }) => {
  const highlightRow = (teamId: string) =>
    playerTeamIds.includes(teamId) ? { background: "rgba(80, 200, 120, 0.12)" } : undefined;
  const [view, setView] = useState<"overall" | "groups">("overall");

  return (
    <Box>
      <Box mb={3} display="flex" alignItems="center" gap={2} flexWrap="wrap">
        <Text fontWeight="bold">Таблица</Text>
        <label>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as "overall" | "groups")}
            className="ui-select"
          >
            <option value="overall">Общая</option>
            <option value="groups">По группам</option>
          </select>
        </label>
      </Box>

      {view === "overall" && (
        <Box mb={6}>
          <Heading size="md" mb={2}>Общая таблица</Heading>
          <Box>
            <Box fontWeight="bold" display="flex" justifyContent="space-between" mb={2}>
              <Box flex={3}>Команда</Box>
              <Box flex={1} textAlign="center">GP</Box>
              <Box flex={1} textAlign="center">W</Box>
              <Box flex={1} textAlign="center">L</Box>
              <Box flex={1} textAlign="center">OT/SO</Box>
              <Box flex={1} textAlign="center">GF</Box>
              <Box flex={1} textAlign="center">GA</Box>
              <Box flex={1} textAlign="center">Pts</Box>
            </Box>
            {calculateOverallStats(groups.filter((group) => group.teams.length > 0)).map((t) => (
              <Box
                key={t.teamId}
                display="flex"
                justifyContent="space-between"
                py={1}
                style={highlightRow(t.teamId)}
                className="table-row"
              >
                <Box flex={3} display="flex" alignItems="center" gap={2}>
                  <Flag code={t.flagCode} name={t.teamName} /> {t.teamName}
                </Box>
                <Box flex={1} textAlign="center">{t.played}</Box>
                <Box flex={1} textAlign="center">{t.won}</Box>
                <Box flex={1} textAlign="center">{t.lost}</Box>
                <Box flex={1} textAlign="center">{t.ot}</Box>
                <Box flex={1} textAlign="center">{t.gf}</Box>
                <Box flex={1} textAlign="center">{t.ga}</Box>
                <Box flex={1} textAlign="center">{t.points}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      {view === "groups" && groups.filter((group) => group.teams.length > 0).map((group) => (
        <Box key={group.id} mb={4}>
          <Heading size="md" mb={2}>{group.name}</Heading>
          <Box>
            <Box fontWeight="bold" display="flex" justifyContent="space-between" mb={2}>
              <Box flex={3}>Команда</Box>
              <Box flex={1} textAlign="center">GP</Box>
              <Box flex={1} textAlign="center">W</Box>
              <Box flex={1} textAlign="center">L</Box>
              <Box flex={1} textAlign="center">OT/SO</Box>
              <Box flex={1} textAlign="center">GF</Box>
              <Box flex={1} textAlign="center">GA</Box>
              <Box flex={1} textAlign="center">Pts</Box>
            </Box>
            {calculateGroupStats(group).map((t) => (
              <Box
                key={t.teamId}
                display="flex"
                justifyContent="space-between"
                py={1}
                style={highlightRow(t.teamId)}
                className="table-row"
              >
                <Box flex={3} display="flex" alignItems="center" gap={2}>
                  <Flag code={t.flagCode} name={t.teamName} /> {t.teamName}
                </Box>
                <Box flex={1} textAlign="center">{t.played}</Box>
                <Box flex={1} textAlign="center">{t.won}</Box>
                <Box flex={1} textAlign="center">{t.lost}</Box>
                <Box flex={1} textAlign="center">{t.ot}</Box>
                <Box flex={1} textAlign="center">{t.gf}</Box>
                <Box flex={1} textAlign="center">{t.ga}</Box>
                <Box flex={1} textAlign="center">{t.points}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default StandingsTable;
