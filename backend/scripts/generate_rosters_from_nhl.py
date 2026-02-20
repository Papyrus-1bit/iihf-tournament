from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parents[1]
COUNTRIES_PATH = BASE_DIR / "countries.json"
ROSTERS_PATH = BASE_DIR / "rosters.json"

USER_AGENT = "Mozilla/5.0 (IIHF-Tournament-Rosters/1.0)"

COUNTRY3_TO_2 = {
    "RUS": "RU",
    "USA": "US",
    "CHE": "CH",
    "CAN": "CA",
    "SWE": "SE",
    "CZE": "CZ",
    "FIN": "FI",
    "DEU": "DE",
    "DNK": "DK",
    "SVK": "SK",
    "LVA": "LV",
    "AUT": "AT",
    "NOR": "NO",
    "KAZ": "KZ",
    "FRA": "FR",
    "BLR": "BY",
    "SVN": "SI",
    "HUN": "HU",
    "GBR": "GB",
    "ITA": "IT",
    "POL": "PL",
    "JPN": "JP",
    "UKR": "UA",
    "LTU": "LT",
    "KOR": "KR",
    "EST": "EE",
    "NLD": "NL",
    "ROU": "RO",
    "CHN": "CN",
    "SRB": "RS",
    "HRV": "HR",
    "ESP": "ES",
}


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as response:
        return json.load(response)


def to_role(position: str) -> str:
    pos = (position or "").upper()
    if pos in {"G"}:
        return "goalie"
    if pos in {"D", "LD", "RD"}:
        return "defenseman"
    return "forward"


def to_position(position: str) -> str:
    pos = (position or "").upper()
    if pos == "L":
        return "LW"
    if pos == "R":
        return "RW"
    if pos == "C":
        return "C"
    if pos in {"D", "LD", "RD"}:
        return "D"
    if pos == "G":
        return "G"
    return "F"


def fallback_position_for_role(role: str, index: int) -> str:
    if role == "forward":
        sequence = ["LW", "C", "RW"]
        return sequence[index % len(sequence)]
    if role == "defenseman":
        return "D"
    return "G"


def assign_ovr(players: list[dict], base_ovr: int) -> None:
    role_bonus = {
        "forward": 3,
        "defenseman": 2,
        "goalie": 2,
    }
    role_decay = {
        "forward": 0.8,
        "defenseman": 0.9,
        "goalie": 1.1,
    }

    by_role: dict[str, list[dict]] = {"forward": [], "defenseman": [], "goalie": []}
    for player in players:
        by_role[player["role"]].append(player)

    for role, role_players in by_role.items():
        role_players.sort(key=lambda item: item["name"])
        for idx, player in enumerate(role_players):
            score = round(base_ovr + role_bonus[role] - idx * role_decay[role])
            player["overall"] = max(60, min(97, score))


def main() -> None:
    countries = json.loads(COUNTRIES_PATH.read_text(encoding="utf-8"))

    standings = fetch_json("https://api-web.nhle.com/v1/standings/now")
    team_abbrevs = sorted({row["teamAbbrev"]["default"] for row in standings.get("standings", [])})

    players_by_country: dict[str, dict[str, dict]] = {code: {} for code in countries.keys()}

    for team_abbrev in team_abbrevs:
        roster = fetch_json(f"https://api-web.nhle.com/v1/roster/{team_abbrev}/current")
        for role_key in ("forwards", "defensemen", "goalies"):
            for raw in roster.get(role_key, []):
                country3 = (raw.get("birthCountry") or "").upper()
                code2 = COUNTRY3_TO_2.get(country3)
                if not code2 or code2 not in players_by_country:
                    continue

                player_id = str(raw.get("id"))
                if not player_id:
                    continue

                first_name = raw.get("firstName", {}).get("default", "").strip()
                last_name = raw.get("lastName", {}).get("default", "").strip()
                full_name = f"{first_name} {last_name}".strip()
                if not full_name:
                    continue

                role = to_role(raw.get("positionCode") or "")
                position = to_position(raw.get("positionCode") or "")
                players_by_country[code2][player_id] = {
                    "id": player_id,
                    "name": full_name,
                    "club": team_abbrev,
                    "role": role,
                    "position": position,
                    "jersey_number": raw.get("sweaterNumber"),
                    "shoots": raw.get("shootsCatches"),
                    "photo_url": raw.get("headshot"),
                    "source": "NHL API",
                }

    generated: dict[str, dict] = {}

    for code, info in countries.items():
        base_ovr = int(info.get("ovr", 75))
        country_name = str(info.get("name", code))

        candidates = list(players_by_country.get(code, {}).values())
        forwards = [p for p in candidates if p["role"] == "forward"]
        defensemen = [p for p in candidates if p["role"] == "defenseman"]
        goalies = [p for p in candidates if p["role"] == "goalie"]

        forwards.sort(key=lambda item: item["name"])
        defensemen.sort(key=lambda item: item["name"])
        goalies.sort(key=lambda item: item["name"])

        target_counts = {
            "forward": 13,
            "defenseman": 7,
            "goalie": 3,
        }

        selected: list[dict] = []
        selected.extend(forwards[: target_counts["forward"]])
        selected.extend(defensemen[: target_counts["defenseman"]])
        selected.extend(goalies[: target_counts["goalie"]])

        # fill to full 23-man roster with generated placeholders if needed
        role_order = ["forward", "defenseman", "goalie"]
        per_role_count: dict[str, int] = {
            "forward": len([p for p in selected if p["role"] == "forward"]),
            "defenseman": len([p for p in selected if p["role"] == "defenseman"]),
            "goalie": len([p for p in selected if p["role"] == "goalie"]),
        }
        for role in role_order:
            while per_role_count[role] < target_counts[role]:
                index = per_role_count[role] + 1
                selected.append(
                    {
                        "id": f"{code}-{role[:1].upper()}X{index}",
                        "name": f"{country_name} {role.capitalize()} {index}",
                        "club": "",
                        "role": role,
                        "position": fallback_position_for_role(role, index - 1),
                        "jersey_number": None,
                        "shoots": None,
                        "photo_url": None,
                        "source": "Generated placeholder",
                    }
                )
                per_role_count[role] += 1

        assign_ovr(selected, base_ovr)

        selected.sort(key=lambda item: (item["role"], -int(item["overall"] or 0), item["name"]))

        generated[code] = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "source": "NHL API + generated placeholders",
            "players": selected,
        }

    ROSTERS_PATH.write_text(
        json.dumps(generated, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {ROSTERS_PATH} ({len(generated)} teams)")


if __name__ == "__main__":
    main()
