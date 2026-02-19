from __future__ import annotations

from datetime import datetime
from typing import Any, Generator, Optional
import json
import os
import random
import uuid

import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (
    Column,
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    select,
    update,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COUNTRIES_FILE = os.path.join(BASE_DIR, "countries.json")
# Load backend/.env automatically (if present).
load_dotenv(os.path.join(BASE_DIR, ".env"), override=False)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://iihf:iihf@localhost:5432/iihf",
)


Base = declarative_base()


class Country(Base):
    __tablename__ = "countries"

    code = Column(String(8), primary_key=True)
    name = Column(String(120), nullable=False)
    rating_points = Column(Integer, nullable=False)
    ovr = Column(Integer, nullable=False, default=70)

    podium_gold = Column(Integer, nullable=False, default=0)
    podium_silver = Column(Integer, nullable=False, default=0)
    podium_bronze = Column(Integer, nullable=False, default=0)
    podium_finals = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(160), nullable=True)
    tournament_type = Column(String(32), nullable=False, default="groups")

    groups_count = Column(Integer, nullable=True)
    teams_per_group = Column(Integer, nullable=True)

    groups_json = Column(JSON, nullable=False)
    standings_json = Column(JSON, nullable=False)

    is_active = Column(Boolean, nullable=False, default=True)
    is_completed = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("tournament_id", "external_match_id", name="uq_tournament_match_idx"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(
        String(36), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    external_match_id = Column(Integer, nullable=False)

    group_name = Column(String(32), nullable=True)
    stage = Column(String(16), nullable=False, default="group")
    round = Column(String(16), nullable=True)
    match_date = Column(String(32), nullable=True)

    home_code = Column(String(8), ForeignKey("countries.code"), nullable=False)
    away_code = Column(String(8), ForeignKey("countries.code"), nullable=False)

    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)
    played = Column(Boolean, nullable=False, default=False)
    overtime = Column(Boolean, nullable=False, default=False)
    shootout = Column(Boolean, nullable=False, default=False)

    home_rating_after = Column(Float, nullable=True)
    away_rating_after = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class TournamentSave(Base):
    __tablename__ = "tournament_saves"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    tournament_id = Column(
        String(36), ForeignKey("tournaments.id", ondelete="SET NULL"), nullable=True
    )
    payload = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


# ===== FastAPI app =====
app = FastAPI(title="IIHF Tournament API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== Pydantic models =====
class Podiums(BaseModel):
    gold: int = 0
    silver: int = 0
    bronze: int = 0
    finals: int = 0


class CreateTournament(BaseModel):
    groups: Optional[int] = None
    teams_per_group: Optional[int] = None
    type: str = "groups"
    name: Optional[str] = None
    groups_data: Optional[dict[str, list[str]]] = None


class ManualScore(BaseModel):
    home_score: int
    away_score: int
    overtime: bool = False
    shootout: bool = False


class ReplaceTeam(BaseModel):
    group: str
    old_team: str
    new_team: str


class CountryPatch(BaseModel):
    name: Optional[str] = None
    rating_points: Optional[int] = None
    ovr: Optional[int] = None
    podiums: Optional[Podiums] = None


class SaveUpsertRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1)
    tournament_id: Optional[str] = None
    payload: dict[str, Any]


# ===== Helpers =====
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def load_countries_file() -> dict[str, Any]:
    with open(COUNTRIES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_countries_seeded(db: Session) -> None:
    data = load_countries_file()
    existing = {c.code: c for c in db.scalars(select(Country)).all()}
    changed = False

    for code, info in data.items():
        podium = info.get("podiums") or {}
        country = existing.get(code)
        if not country:
            db.add(
                Country(
                    code=code,
                    name=info["name"],
                    rating_points=int(info["rating_points"]),
                    ovr=int(info.get("ovr", 70)),
                    podium_gold=int(podium.get("gold", 0)),
                    podium_silver=int(podium.get("silver", 0)),
                    podium_bronze=int(podium.get("bronze", 0)),
                    podium_finals=int(
                        podium.get(
                            "finals",
                            int(podium.get("gold", 0)) + int(podium.get("silver", 0)),
                        )
                    ),
                )
            )
            changed = True
            continue

        # Keep dynamic rating_points, but refresh immutable reference-like fields.
        if country.name != info["name"]:
            country.name = info["name"]
            changed = True
        if country.ovr != int(info.get("ovr", country.ovr)):
            country.ovr = int(info.get("ovr", country.ovr))
            changed = True

    if changed:
        db.commit()


def serialize_country(country: Country) -> dict[str, Any]:
    return {
        "name": country.name,
        "rating_points": country.rating_points,
        "ovr": country.ovr,
        "podiums": {
            "gold": country.podium_gold,
            "silver": country.podium_silver,
            "bronze": country.podium_bronze,
            "finals": country.podium_finals,
        },
    }


def split_groups(
    teams: list[str], num_groups: int, teams_per_group: int
) -> tuple[dict[str, list[str]], list[str]]:
    shuffled = teams[:]
    random.shuffle(shuffled)
    groups: dict[str, list[str]] = {}
    idx = 0
    for g in range(num_groups):
        group_name = chr(65 + g)
        groups[group_name] = shuffled[idx : idx + teams_per_group]
        idx += teams_per_group
    unassigned = shuffled[idx:]
    return groups, unassigned


def generate_round_robin(groups: dict[str, list[str]]) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for gname, tlist in groups.items():
        for i in range(len(tlist)):
            for j in range(i + 1, len(tlist)):
                matches.append(
                    {
                        "group": gname,
                        "home": tlist[i],
                        "away": tlist[j],
                        "home_score": None,
                        "away_score": None,
                        "played": False,
                        "overtime": False,
                        "shootout": False,
                        "stage": "group",
                        "round": None,
                        "date": "",
                    }
                )
    return matches


def init_standings(
    groups: dict[str, list[str]], ratings_map: dict[str, int]
) -> dict[str, Any]:
    standings: dict[str, Any] = {}
    for gname, tlist in groups.items():
        standings[gname] = {}
        for team_code in tlist:
            standings[gname][team_code] = {
                "points": 0,
                "gf": 0,
                "ga": 0,
                "diff": 0,
                "elo": float(ratings_map.get(team_code, 1500)),
            }
    return standings


def elo_update(r1: float, r2: float, score1: float, k: int = 20) -> float:
    expected1 = 1 / (1 + 10 ** ((r2 - r1) / 400))
    return r1 + k * (score1 - expected1)


def simulate_goals(lambda_home: float, lambda_away: float) -> tuple[int, int]:
    home_goals = int(np.random.poisson(max(lambda_home, 0.2)))
    away_goals = int(np.random.poisson(max(lambda_away, 0.2)))
    return home_goals, away_goals


def update_standings(
    standings: dict[str, Any],
    group: str,
    home: str,
    away: str,
    hs: int,
    as_: int,
    ot: bool = False,
    so: bool = False,
) -> tuple[float, float]:
    st = standings[group]
    st[home]["gf"] += hs
    st[home]["ga"] += as_
    st[home]["diff"] = st[home]["gf"] - st[home]["ga"]

    st[away]["gf"] += as_
    st[away]["ga"] += hs
    st[away]["diff"] = st[away]["gf"] - st[away]["ga"]

    if hs > as_:
        if ot or so:
            st[home]["points"] += 2
            st[away]["points"] += 1
        else:
            st[home]["points"] += 3
    elif hs < as_:
        if ot or so:
            st[away]["points"] += 2
            st[home]["points"] += 1
        else:
            st[away]["points"] += 3
    else:
        st[home]["points"] += 1
        st[away]["points"] += 1

    r1 = float(st[home]["elo"])
    r2 = float(st[away]["elo"])

    score1 = 1 if hs > as_ else 0.5 if hs == as_ else 0
    score2 = 1 - score1

    st[home]["elo"] = elo_update(r1, r2, score1)
    st[away]["elo"] = elo_update(r2, r1, score2)
    return float(st[home]["elo"]), float(st[away]["elo"])


def serialize_match(match: Match) -> dict[str, Any]:
    return {
        "group": match.group_name,
        "home": match.home_code,
        "away": match.away_code,
        "home_score": match.home_score,
        "away_score": match.away_score,
        "played": match.played,
        "overtime": match.overtime,
        "shootout": match.shootout,
        "stage": match.stage,
        "round": match.round,
        "date": match.match_date or "",
    }


def get_active_tournament(db: Session) -> Optional[Tournament]:
    return db.scalar(
        select(Tournament)
        .where(Tournament.is_active.is_(True))
        .order_by(Tournament.updated_at.desc())
        .limit(1)
    )


def serialize_tournament(db: Session, tournament: Tournament) -> dict[str, Any]:
    matches = db.scalars(
        select(Match)
        .where(Match.tournament_id == tournament.id)
        .order_by(Match.external_match_id.asc())
    ).all()
    return {
        "id": tournament.id,
        "name": tournament.name,
        "groups": tournament.groups_json,
        "matches": [serialize_match(m) for m in matches],
        "standings": tournament.standings_json,
        "type": tournament.tournament_type,
        "created_at": tournament.created_at.isoformat(),
        "updated_at": tournament.updated_at.isoformat(),
        "is_active": tournament.is_active,
        "is_completed": tournament.is_completed,
    }


def ratings_map(db: Session) -> dict[str, int]:
    countries = db.scalars(select(Country)).all()
    return {c.code: c.rating_points for c in countries}


# ===== Startup =====
@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_countries_seeded(db)


# ===== Endpoints =====
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/countries")
def get_countries(db: Session = Depends(get_db)) -> dict[str, Any]:
    ensure_countries_seeded(db)
    rows = db.scalars(select(Country).order_by(Country.rating_points.desc())).all()
    return {row.code: serialize_country(row) for row in rows}


@app.patch("/countries/{code}")
def patch_country(code: str, payload: CountryPatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Country, code.upper())
    if not row:
        raise HTTPException(status_code=404, detail="Country not found")

    if payload.name is not None:
        row.name = payload.name
    if payload.rating_points is not None:
        row.rating_points = payload.rating_points
    if payload.ovr is not None:
        row.ovr = payload.ovr
    if payload.podiums is not None:
        row.podium_gold = payload.podiums.gold
        row.podium_silver = payload.podiums.silver
        row.podium_bronze = payload.podiums.bronze
        row.podium_finals = payload.podiums.finals

    db.commit()
    db.refresh(row)
    return {"code": row.code, **serialize_country(row)}


@app.post("/tournament/setup")
def setup_tournament(data: CreateTournament, db: Session = Depends(get_db)) -> dict[str, Any]:
    ensure_countries_seeded(db)

    if data.groups_data:
        groups = data.groups_data
        assigned = [team for group in groups.values() for team in group]
        all_codes = list(ratings_map(db).keys())
        unassigned = [code for code in all_codes if code not in assigned]
        return {"groups": groups, "unassigned": unassigned}

    if data.groups is None or data.teams_per_group is None:
        raise HTTPException(
            status_code=400,
            detail="groups и teams_per_group обязательны, если groups_data не задан",
        )

    all_codes = list(ratings_map(db).keys())
    groups, unassigned = split_groups(all_codes, data.groups, data.teams_per_group)
    return {"groups": groups, "unassigned": unassigned}


@app.post("/tournament/create")
def create_tournament(data: CreateTournament, db: Session = Depends(get_db)) -> dict[str, Any]:
    ensure_countries_seeded(db)

    if data.groups_data:
        groups = data.groups_data
        groups_count = len(groups)
        teams_per_group = max((len(teams) for teams in groups.values()), default=0)
    else:
        if data.groups is None or data.teams_per_group is None:
            raise HTTPException(
                status_code=400,
                detail="groups и teams_per_group обязательны, если groups_data не задан",
            )
        all_codes = list(ratings_map(db).keys())
        groups, _ = split_groups(all_codes, data.groups, data.teams_per_group)
        groups_count = data.groups
        teams_per_group = data.teams_per_group

    tournament_matches = generate_round_robin(groups)
    standings = init_standings(groups, ratings_map(db))

    db.execute(
        update(Tournament).where(Tournament.is_active.is_(True)).values(is_active=False)
    )

    tournament = Tournament(
        name=data.name,
        tournament_type=data.type,
        groups_count=groups_count,
        teams_per_group=teams_per_group,
        groups_json=groups,
        standings_json=standings,
        is_active=True,
        is_completed=False,
    )
    db.add(tournament)
    db.flush()

    for idx, match in enumerate(tournament_matches):
        db.add(
            Match(
                tournament_id=tournament.id,
                external_match_id=idx,
                group_name=match["group"],
                home_code=match["home"],
                away_code=match["away"],
                home_score=match["home_score"],
                away_score=match["away_score"],
                played=match["played"],
                overtime=match["overtime"],
                shootout=match["shootout"],
                stage=match["stage"],
                round=match["round"],
                match_date=match["date"],
            )
        )

    db.commit()
    db.refresh(tournament)
    return serialize_tournament(db, tournament)


@app.post("/tournament/replace_team")
def replace_team(data: ReplaceTeam, db: Session = Depends(get_db)) -> dict[str, Any]:
    tournament = get_active_tournament(db)
    if not tournament:
        raise HTTPException(status_code=404, detail="Active tournament not found")

    groups = dict(tournament.groups_json)
    if data.group not in groups:
        raise HTTPException(status_code=404, detail="Group not found")

    if not db.get(Country, data.new_team.upper()):
        raise HTTPException(status_code=404, detail="New team not found")

    teams = list(groups[data.group])
    if data.old_team not in teams:
        raise HTTPException(status_code=404, detail="Old team not found in group")

    idx = teams.index(data.old_team)
    teams[idx] = data.new_team.upper()
    groups[data.group] = teams

    standings = dict(tournament.standings_json)
    group_table = dict(standings.get(data.group, {}))
    if data.old_team not in group_table:
        raise HTTPException(status_code=404, detail="Old team not found in standings")
    group_table[data.new_team.upper()] = group_table.pop(data.old_team)
    standings[data.group] = group_table

    matches = db.scalars(
        select(Match).where(
            Match.tournament_id == tournament.id,
            Match.group_name == data.group,
        )
    ).all()
    for match in matches:
        if match.home_code == data.old_team:
            match.home_code = data.new_team.upper()
        if match.away_code == data.old_team:
            match.away_code = data.new_team.upper()

    tournament.groups_json = groups
    tournament.standings_json = standings
    db.commit()
    db.refresh(tournament)
    return serialize_tournament(db, tournament)


@app.get("/tournament")
def get_tournament(db: Session = Depends(get_db)) -> dict[str, Any]:
    tournament = get_active_tournament(db)
    if not tournament:
        return {}
    return serialize_tournament(db, tournament)


@app.get("/tournaments")
def list_tournaments(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(select(Tournament).order_by(Tournament.created_at.desc())).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.tournament_type,
            "is_active": row.is_active,
            "is_completed": row.is_completed,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }
        for row in rows
    ]


@app.get("/tournaments/{tournament_id}")
def get_tournament_by_id(tournament_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Tournament, tournament_id)
    if not row:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return serialize_tournament(db, row)


@app.post("/match/simulate/{match_id}")
def simulate_match(match_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    tournament = get_active_tournament(db)
    if not tournament:
        raise HTTPException(status_code=404, detail="Active tournament not found")

    match = db.scalar(
        select(Match).where(
            Match.tournament_id == tournament.id,
            Match.external_match_id == match_id,
        )
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.played:
        return {"error": "Already played"}

    standings = dict(tournament.standings_json)
    group = match.group_name
    if not group or group not in standings:
        raise HTTPException(status_code=400, detail="Match group not found in standings")

    home = match.home_code
    away = match.away_code
    r1 = float(standings[group][home]["elo"])
    r2 = float(standings[group][away]["elo"])

    base = 2.8
    ratio = max(r1 / max(r2, 1.0), 0.1)
    lambda_home = base * ratio
    lambda_away = base * (1 / max(ratio, 0.1))

    hs, as_ = simulate_goals(lambda_home, lambda_away)

    match.home_score = hs
    match.away_score = as_
    match.played = True
    match.overtime = False
    match.shootout = False

    home_elo, away_elo = update_standings(standings, group, home, away, hs, as_)
    match.home_rating_after = home_elo
    match.away_rating_after = away_elo

    tournament.standings_json = standings
    db.commit()
    db.refresh(match)
    return serialize_match(match)


@app.post("/match/manual/{match_id}")
def manual_score(match_id: int, score: ManualScore, db: Session = Depends(get_db)) -> dict[str, Any]:
    tournament = get_active_tournament(db)
    if not tournament:
        raise HTTPException(status_code=404, detail="Active tournament not found")

    match = db.scalar(
        select(Match).where(
            Match.tournament_id == tournament.id,
            Match.external_match_id == match_id,
        )
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.played:
        return {"error": "Already played"}

    standings = dict(tournament.standings_json)
    group = match.group_name
    if not group or group not in standings:
        raise HTTPException(status_code=400, detail="Match group not found in standings")

    match.home_score = score.home_score
    match.away_score = score.away_score
    match.played = True
    match.overtime = score.overtime
    match.shootout = score.shootout

    home_elo, away_elo = update_standings(
        standings,
        group,
        match.home_code,
        match.away_code,
        score.home_score,
        score.away_score,
        score.overtime,
        score.shootout,
    )
    match.home_rating_after = home_elo
    match.away_rating_after = away_elo

    tournament.standings_json = standings
    db.commit()
    db.refresh(match)
    return serialize_match(match)


@app.get("/iihf")
def get_iihf_ranking(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    countries = db.scalars(select(Country)).all()
    active = get_active_tournament(db)

    elo_by_code: dict[str, float] = {c.code: float(c.rating_points) for c in countries}
    if active:
        standings = active.standings_json or {}
        for table in standings.values():
            for code, stats in table.items():
                elo_by_code[code] = float(stats.get("elo", elo_by_code.get(code, 0.0)))

    ranking = [
        {"code": c.code, "name": c.name, "elo": elo_by_code.get(c.code, float(c.rating_points))}
        for c in countries
    ]
    ranking.sort(key=lambda item: item["elo"], reverse=True)
    return ranking


@app.post("/saves")
def upsert_save(payload: SaveUpsertRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    if payload.tournament_id:
        tournament = db.get(Tournament, payload.tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")

    save_id = payload.id or str(uuid.uuid4())
    existing = db.get(TournamentSave, save_id)

    if existing:
        existing.name = payload.name
        existing.tournament_id = payload.tournament_id
        existing.payload = payload.payload
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = TournamentSave(
            id=save_id,
            name=payload.name,
            tournament_id=payload.tournament_id,
            payload=payload.payload,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    return {
        "id": row.id,
        "name": row.name,
        "tournament_id": row.tournament_id,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


@app.get("/saves")
def list_saves(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.scalars(select(TournamentSave).order_by(TournamentSave.updated_at.desc())).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "tournament_id": row.tournament_id,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }
        for row in rows
    ]


@app.get("/saves/{save_id}")
def get_save(save_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(TournamentSave, save_id)
    if not row:
        raise HTTPException(status_code=404, detail="Save not found")
    return {
        "id": row.id,
        "name": row.name,
        "tournament_id": row.tournament_id,
        "payload": row.payload,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


@app.delete("/saves/{save_id}")
def delete_save(save_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.get(TournamentSave, save_id)
    if not row:
        raise HTTPException(status_code=404, detail="Save not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.post("/tournaments/{tournament_id}/commit-ratings")
def commit_tournament_ratings(tournament_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    tournament = db.get(Tournament, tournament_id)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    countries = {c.code: c for c in db.scalars(select(Country)).all()}
    current = {code: float(country.rating_points) for code, country in countries.items()}

    matches = db.scalars(
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.external_match_id.asc())
    ).all()

    for match in matches:
        if not match.played or match.home_score is None or match.away_score is None:
            continue
        home_code = match.home_code
        away_code = match.away_code
        if home_code not in current or away_code not in current:
            continue

        r1 = current[home_code]
        r2 = current[away_code]
        score1 = 1 if match.home_score > match.away_score else 0.5 if match.home_score == match.away_score else 0
        score2 = 1 - score1
        current[home_code] = elo_update(r1, r2, score1)
        current[away_code] = elo_update(r2, r1, score2)

    deltas: dict[str, int] = {}
    for code, country in countries.items():
        previous = country.rating_points
        next_rating = int(round(current.get(code, float(previous))))
        country.rating_points = next_rating
        delta = next_rating - previous
        if delta != 0:
            deltas[code] = delta

    tournament.is_completed = True
    db.commit()

    return {
        "ok": True,
        "tournament_id": tournament_id,
        "updated": len(deltas),
        "deltas": deltas,
    }
