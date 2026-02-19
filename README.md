# IIHF Tournament Simulator

A local, single-page simulator for an IIHF-style tournament. The app supports group setup, drag-and-drop team assignment, a day-by-day calendar, playoffs, standings, and rating updates. It also stores saves locally and supports JSON export/import.

## Features
- Group setup with discrete options (2/4/6/8/12/16) and manual drag-and-drop placement
- Auto-distribution by strength with a per-group team limit
- Calendar-based schedule with day locking and quick simulation
- Manual score input, OT/SO handling, and result markers
- Playoffs (R16, QF, SF, Final, 3rd place) with seeding rules
- Standings with overall or per-group view
- Rating table with OVR and rating delta indicators
- Auto-save of the current tournament state (restored on reload)
- Final tournament screen with podium and rating change summary
- Player team selection highlighting
- Local saves plus JSON export/import (drag-and-drop supported)

## Tech Stack
- React 18 + Vite + TypeScript
- Chakra UI (current UI library)
- FastAPI backend + PostgreSQL

## Project Structure
- `src/` - frontend source
- `src/components/` - UI components
- `src/scheduling.ts` - match date scheduling rules
- `src/simulation.ts` - match simulation logic
- `src/standings.ts` - standings and points logic
- `backend/` - FastAPI app and country data
- `backend/requirements.txt` - backend dependencies
- `docker-compose.yml` - local PostgreSQL service
- `public/svg/` - flag assets (SVG)
- `public/federations/` - federation crests/logos (PNG)

## Data Files
- `backend/countries.json` stores team name, rating_points, ovr, and historical podiums for the top 32 national teams.
- Flags are loaded from `public/svg/{code}.svg` using ISO country codes.
- Historical medal fields (`podiums`) are based on open sources:
  - IIHF Medallists: `https://www.iihf.com/en/statichub/4719/medallists`
  - IIHF World Championship records (history context): `https://www.iihf.com/en/events/2025/wm/standings/final`

## Setup

### Backend
```
docker compose up -d postgres

cd backend
python -m venv .venv
source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Backend env:
- `DATABASE_URL` (default: `postgresql+psycopg://iihf:iihf@localhost:5432/iihf`)

### Frontend
```
cd iihf-tournament
npm install
npm run dev
```

Optional env:
- `VITE_API_BASE` (default: `http://localhost:8000`)

## Backend Data Model (PostgreSQL)
Stored entities:
- `countries` - country master data, rating, OVR, medals
- `tournaments` - tournament metadata + groups/standings snapshot
- `matches` - all matches for each tournament
- `tournament_saves` - arbitrary saved tournament payloads

Useful API endpoints:
- `GET /countries`
- `POST /tournament/create`
- `GET /tournaments`
- `GET /tournaments/{id}`
- `POST /saves`
- `GET /saves`
- `POST /tournaments/{id}/commit-ratings`

## Usage
1. Click `Создать турнир`.
2. Choose group stage parameters and playoff rules in modal.
3. Drag teams into groups, or use auto-distribution.
4. Click team cards to mark player teams.
5. Create the tournament to generate schedule.
6. Use the calendar to play/simulate matches day-by-day (auto-advance to next day on sim).
7. Check standings and playoff bracket for progress.
8. Ratings update after tournament completion. Use reset or rebuild from saves.

## Saves
- Save stores the current tournament snapshot in localStorage.
- Auto-save stores the latest tournament state on each update.
- Export writes a JSON file. Import accepts JSON files (button or drag-and-drop).
- Storage keys:
  - `iihfTournamentSaves`
  - `iihfRatings`
  - `iihfRatingDelta`
  - `iihfCurrentTournament`

Example export payload:
```
{
  "version": 1,
  "savedAt": "2026-02-17T12:00:00.000Z",
  "data": {
    "tournamentName": "IIHF 2026",
    "groups": [],
    "unassigned": [],
    "playoffMatches": [],
    "playoffSeeding": "overall",
    "playoffBracketRule": "seeded",
    "teamsPerGroupLimit": 4,
    "playerTeamIds": [],
    "isTournamentCreated": false,
    "tournamentBaseRanks": {},
    "tournamentBaseRatings": {},
    "ratingsCommitted": false
  }
}
```

## Versioning and Workflow
- Use SemVer: `MAJOR.MINOR.PATCH`.
- Keep a `CHANGELOG.md` with an `Unreleased` section.
- Work on feature branches and open merge requests.

Suggested branch names:
- `feature/<topic>`
- `fix/<topic>`
- `docs/<topic>`
- `chore/<topic>`

Suggested commit style:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`

Example workflow:
```
git checkout -b feature/playoff-bracket
# work...
git add .
git commit -m "feat: add playoff bracket view"
git push -u origin feature/playoff-bracket
# open MR via GitHub/GitLab UI or CLI
```

## Design Direction (Planned)
- Swiss/International Typographic Style: strong grid, asymmetric layout, sans-serif typography, clear hierarchy, minimal ornamentation.
- A custom UI kit will live in `src/ui/` (separate branch).
