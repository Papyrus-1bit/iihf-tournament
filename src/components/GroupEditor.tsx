import { useState } from "react";
import type { FC, DragEvent, Dispatch, SetStateAction } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import { FiUser } from "react-icons/fi";
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
  lineCards?: boolean;
}

type DivisionFilter = "all" | "d1" | "d2" | "d3";

const GroupEditor: FC<Props> = ({
  groups,
  setGroups,
  allTeams,
  unassigned,
  setUnassigned,
  playerTeamIds,
  onTogglePlayerTeam,
  maxTeamsPerGroup,
  lineCards = false,
}) => {
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("all");

  const getDivision = (team: Team): Exclude<DivisionFilter, "all"> => {
    const rank = team.iihfRank ?? Number.POSITIVE_INFINITY;
    if (rank <= 16) return "d1";
    if (rank <= 24) return "d2";
    return "d3";
  };

  const getDivisionLabel = (team: Team) => {
    const division = getDivision(team);
    return division === "d1" ? "Див 1" : division === "d2" ? "Див 2" : "Див 3";
  };

  const isInDivision = (team: Team, filter: DivisionFilter) =>
    filter === "all" ? true : getDivision(team) === filter;

  const normalize = (value: number, min: number, max: number) => {
    if (max <= min) return 0.5;
    return (value - min) / (max - min);
  };

  const buildStrengthContext = (pool: Team[]) => {
    const ratings = pool.map((item) => item.ratingPoints ?? 0);
    const ovrs = pool.map((item) => item.ovr ?? 0);
    const rankValues = pool.map((item) =>
      item.iihfRank ? 1 / Math.max(item.iihfRank, 1) : 0
    );
    return {
      ratingMin: Math.min(...ratings),
      ratingMax: Math.max(...ratings),
      ovrMin: Math.min(...ovrs),
      ovrMax: Math.max(...ovrs),
      rankMin: Math.min(...rankValues),
      rankMax: Math.max(...rankValues),
    };
  };

  const getCompositeStrength = (
    team: Team,
    context: {
      ratingMin: number;
      ratingMax: number;
      ovrMin: number;
      ovrMax: number;
      rankMin: number;
      rankMax: number;
    }
  ) => {
    const ratingNorm = normalize(team.ratingPoints ?? 0, context.ratingMin, context.ratingMax);
    const ovrNorm = normalize(team.ovr ?? 0, context.ovrMin, context.ovrMax);
    const rankNorm = normalize(
      team.iihfRank ? 1 / Math.max(team.iihfRank, 1) : 0,
      context.rankMin,
      context.rankMax
    );

    // Multi-factor strength (not only OVR): rating points + OVR + IIHF rank.
    return ratingNorm * 0.55 + ovrNorm * 0.3 + rankNorm * 0.15;
  };

  const handleAutoDistribute = (filter: DivisionFilter = divisionFilter) => {
    const capacity = maxTeamsPerGroup ?? Number.POSITIVE_INFINITY;
    const fullPool = Array.from(new Map(allTeams.map((team) => [team.id, team])).values());
    const pool = fullPool.filter((team) => isInDivision(team, filter));
    if (pool.length === 0 || groups.length === 0) return;

    const uniquePool = Array.from(new Map(pool.map((team) => [team.id, team])).values());
    const strengthContext = buildStrengthContext(uniquePool);
    const scored = uniquePool
      .map((team) => ({
        team,
        score: getCompositeStrength(team, strengthContext),
      }))
      .sort((a, b) => b.score - a.score);

    const pots: Array<Array<{ team: Team; score: number }>> = [];
    for (let i = 0; i < scored.length; i += groups.length) {
      pots.push(scored.slice(i, i + groups.length));
    }

    const nextGroups = groups.map((group) => ({ ...group, teams: [] as Team[] }));
    const totals = nextGroups.map(() => 0);
    const nextUnassigned: Team[] = [];

    pots.forEach((pot) => {
      const shuffledPot = [...pot]
        .map((item) => ({ ...item, jitteredScore: item.score + (Math.random() - 0.5) * 0.12 }))
        .sort((a, b) => b.jitteredScore - a.jitteredScore);

      shuffledPot.forEach(({ team, score }) => {
        const eligible = nextGroups
          .map((_group, index) => index)
          .filter((index) => nextGroups[index].teams.length < capacity);
        if (eligible.length === 0) {
          nextUnassigned.push(team);
          return;
        }

        const minTotal = Math.min(...eligible.map((index) => totals[index]));
        const nearBalanced = eligible.filter((index) => totals[index] <= minTotal + 0.04);
        const minSize = Math.min(
          ...nearBalanced.map((index) => nextGroups[index].teams.length)
        );
        const smallest = nearBalanced.filter(
          (index) => nextGroups[index].teams.length === minSize
        );
        const targetIndex = smallest[Math.floor(Math.random() * smallest.length)];
        nextGroups[targetIndex].teams.push(team);
        totals[targetIndex] += score;
      });
    });

    const assignedIds = new Set(nextGroups.flatMap((group) => group.teams.map((team) => team.id)));
    uniquePool.forEach((team) => {
      if (!assignedIds.has(team.id) && !nextUnassigned.find((item) => item.id === team.id)) {
        nextUnassigned.push(team);
      }
    });

    const filteredOut = fullPool.filter((team) => !isInDivision(team, filter));
    setGroups(nextGroups);
    setUnassigned([...filteredOut, ...nextUnassigned]);
    setDivisionFilter(filter);
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
    const ovrLabel = team.ovr ? `OVR ${team.ovr}` : "OVR —";
    const divisionLabel = getDivisionLabel(team);
    const cardClass = lineCards ? "team-card team-card--line" : "team-card";
    const flagSize = lineCards ? 24 : 28;
    return (
    <Box
      key={team.id}
      draggable
      onDragStart={handleDragStart(team.id, fromId)}
      onClick={() => onTogglePlayerTeam(team.id)}
      mb={0}
      cursor="grab"
      display="inline-flex"
      alignItems="center"
      gap={2}
      className={cardClass}
      data-selected={isSelected}
    >
      <Flag code={team.flagCode} name={team.name} size={flagSize} />
      <Box className="team-card__line">
        <span className="team-card__name">{team.name}</span>
        <span className="team-card__meta-inline">{ovrLabel}</span>
        <span className="team-card__meta-inline">{divisionLabel}</span>
      </Box>
      {isSelected && (
        <span className="team-card__person" title="Выбранная команда">
          <FiUser />
        </span>
      )}
    </Box>
    );
  };

  return (
    <Box mb={4}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} gap={2}>
        <Text className="ui-section-title">Распределение команд по группам</Text>
        <Button size="sm" variant="outline" onClick={() => handleAutoDistribute()}>
          Автораспределение
        </Button>
      </Box>
      <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
        <Button
          size="xs"
          variant={divisionFilter === "all" ? "solid" : "outline"}
          onClick={() => handleAutoDistribute("all")}
        >
          Все команды
        </Button>
        <Button
          size="xs"
          variant={divisionFilter === "d1" ? "solid" : "outline"}
          onClick={() => handleAutoDistribute("d1")}
        >
          Дивизион 1
        </Button>
        <Button
          size="xs"
          variant={divisionFilter === "d2" ? "solid" : "outline"}
          onClick={() => handleAutoDistribute("d2")}
        >
          Дивизион 2
        </Button>
        <Button
          size="xs"
          variant={divisionFilter === "d3" ? "solid" : "outline"}
          onClick={() => handleAutoDistribute("d3")}
        >
          Дивизион 3
        </Button>
      </Box>
      <Box mb={2} />

      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={3}>
        {groups.map((group, gi) => (
          <Box
            key={group.id}
            p={3}
            minH="160px"
            onDrop={handleDrop(group.id)}
            onDragOver={handleDragOver}
            className="group-panel"
          >
            <Box mb={2} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
              <input
                value={group.name}
                onChange={(e) => handleGroupNameChange(gi, e.target.value)}
                className="ui-input"
                style={{ width: "100%" }}
              />
              <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">
                {maxTeamsPerGroup
                  ? `${group.teams.length}/${maxTeamsPerGroup} команд`
                  : `${group.teams.length} команд`}
              </Text>
            </Box>
            {group.teams.length === 0 && (
              <Text fontSize="sm" color="gray.500">Перетащите команды в эту группу</Text>
            )}
            <Box
              display="flex"
              flexWrap={lineCards ? "wrap" : "wrap"}
              flexDirection="row"
              gap={2}
              className={lineCards ? "team-list team-list--line" : "team-list"}
            >
              {group.teams.map((team) => renderTeam(team, group.id))}
            </Box>
          </Box>
        ))}
      </Box>
      <Box
        mt={6}
        mb={4}
        p={3}
        minH="120px"
        onDrop={handleDrop("unassigned")}
        onDragOver={handleDragOver}
        className="group-panel"
      >
        <Text className="ui-section-title" style={{ marginBottom: 8 }}>
          Замены
        </Text>
        {unassigned.length === 0 && (
          <Text fontSize="sm" color="gray.500">Перетащите команды сюда, чтобы удалить их из групп.</Text>
        )}
        <Box
          display="flex"
          flexWrap={lineCards ? "wrap" : "wrap"}
          flexDirection="row"
          gap={2}
          className={lineCards ? "team-list team-list--line" : "team-list"}
        >
          {unassigned.map((team) => renderTeam(team, "unassigned"))}
        </Box>
      </Box>
    </Box>
  );
};

export default GroupEditor;
