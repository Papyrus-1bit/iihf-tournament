import { useMemo, useState } from "react";
import type { FC } from "react";
import { Box, Text } from "@chakra-ui/react";
import { FiShield, FiUser, FiX } from "react-icons/fi";
import type { RosterPlayer, TeamLine, TeamRoster } from "../types";
import Flag from "./Flag";

interface Props {
  roster: TeamRoster | null;
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

const roleLabel = (role: RosterPlayer["role"]) => {
  if (role === "goalie") return "Вратарь";
  if (role === "defenseman") return "Защитник";
  return "Нападающий";
};

const NON_NHL_CLUB_DOMAINS: Record<string, string> = {
  "Ambri-Piotta": "hcap.ch",
  "ZSC Lions": "zsclions.ch",
  "Eisbaeren Berlin": "eisbaeren.de",
  "EHC Red Bull Munich": "redbullmuenchen.de",
  "Fribourg-Gotteron": "fribourg-gotteron.ch",
  "HC Ocelari Trinec": "hcocelari.cz",
  "Severstal Cherepovets": "severstalclub.ru",
  SKA: "ska.ru",
};

const getClubLogoUrl = (club?: string) => {
  const normalized = (club || "").trim();
  if (!normalized) return null;
  if (/^[A-Z]{3}$/.test(normalized)) {
    return `https://assets.nhle.com/logos/nhl/svg/${normalized}_light.svg`;
  }
  const domain = NON_NHL_CLUB_DOMAINS[normalized];
  return domain ? `https://logo.clearbit.com/${domain}` : null;
};

const getClubShortCode = (club?: string) => {
  const normalized = (club || "").trim().toUpperCase();
  if (!normalized) return "—";
  if (/^[A-Z0-9]{2,4}$/.test(normalized)) return normalized;
  const words = normalized.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("");
};

const getPlayerCardTier = (overall?: number | null) => {
  if (typeof overall !== "number") return "base";
  if (overall >= 90) return "elite";
  if (overall >= 86) return "prime";
  if (overall >= 82) return "core";
  return "depth";
};

type LineBucket = "forward" | "defense" | "goalie" | "mixed";

const isRosterRole = (value: unknown): value is RosterPlayer["role"] =>
  value === "forward" || value === "defenseman" || value === "goalie";

const TeamRosterPanel: FC<Props> = ({ roster, loading = false }) => {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState("5v5");
  const [failedImages, setFailedImages] = useState<Record<string, true>>({});
  const [activePlayer, setActivePlayer] = useState<RosterPlayer | null>(null);

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

  const lineMembershipByPlayerId = useMemo(() => {
    const membership = new Map<string, string[]>();
    if (!roster?.lineups) return membership;

    Object.entries(roster.lineups).forEach(([tabKey, lines]) => {
      if (!Array.isArray(lines)) return;
      lines.forEach((line) => {
        const lineName = `${tabKey}: ${line.name}`;
        line.player_ids.forEach((playerId) => {
          const prev = membership.get(playerId) ?? [];
          prev.push(lineName);
          membership.set(playerId, prev);
        });
      });
    });

    return membership;
  }, [roster]);

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

  const isFiveOnFive = activeTab === "5v5";

  const lineBuckets = useMemo(() => {
    const buckets: Record<LineBucket, TeamLine[]> = {
      forward: [],
      defense: [],
      goalie: [],
      mixed: [],
    };
    if (!isFiveOnFive) return buckets;

    lines.forEach((line) => {
      const lineName = line.name.toLowerCase();

      if (/^f\d+/.test(lineName) || lineName.includes("forward")) {
        buckets.forward.push(line);
        return;
      }
      if (/^d\d+/.test(lineName) || lineName.includes("defense")) {
        buckets.defense.push(line);
        return;
      }
      if (lineName.includes("goal")) {
        buckets.goalie.push(line);
        return;
      }

      const uniqueRoles = new Set(
        line.player_ids
          .map((playerId) => playersById.get(playerId)?.role)
          .filter(isRosterRole)
      );

      if (uniqueRoles.size === 1) {
        const [role] = Array.from(uniqueRoles);
        if (role === "forward") {
          buckets.forward.push(line);
          return;
        }
        if (role === "defenseman") {
          buckets.defense.push(line);
          return;
        }
        buckets.goalie.push(line);
        return;
      }

      buckets.mixed.push(line);
    });

    return buckets;
  }, [isFiveOnFive, lines, playersById]);

  const lineupPlayers = useMemo(() => {
    const collect = (bucket: LineBucket) => {
      const items: Array<{ player: RosterPlayer; key: string }> = [];
      lineBuckets[bucket].forEach((line, lineIndex) => {
        line.player_ids.forEach((playerId, playerIndex) => {
          const player = playersById.get(playerId);
          if (!player) return;
          items.push({
            player,
            key: `${activeTab}-${bucket}-${line.name}-${lineIndex}-${playerIndex}-${player.id}`,
          });
        });
      });
      return items;
    };

    return {
      forward: collect("forward"),
      defense: collect("defense"),
      goalie: collect("goalie"),
      mixed: collect("mixed"),
    };
  }, [activeTab, lineBuckets, playersById]);

  const renderPlayerCard = (
    player: RosterPlayer,
    cardKey: string,
    options: { compact?: boolean; modal?: boolean } = {}
  ) => {
    if (!roster) return null;
    const { compact = false, modal = false } = options;
    const photoErrorKey = `${modal ? "photo-modal" : "photo"}-${player.id}`;
    const clubErrorKey = `${modal ? "club-modal" : "club"}-${player.id}`;
    const hasPhoto = !!player.photo_url && !failedImages[photoErrorKey];
    const clubLogoUrl = getClubLogoUrl(player.club);
    const hasClubLogo = !!clubLogoUrl && !failedImages[clubErrorKey];
    const ovrValue = typeof player.overall === "number" ? player.overall : "—";
    const meta = `${player.position || "—"}/${ovrValue} OVR`;
    const jersey = player.jersey_number ?? "—";
    const clubCode = getClubShortCode(player.club);
    const countryCode = roster.code;
    const countryName = roster.name;
    const className = [
      "roster-player-card",
      compact ? "roster-player-card--compact" : "",
      modal ? "roster-player-card--modal" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        key={cardKey}
        className={className}
        data-tier={getPlayerCardTier(player.overall)}
        onClick={modal ? undefined : () => setActivePlayer(player)}
      >
        <Box className="roster-player-media">
          {hasPhoto ? (
            <img
              src={player.photo_url || ""}
              alt={player.name}
              className="roster-player-avatar"
              loading="lazy"
              onError={() =>
                setFailedImages((prev) => {
                  if (prev[photoErrorKey]) return prev;
                  return { ...prev, [photoErrorKey]: true };
                })
              }
            />
          ) : (
            <Box className="roster-player-avatar-placeholder" aria-hidden="true">
              <FiUser />
            </Box>
          )}
          <Box className="roster-player-team">
            {hasClubLogo ? (
              <img
                src={clubLogoUrl || ""}
                alt={player.club || "club"}
                className="roster-player-team-logo"
                loading="lazy"
                onError={() =>
                  setFailedImages((prev) => {
                    if (prev[clubErrorKey]) return prev;
                    return { ...prev, [clubErrorKey]: true };
                  })
                }
              />
            ) : (
              <span className="roster-player-team-placeholder" aria-hidden="true">
                <FiShield />
              </span>
            )}
            <span className="roster-player-team-code">{clubCode}</span>
          </Box>
        </Box>
        <Box className="roster-player-info">
          <Box className="roster-player-meta-line">
            <span className="roster-player-country">
              <Flag code={countryCode} name={countryName} size={compact ? 9 : 11} />
            </span>
            <Text className="roster-player-meta">{meta}</Text>
          </Box>
          <span className="roster-player-number">{jersey}</span>
          <Text className="roster-player-name">{player.name}</Text>
        </Box>
      </button>
    );
  };

  const renderRoleBlock = (
    role: LineBucket,
    title: string,
    emptyText: string
  ) => {
    const rolePlayers = lineupPlayers[role];
    return (
      <Box className="roster-role-block" data-role={role}>
        <Text className="roster-role-title">{title}</Text>
        <Box className="roster-role-content">
          {rolePlayers.length > 0 ? (
            <Box className="roster-role-grid" data-role={role}>
              {rolePlayers.map(({ player, key }) =>
                renderPlayerCard(player, key, { compact: true })
              )}
            </Box>
          ) : (
            <Text className="roster-empty">{emptyText}</Text>
          )}
        </Box>
      </Box>
    );
  };

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
    <>
      <Box className="ui-card roster-panel" data-testid="roster-panel">
        <Box className="roster-header">
          <Text className="roster-title">Состав</Text>
          <Box className="roster-header-meta">
            {avgOvr !== null && <Text className="roster-team-ovr">OVR {avgOvr}</Text>}
            <button
              type="button"
              className="roster-collapse-btn"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              <span>{expanded ? "Скрыть состав" : "Показать состав"}</span>
              <span className="roster-collapse-arrow" data-expanded={expanded}>
                ▾
              </span>
            </button>
          </Box>
        </Box>

        <Box className="roster-collapsible" data-expanded={expanded}>
          <Box className="roster-collapsible-inner">
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
              <>
                {isFiveOnFive ? (
                  <Box key={activeTab} className="roster-lineup-stage roster-lineup-stage--overview">
                    <Box className="roster-overview-layout">
                      <Box className="roster-overview-col roster-overview-col--forwards">
                        {renderRoleBlock("forward", "Нападение", "Нет игроков нападения.")}
                      </Box>
                      <Box className="roster-overview-col roster-overview-col--right">
                        {renderRoleBlock("defense", "Защитники", "Нет защитников.")}
                        {renderRoleBlock("goalie", "Вратари", "Нет вратарей.")}
                      </Box>
                    </Box>

                    {lineupPlayers.mixed.length > 0 &&
                      renderRoleBlock("mixed", "Спец-блок", "Нет дополнительных слотов.")}
                  </Box>
                ) : (
                  <Box key={activeTab} className="roster-line-grid">
                    {lines.map((line, lineIndex) => (
                      <Box key={`${activeTab}-${line.name}`} className="roster-line-card">
                        <Text className="roster-line-name">{line.name}</Text>
                        <Box
                          className="roster-player-grid"
                          data-slots={Math.max(line.player_ids.length, 1)}
                        >
                          {line.player_ids.map((playerId, index) => {
                            const player = playersById.get(playerId);
                            if (!player) return null;
                            return renderPlayerCard(
                              player,
                              `${activeTab}-${lineIndex}-${line.name}-${index}-${player.id}`,
                              { compact: true }
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
        </Box>
      </Box>

      {activePlayer && (
        <Box
          className="roster-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActivePlayer(null);
          }}
        >
          <Box className="roster-modal" role="dialog" aria-modal="true">
            <button
              type="button"
              className="roster-modal-close"
              onClick={() => setActivePlayer(null)}
              aria-label="Закрыть"
            >
              <FiX />
            </button>
            <Box className="roster-modal-layout">
              <Box className="roster-modal-card-preview">
                {renderPlayerCard(activePlayer, `modal-${activePlayer.id}`, { modal: true })}
              </Box>
              <Box className="roster-modal-right">
                <Box className="roster-modal-head">
                  <Box>
                    <Text className="roster-modal-name">{activePlayer.name}</Text>
                    <Text className="roster-modal-role">{roleLabel(activePlayer.role)}</Text>
                  </Box>
                </Box>
                <Box className="roster-modal-grid">
                  <Box className="roster-modal-item"><span>OVR</span><strong>{activePlayer.overall ?? "—"}</strong></Box>
                  <Box className="roster-modal-item"><span>Позиция</span><strong>{activePlayer.position || "—"}</strong></Box>
                  <Box className="roster-modal-item"><span>Номер</span><strong>{activePlayer.jersey_number ?? "—"}</strong></Box>
                  <Box className="roster-modal-item"><span>Хват</span><strong>{activePlayer.shoots || "—"}</strong></Box>
                  <Box className="roster-modal-item"><span>Клуб</span><strong>{activePlayer.club || "—"}</strong></Box>
                  <Box className="roster-modal-item"><span>ID</span><strong>{activePlayer.id}</strong></Box>
                </Box>
                <Box className="roster-modal-lines">
                  <Text className="roster-modal-lines-title">Звенья</Text>
                  {(lineMembershipByPlayerId.get(activePlayer.id) || []).length > 0 ? (
                    <Box className="roster-modal-tags">
                      {(lineMembershipByPlayerId.get(activePlayer.id) || []).map((lineName) => (
                        <span key={`${activePlayer.id}-${lineName}`} className="roster-modal-tag">
                          {lineName}
                        </span>
                      ))}
                    </Box>
                  ) : (
                    <Text className="roster-empty">Нет участия в звеньях.</Text>
                  )}
                </Box>
                <Text className="roster-modal-source">Источник: {activePlayer.source || "—"}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </>
  );
};

export default TeamRosterPanel;
