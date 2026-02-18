import type { FC, DragEvent, Dispatch, SetStateAction } from "react";
import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { Group, Team } from "../types";
import Flag from "./Flag";

interface Props {
  groups: Group[];
  setGroups: Dispatch<SetStateAction<Group[]>>;
  allTeams: Team[];
  unassigned: Team[];
  setUnassigned: Dispatch<SetStateAction<Team[]>>;
  playerTeamIds: string[];
  onTogglePlayerTeam: (teamId: string) => void;
  maxTeamsPerGroup?: number;
}

const GroupEditor: FC<Props> = ({
  groups,
  setGroups,
  allTeams,
  unassigned,
  setUnassigned,
  playerTeamIds,
  onTogglePlayerTeam,
  maxTeamsPerGroup,
}) => {
  const getStrength = (team: Team) => {
    if (team.ratingPoints) return team.ratingPoints;
    if (team.iihfRank) return 1000 / team.iihfRank;
    return 1000;
  };

  const handleAutoDistribute = () => {
    const capacity = maxTeamsPerGroup ?? Number.POSITIVE_INFINITY;
    const pool = [...groups.flatMap((group) => group.teams), ...unassigned];
    if (pool.length === 0 || groups.length === 0) return;
    const sorted = [...pool].sort((a, b) => getStrength(b) - getStrength(a));
    const nextGroups = groups.map((group) => ({ ...group, teams: [] as Team[] }));
    const totals = nextGroups.map(() => 0);

    sorted.forEach((team) => {
      let targetIndex = 0;
      for (let i = 1; i < nextGroups.length; i += 1) {
        const sizeA = nextGroups[i].teams.length;
        const sizeB = nextGroups[targetIndex].teams.length;
        if (sizeA >= capacity) continue;
        if (sizeB >= capacity || totals[i] < totals[targetIndex]) {
          targetIndex = i;
        } else if (totals[i] === totals[targetIndex] && sizeA < sizeB) {
          targetIndex = i;
        }
      }
      if (nextGroups[targetIndex].teams.length < capacity) {
        nextGroups[targetIndex].teams.push(team);
        totals[targetIndex] += getStrength(team);
      }
    });

    setGroups(nextGroups);
    setUnassigned(
      pool.filter((team) => !nextGroups.some((group) => group.teams.find((t) => t.id === team.id)))
    );
  };
  const handleGroupNameChange = (groupIndex: number, name: string) => {
    const next = [...groups];
    next[groupIndex] = { ...next[groupIndex], name };
    setGroups(next);
  };

  const moveTeam = (teamId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    const team = allTeams.find((t) => t.id === teamId);
    if (!team) return;

    let nextGroups = groups.map((g) => ({
      ...g,
      teams: g.teams.filter((t) => t.id !== teamId),
    }));
    let nextUnassigned = unassigned.filter((t) => t.id !== teamId);

    if (toId === "unassigned") {
      nextUnassigned = [...nextUnassigned, team];
    } else {
      nextGroups = nextGroups.map((g) =>
        g.id === toId ? { ...g, teams: [...g.teams, team] } : g
      );
    }

    setGroups(nextGroups);
    setUnassigned(nextUnassigned);
  };

  const handleDragStart = (teamId: string, fromId: string) => (e: DragEvent) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ teamId, fromId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (toId: string) => (e: DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { teamId: string; fromId: string };
      moveTeam(data.teamId, data.fromId, toId);
    } catch {
      // ignore invalid drag payloads
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const renderTeam = (team: Team, fromId: string) => {
    const isSelected = playerTeamIds.includes(team.id);
    const ovrLabel = team.ovr ? `OVR ${team.ovr}` : null;
    return (
    <Box
      key={team.id}
      draggable
      onDragStart={handleDragStart(team.id, fromId)}
      onClick={() => onTogglePlayerTeam(team.id)}
      borderWidth={1}
      borderRadius="md"
      px={2}
      py={1}
      mb={0}
      cursor="grab"
      background={isSelected ? "green.50" : "white"}
      borderColor={isSelected ? "green.400" : "gray.200"}
      display="inline-flex"
      alignItems="center"
      gap={2}
      className="team-pill"
      data-selected={isSelected}
    >
      <Flag code={team.flagCode} name={team.name} /> {team.name}
      {ovrLabel && (
        <Text fontSize="xs" color="gray.500">{ovrLabel}</Text>
      )}
      {isSelected && <Text fontSize="xs" color="green.700">●</Text>}
    </Box>
    );
  };

  return (
    <Box mb={4}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Heading size="md">Распределение команд по группам</Heading>
        <Button size="sm" variant="outline" onClick={handleAutoDistribute}>
          Автораспределение
        </Button>
      </Box>
      <Text fontSize="sm" color="gray.500" mb={3}>
        Автораспределение перезапишет текущие группы и сбалансирует их по силе.
      </Text>

      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={3}>
        {groups.map((group, gi) => (
          <Box
            key={group.id}
            p={3}
            borderWidth={1}
            borderRadius="md"
            borderStyle="dashed"
            minH="160px"
            onDrop={handleDrop(group.id)}
            onDragOver={handleDragOver}
            className="panel"
          >
            <Box mb={2}>
              <input
                value={group.name}
                onChange={(e) => handleGroupNameChange(gi, e.target.value)}
                style={{ width: "100%" }}
              />
              <Text fontSize="sm" color="gray.500" mb={1}>
                {group.teams.length} команд
              </Text>
            </Box>
            {group.teams.length === 0 && (
              <Text fontSize="sm" color="gray.500">Перетащите команды в эту группу</Text>
            )}
            <Box display="flex" flexWrap="wrap" gap={2}>
              {group.teams.map((team) => renderTeam(team, group.id))}
            </Box>
          </Box>
        ))}
      </Box>
      <Box
        mb={4}
        p={3}
        borderWidth={1}
        borderRadius="md"
        borderStyle="dashed"
        minH="120px"
        onDrop={handleDrop("unassigned")}
        onDragOver={handleDragOver}
        className="panel"
      >
        <Heading size="sm" mb={2}>Нераспределённые команды</Heading>
        {unassigned.length === 0 && (
          <Text fontSize="sm" color="gray.500">Перетащите команды сюда, чтобы удалить их из групп.</Text>
        )}
        <Box display="flex" flexWrap="wrap" gap={2}>
          {unassigned.map((team) => renderTeam(team, "unassigned"))}
        </Box>
      </Box>
    </Box>
  );
};

export default GroupEditor;
