import { useMemo, useState } from "react";
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

type DivisionFilter = "all" | 1 | 2 | 3;
type SortDirection = "asc" | "desc";
type SortColumn = "rank" | "team" | "ovr" | "gold" | "silver" | "bronze" | "finals" | "rating";

interface Props {
  ratings: RatingRow[];
  playerTeamIds?: string[];
  podium?: Record<string, PodiumCounts>;
  ratingDeltas?: Record<string, number>;
  selectedTeamId?: string | null;
  onSelectTeam?: (teamId: string) => void;
}

const emptyPodium: PodiumCounts = { gold: 0, silver: 0, bronze: 0, finals: 0 };

const getDivisionByRank = (rank: number): 1 | 2 | 3 => {
  if (rank <= 16) return 1;
  if (rank <= 24) return 2;
  return 3;
};

const RatingTable: FC<Props> = ({
  ratings,
  playerTeamIds = [],
  podium = {},
  ratingDeltas = {},
  selectedTeamId,
  onSelectTeam,
}) => {
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<SortColumn | null>(null);

  const rows = useMemo(
    () =>
      ratings.map((team, index) => {
        const rank = index + 1;
        return {
          ...team,
          rank,
          division: getDivisionByRank(rank),
          podium: podium[team.id] ?? emptyPodium,
          delta: ratingDeltas[team.id] ?? 0,
          isPlayerTeam: playerTeamIds.includes(team.id),
        };
      }),
    [ratings, podium, ratingDeltas, playerTeamIds]
  );

  const filtered = useMemo(
    () => rows.filter((row) => (divisionFilter === "all" ? true : row.division === divisionFilter)),
    [rows, divisionFilter]
  );

  const sorted = useMemo(() => {
    const next = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    const numberCompare = (a: number, b: number) => (a - b) * dir;

    next.sort((a, b) => {
      if (sortColumn === "rank") return numberCompare(a.rank, b.rank);
      if (sortColumn === "team") return a.name.localeCompare(b.name, "ru") * dir;
      if (sortColumn === "ovr") return numberCompare(a.ovr ?? -1, b.ovr ?? -1);
      if (sortColumn === "gold") return numberCompare(a.podium.gold, b.podium.gold);
      if (sortColumn === "silver") return numberCompare(a.podium.silver, b.podium.silver);
      if (sortColumn === "bronze") return numberCompare(a.podium.bronze, b.podium.bronze);
      if (sortColumn === "finals") return numberCompare(a.podium.finals, b.podium.finals);
      return numberCompare(a.rating, b.rating);
    });
    return next;
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection(column === "team" ? "asc" : "desc");
      return;
    }
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const renderHeaderCell = (column: SortColumn, label: string, align: "left" | "center" = "left") => (
    <Box
      className="rating-cell rating-header-cell"
      data-col-active={hoveredColumn === column}
      onMouseEnter={() => setHoveredColumn(column)}
      onMouseLeave={() => setHoveredColumn(null)}
      textAlign={align}
    >
      <button type="button" className="rating-sort-btn" onClick={() => handleSort(column)}>
        <span>{label}</span>
        <span className="rating-sort-indicator">{sortIndicator(column)}</span>
      </button>
    </Box>
  );

  if (ratings.length === 0) {
    return <Text>Нет данных по рейтингу</Text>;
  }

  return (
    <Box className="rating-table" onMouseLeave={() => {
      setHoveredRowId(null);
      setHoveredColumn(null);
    }}>
      <Box className="rating-table-toolbar">
        <Text className="ui-subtitle">Фильтр по дивизионам</Text>
        <Box className="rating-table-filters">
          <button
            type="button"
            className="rating-filter-btn"
            data-active={divisionFilter === "all"}
            onClick={() => setDivisionFilter("all")}
          >
            Все
          </button>
          <button
            type="button"
            className="rating-filter-btn"
            data-active={divisionFilter === 1}
            onClick={() => setDivisionFilter(1)}
          >
            Див 1
          </button>
          <button
            type="button"
            className="rating-filter-btn"
            data-active={divisionFilter === 2}
            onClick={() => setDivisionFilter(2)}
          >
            Див 2
          </button>
          <button
            type="button"
            className="rating-filter-btn"
            data-active={divisionFilter === 3}
            onClick={() => setDivisionFilter(3)}
          >
            Див 3
          </button>
        </Box>
      </Box>
      <Box className="rating-table-body">
        <Box fontWeight="bold" className="rating-row rating-header">
          {renderHeaderCell("rank", "#")}
          {renderHeaderCell("team", "Команда")}
          {renderHeaderCell("ovr", "OVR", "center")}
          {renderHeaderCell("gold", "1", "center")}
          {renderHeaderCell("silver", "2", "center")}
          {renderHeaderCell("bronze", "3", "center")}
          {renderHeaderCell("finals", "Фин", "center")}
          {renderHeaderCell("rating", "Рейтинг")}
        </Box>
        {sorted.length === 0 && (
          <Box className="rating-cell">
            <Text fontSize="sm" color="gray.500">
              Нет команд в выбранном дивизионе.
            </Text>
          </Box>
        )}
        {sorted.map((team) => {
          const delta = team.delta;
          const deltaColor = delta > 0 ? "green.600" : delta < 0 ? "red.600" : "gray.500";
          const isSelected = selectedTeamId === team.id;
          return (
            <Box
              key={team.id}
              className="table-row rating-row"
              data-division={team.division}
              data-player={team.isPlayerTeam}
              data-selected={isSelected}
              data-row-active={hoveredRowId === team.id}
              data-testid={`rating-row-${team.id}`}
              onClick={() => onSelectTeam?.(team.id)}
              onMouseEnter={() => setHoveredRowId(team.id)}
              cursor={onSelectTeam ? "pointer" : "default"}
            >
              <Box
                className="rating-cell rating-rank-cell"
                data-col-active={hoveredColumn === "rank"}
                data-intersection={hoveredColumn === "rank" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("rank")}
              >
                {team.rank}
              </Box>
              <Box
                className="rating-cell"
                data-col-active={hoveredColumn === "team"}
                data-intersection={hoveredColumn === "team" && hoveredRowId === team.id}
                display="flex"
                alignItems="center"
                gap={2}
                onMouseEnter={() => setHoveredColumn("team")}
              >
                <span className="rating-flag">
                  <Flag code={team.flagCode} name={team.name} size={20} />
                </span>
                <Text fontWeight="bold">{team.name}</Text>
              </Box>
              <Box
                className="rating-cell"
                textAlign="center"
                data-col-active={hoveredColumn === "ovr"}
                data-intersection={hoveredColumn === "ovr" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("ovr")}
              >
                {team.ovr !== undefined ? team.ovr : "—"}
              </Box>
              <Box
                className="rating-cell"
                textAlign="center"
                data-col-active={hoveredColumn === "gold"}
                data-intersection={hoveredColumn === "gold" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("gold")}
              >
                {team.podium.gold}
              </Box>
              <Box
                className="rating-cell"
                textAlign="center"
                data-col-active={hoveredColumn === "silver"}
                data-intersection={hoveredColumn === "silver" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("silver")}
              >
                {team.podium.silver}
              </Box>
              <Box
                className="rating-cell"
                textAlign="center"
                data-col-active={hoveredColumn === "bronze"}
                data-intersection={hoveredColumn === "bronze" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("bronze")}
              >
                {team.podium.bronze}
              </Box>
              <Box
                className="rating-cell"
                textAlign="center"
                data-col-active={hoveredColumn === "finals"}
                data-intersection={hoveredColumn === "finals" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("finals")}
              >
                {team.podium.finals}
              </Box>
              <Box
                className="rating-cell"
                textAlign="left"
                data-col-active={hoveredColumn === "rating"}
                data-intersection={hoveredColumn === "rating" && hoveredRowId === team.id}
                onMouseEnter={() => setHoveredColumn("rating")}
              >
                <Text as="span" fontWeight="bold">
                  {team.rating.toFixed(0)}
                </Text>{" "}
                {delta !== 0 && (
                  <Text as="span" fontSize="sm" color={deltaColor}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {delta > 0 ? <FiTrendingUp /> : <FiTrendingDown />} {Math.abs(delta)}
                    </span>
                  </Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default RatingTable;
