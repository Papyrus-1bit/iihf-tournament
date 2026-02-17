# IIHF Tournament Simulator

A local, single-page simulator for an IIHF-style tournament. The app supports group setup, drag-and-drop team assignment, a day-by-day calendar, playoffs, standings, and rating updates. It also stores saves locally and supports JSON export/import.

## Features
- Group setup with sliders and manual drag-and-drop placement
- Auto-distribution by strength with a per-group team limit
- Calendar-based schedule with day locking and quick simulation
- Manual score input, OT/SO handling, and result markers
- Playoffs (R16, QF, SF, Final, 3rd place) with seeding rules
- Standings tab with overall or per-group view
- Rating table with OVR and delta indicators
- Player team selection highlighting
- Local saves plus JSON export/import (drag-and-drop supported)

## Tech Stack
- React 18 + Vite + TypeScript
- Chakra UI (current UI library)
- FastAPI backend for country data

## Project Structure
- `src/` - frontend source
- `src/components/` - UI components
- `src/scheduling.ts` - match date scheduling rules
- `src/simulation.ts` - match simulation logic
- `src/standings.ts` - standings and points logic
- `backend/` - FastAPI app and country data
- `public/svg/` - flag assets (SVG)

## Data Files
- `backend/countries.json` stores team name, rating_points, and ovr for the top 24 + RU/BY.
- Flags are loaded from `public/svg/{code}.svg` using ISO country codes.

## Setup

### Backend
```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn numpy
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```
cd iihf-tournament
npm install
npm run dev
```

Optional env:
- `VITE_API_BASE` (default: `http://localhost:8000`)

## Usage
1. Open the `Tournament` tab and set group parameters.
2. Drag teams into groups, or use auto-distribution.
3. Click team cards to mark player teams.
4. Choose playoff seeding and bracket rules.
5. Create the tournament to generate schedule.
6. Use the calendar to play/simulate matches day-by-day.
7. Check standings and playoff tabs for progress.
8. Ratings update after tournament completion. Use reset to restore defaults.

## Saves
- Save stores the current tournament snapshot in localStorage.
- Export writes a JSON file. Import accepts JSON files (button or drag-and-drop).
- Storage keys:
  - `iihfTournamentSaves`
  - `iihfRatings`

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
