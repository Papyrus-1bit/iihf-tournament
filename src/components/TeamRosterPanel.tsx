import type { FC } from "react";
import { Box, Text } from "@chakra-ui/react";
import type { TeamRoster } from "../types";

interface Props {
  roster: TeamRoster | null;
  teamName?: string;
  loading?: boolean;
}

const renderGroup = (title: string, players: TeamRoster["forwards"]) => (
  <Box className="roster-group">
    <Text className="roster-group-title">{title}</Text>
    {players.length === 0 ? (
      <Text className="roster-empty">Нет данных</Text>
    ) : (
      <Box className="roster-list">
        {players.map((player) => (
          <Box key={player.id} className="roster-item">
            <Text className="roster-item-name">{player.name}</Text>
            <Text className="roster-item-meta">
              {player.club || "Клуб не указан"}
              {typeof player.overall === "number" ? ` · OVR ${player.overall}` : ""}
            </Text>
          </Box>
        ))}
      </Box>
    )}
  </Box>
);

const TeamRosterPanel: FC<Props> = ({ roster, teamName, loading = false }) => {
  if (loading) {
    return (
      <Box className="ui-card roster-panel" data-testid="roster-panel">
        <Text className="ui-subtitle">Состав команды</Text>
        <Text fontSize="sm" color="gray.500" mt={2}>
          Загрузка ростера...
        </Text>
      </Box>
    );
  }

  if (!roster) {
    return (
      <Box className="ui-card roster-panel" data-testid="roster-panel">
        <Text className="ui-subtitle">Состав команды</Text>
        <Text fontSize="sm" color="gray.500" mt={2}>
          Выберите команду, чтобы посмотреть состав.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="ui-card roster-panel" data-testid="roster-panel">
      <Box className="roster-header">
        <Text className="ui-subtitle">Состав команды</Text>
        <Text className="roster-team-name">{teamName || roster.name}</Text>
      </Box>
      <Box className="roster-grid">
        {renderGroup("Нападающие", roster.forwards)}
        {renderGroup("Защитники", roster.defensemen)}
        {renderGroup("Вратари", roster.goalies)}
      </Box>
    </Box>
  );
};

export default TeamRosterPanel;
