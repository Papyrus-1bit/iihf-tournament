from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import numpy as np
import random

app = FastAPI()

# ===== CORS =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE_FILE = "state.json"

# ===== Страны =====
with open("countries.json", "r", encoding="utf-8") as f:
    countries = json.load(f)

if os.path.exists(STATE_FILE):
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)
else:
    state = {"tournament": None}

# ===== Модели =====
class CreateTournament(BaseModel):
    groups: int
    teams_per_group: int
    type: str  # "groups" или "groups_playoffs"
    groups_data: dict = None  # для финального создания с редактированными групп

class ManualScore(BaseModel):
    home_score: int
    away_score: int
    overtime: bool = False
    shootout: bool = False

class ReplaceTeam(BaseModel):
    group: str
    old_team: str
    new_team: str

# ===== Helpers =====
def save_state():
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

def split_groups(teams, num_groups, teams_per_group):
    random.shuffle(teams)
    groups = {}
    idx = 0
    for g in range(num_groups):
        group_name = chr(65+g)
        groups[group_name] = teams[idx:idx+teams_per_group]
        idx += teams_per_group
    unassigned = teams[idx:]
    return groups, unassigned

def generate_round_robin(groups):
    matches = []
    for gname, tlist in groups.items():
        for i in range(len(tlist)):
            for j in range(i+1, len(tlist)):
                matches.append({
                    "group": gname,
                    "home": tlist[i],
                    "away": tlist[j],
                    "home_score": None,
                    "away_score": None,
                    "played": False,
                    "overtime": False,
                    "shootout": False
                })
    return matches

def init_standings(groups):
    standings = {}
    for gname, tlist in groups.items():
        standings[gname] = {}
        for t in tlist:
            standings[gname][t] = {
                "points":0,
                "gf":0,
                "ga":0,
                "diff":0,
                "elo": countries[t]["rating_points"]
            }
    return standings

def elo_update(r1, r2, score1, k=20):
    expected1 = 1 / (1 + 10 ** ((r2 - r1) / 400))
    return r1 + k * (score1 - expected1)

def simulate_goals(lambda_home, lambda_away):
    home_goals = np.random.poisson(lambda_home)
    away_goals = np.random.poisson(lambda_away)
    return home_goals, away_goals

def update_standings(group, home, away, hs, as_, ot=False, so=False):
    st = state["tournament"]["standings"][group]
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

    r1 = st[home]["elo"]
    r2 = st[away]["elo"]
    st[home]["elo"] = elo_update(r1, r2, 1 if hs>as_ else 0.5 if hs==as_ else 0)
    st[away]["elo"] = elo_update(r2, r1, 1 if as_>hs else 0.5 if hs==as_ else 0)

from typing import Optional

class CreateTournament(BaseModel):
    groups: Optional[int] = None
    teams_per_group: Optional[int] = None
    type: str
    groups_data: Optional[dict] = None

# ===== Endpoints =====
@app.get("/countries")
def get_countries():
    return countries

@app.post("/tournament/setup")
def setup_tournament(data: CreateTournament):
    # Если есть группы_data, используем её
    if data.groups_data:
        groups = data.groups_data
        # на случай несоответствия команд, берём остальные в unassigned
        assigned = sum(groups.values(), [])
        unassigned = [t for t in countries.keys() if t not in assigned]
    else:
        groups, unassigned = split_groups(list(countries.keys()), data.groups, data.teams_per_group)
    return {"groups": groups, "unassigned": unassigned}

@app.post("/tournament/create")
def create_tournament(data: CreateTournament):
    if data.groups_data:
        groups = data.groups_data
    else:
        groups, unassigned = split_groups(list(countries.keys()), data.groups, data.teams_per_group)
    matches = generate_round_robin(groups)
    standings = init_standings(groups)
    state["tournament"] = {"groups": groups, "matches": matches, "standings": standings, "type": data.type}
    save_state()
    return state["tournament"]

@app.post("/tournament/replace_team")
def replace_team(data: ReplaceTeam):
    group = state["tournament"]["groups"][data.group]
    if data.old_team in group:
        idx = group.index(data.old_team)
        group[idx] = data.new_team
        state["tournament"]["standings"][data.group][data.new_team] = state["tournament"]["standings"][data.group].pop(data.old_team)
        save_state()
    return state["tournament"]

@app.get("/tournament")
def get_tournament():
    return state.get("tournament", {})

@app.post("/match/simulate/{match_id}")
def simulate_match(match_id: int):
    match = state["tournament"]["matches"][match_id]
    if match["played"]:
        return {"error": "Already played"}
    home = match["home"]
    away = match["away"]
    group = match["group"]
    r1 = state["tournament"]["standings"][group][home]["elo"]
    r2 = state["tournament"]["standings"][group][away]["elo"]
    base = 2.8
    lambda_home = base * (r1 / r2)
    lambda_away = base * (r2 / r1)
    hs, as_ = simulate_goals(lambda_home, lambda_away)
    match["home_score"] = hs
    match["away_score"] = as_
    match["played"] = True
    match["overtime"] = False
    match["shootout"] = False
    update_standings(group, home, away, hs, as_)
    save_state()
    return match

@app.post("/match/manual/{match_id}")
def manual_score(match_id: int, score: ManualScore):
    match = state["tournament"]["matches"][match_id]
    if match["played"]:
        return {"error": "Already played"}
    match["home_score"] = score.home_score
    match["away_score"] = score.away_score
    match["played"] = True
    match["overtime"] = score.overtime
    match["shootout"] = score.shootout
    update_standings(match["group"], match["home"], match["away"],
                     score.home_score, score.away_score, score.overtime, score.shootout)
    save_state()
    return match

@app.get("/iihf")
def get_iihf_ranking():
    ranking = []
    for code, c in countries.items():
        elo = 0
        for g in state["tournament"]["standings"].values():
            if code in g:
                elo = g[code]["elo"]
        ranking.append({"code": code, "name": c["name"], "elo": elo})
    ranking.sort(key=lambda x: x["elo"], reverse=True)
    return ranking
