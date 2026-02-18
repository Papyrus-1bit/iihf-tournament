import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { Box, Button, Slider, Text } from "@chakra-ui/react";
import { Team, Group } from "../types";

interface Props {
  teams: Team[];
  onCreate: (groups: Group[], unassigned: Team[], teamsPerGroup: number) => void;
}

const TournamentSetup: FC<Props> = ({ teams, onCreate }) => {
  const [numGroups, setNumGroups] = useState(2);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);

  const maxTeamsPerGroup = useMemo(
    () => Math.min(16, Math.max(2, teams.length)),
    [teams.length]
  );

  useEffect(() => {
    if (teamsPerGroup > maxTeamsPerGroup) {
      setTeamsPerGroup(maxTeamsPerGroup);
    }
  }, [teamsPerGroup, maxTeamsPerGroup]);

  const handleCreate = () => {
    if (teams.length === 0 || numGroups <= 0) return;
    const newGroups: Group[] = [];
    for (let i = 0; i < numGroups; i += 1) {
      newGroups.push({
        id: `group-${i + 1}`,
        name: `Group ${String.fromCharCode(65 + i)}`,
        teams: [],
        matches: [],
      });
    }

    const sorted = [...teams].sort(
      (a, b) => (b.ratingPoints ?? 0) - (a.ratingPoints ?? 0)
    );
    const groupCounts = newGroups.map(() => 0);
    const unassigned: Team[] = [];
    sorted.forEach((team) => {
      let target = -1;
      let minCount = Number.POSITIVE_INFINITY;
      newGroups.forEach((_group, idx) => {
        if (groupCounts[idx] < teamsPerGroup && groupCounts[idx] < minCount) {
          minCount = groupCounts[idx];
          target = idx;
        }
      });
      if (target === -1) {
        unassigned.push(team);
      } else {
        newGroups[target].teams.push(team);
        groupCounts[target] += 1;
      }
    });

    onCreate(newGroups, unassigned, teamsPerGroup);
  };

  return (
    <Box mb={4} borderWidth={1} borderRadius="md" p={3} maxW="720px" className="panel">
      <Text fontWeight="bold" mb={3}>Параметры групп</Text>
      <Box display="flex" alignItems="center" gap={4} flexWrap="wrap">
        <Box flex="1" minW="220px">
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Text fontSize="sm" color="gray.500">Количество групп</Text>
            <Text fontSize="sm" fontWeight="bold">{numGroups}</Text>
          </Box>
          <Slider.Root
            min={1}
            max={8}
            step={1}
            value={[numGroups]}
            onValueChange={(details) => setNumGroups(details.value[0] ?? 1)}
            colorScheme="blue"
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumb index={0} />
            </Slider.Control>
          </Slider.Root>
        </Box>
        <Box flex="1" minW="220px">
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Text fontSize="sm" color="gray.500">Команд в группе</Text>
            <Text fontSize="sm" fontWeight="bold">{teamsPerGroup}</Text>
          </Box>
          <Slider.Root
            min={2}
            max={maxTeamsPerGroup}
            step={1}
            value={[teamsPerGroup]}
            onValueChange={(details) => setTeamsPerGroup(details.value[0] ?? 2)}
            colorScheme="blue"
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumb index={0} />
            </Slider.Control>
          </Slider.Root>
        </Box>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={handleCreate}
          disabled={teams.length === 0}
        >
          Создать группы
        </Button>
      </Box>
      <Text fontSize="xs" color="gray.500" mt={2}>
        После выбора параметров нажмите кнопку, чтобы создать группы.
      </Text>
    </Box>
  );
};

export default TournamentSetup;
