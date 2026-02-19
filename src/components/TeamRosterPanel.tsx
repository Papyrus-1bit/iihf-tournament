import { useMemo, useState } from "react";
import type { FC } from "react";
import { Box, Text } from "@chakra-ui/react";
import type { RosterPlayer, TeamLine, TeamRoster } from "../types";

interface Props {
  roster: TeamRoster | null;
  teamName?: string;
  loading?: boolean;
}

const lineupTabs: Array<{ key: string; label: string }> = [
  { key: "5v5", label: "5v5" },
  { key: "PP", label: "PP" },
  { key: "PK", label: "PK" },
  { key: "3v3", label: "3v3" },
  { key: "Shootout", label: "Shootout" },
  { key: "extra_attacker", label: "Extra Attacker" },
];

const TeamRosterPanel: FC<Props> = ({ roster, teamName, loading = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("5v5");

  const players = useMemo(() => {
    if (!roster) return [] as RosterPlayer[];
    if (Array.isArray(roster.players) && roster.players.length > 0) {
      const unique = new Map(roster.players.map((player) => [player.id, player]));
      return Array.from(unique.values());
    }
    return [...roster.forwards, ...roster.defensemen, ...roster.goalies];
  }, [roster]);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );

  const avgOvr = useMemo(() => {
    if (roster?.team_ovr) return roster.team_ovr;
    const values = players
      .map((player) => player.overall)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [players, roster?.team_ovr]);

  const lines: TeamLine[] = useMemo(() => {
    if (!roster?.lineups) return [];
    const items = roster.lineups[activeTab];
    return Array.isArray(items) ? items : [];
  }, [roster, activeTab]);

  if (loading) {
    return (
      <Box className="ui-card roster-panel" data-testid="roster-panel">
        <Text className="ui-subtitle">Состав</Text>
        <Text fontSize="sm" color="gray.500" mt={2}>
          Загрузка ростера...
        </Text>
      </Box>
    );
  }

  if (!roster) {
    return (
      <Box className="ui-card roster-panel" data-testid="roster-panel">
        <Text className="ui-subtitle">Состав</Text>
        <Text fontSize="sm" color="gray.500" mt={2}>
          Выберите команду, чтобы посмотреть состав.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="ui-card roster-panel" data-testid="roster-panel">
      <Box className="roster-header">
        <Box>
          <Text className="ui-subtitle">Состав</Text>
          <Text className="roster-team-name">{teamName || roster.name}</Text>
        </Box>
        <Box className="roster-header-meta">
          {avgOvr !== null && <Text className="roster-team-ovr">Средний OVR {avgOvr}</Text>}
          <button
            type="button"
            className="roster-collapse-btn"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Скрыть состав" : "Показать состав"}
          </button>
        </Box>
      </Box>

      {expanded && (
        <>
          <Box className="roster-tab-row">
            {lineupTabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                className="roster-tab-btn"
                data-active={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </Box>

          {lines.length === 0 ? (
            <Text className="roster-empty">Нет данных по звеньям.</Text>
          ) : (
            <Box className="roster-line-grid">
              {lines.map((line) => (
                <Box key={`${activeTab}-${line.name}`} className="roster-line-card">
                  <Text className="roster-line-name">{line.name}</Text>
                  <Box className="roster-player-grid">
                    {line.player_ids.map((playerId) => {
                      const player = playersById.get(playerId);
                      if (!player) return null;
                      const avatarUrl =
                        player.photo_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=111218&color=fff&size=96`;
                      return (
                        <Box key={`${line.name}-${player.id}`} className="roster-player-card">
                          <span className="roster-player-position">{player.position || "—"}</span>
                          <img
                            src={avatarUrl}
                            alt={player.name}
                            className="roster-player-avatar"
                            loading="lazy"
                          />
                          <Text className="roster-player-name">{player.name}</Text>
                          <Text className="roster-player-club">{player.club || "—"}</Text>
                          <Text className="roster-player-ovr">
                            {typeof player.overall === "number" ? `OVR ${player.overall}` : "OVR —"}
                          </Text>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default TeamRosterPanel;
