# Derrick's Reminder System

Texts +1-650-296-2919 at 8:00 AM PST for any date you add.

## Add a reminder
```
node index.js add "9/3 - Mom's birthday"
node index.js add "12/25 - Christmas"
```

## See all reminders
```
node index.js list
```

## Send a test text
```
node index.js test
```

## Run the scheduler (do this on Railway)
```
node index.js
```

---

# Fantasy Football Agent

Dashboard at `/fantasy.html` with three tabs:
- **Agent Report**: Claude reads your ESPN roster and the top available free agents, searches the web for the latest news, and writes up team alerts, ranked pickups (with drop suggestions), deep stashes, and league-wide news. It runs automatically every day at 7:00 AM PT, or on demand with the button.
- **My Team**: record, standing, points, and your roster with injury flags.
- **Free Agents**: available players sorted by biggest 7-day ownership jump (trending adds).

## Setup (Railway env vars)
| Variable | Where to find it |
|---|---|
| `ESPN_LEAGUE_ID` | `leagueId=` in your ESPN league URL |
| `ESPN_TEAM_ID` | `teamId=` in the URL when viewing your team |
| `ESPN_S2`, `ESPN_SWID` | Private leagues only: the `espn_s2` and `SWID` cookies from espn.com (DevTools → Application → Cookies) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ESPN_SEASON` | Optional, defaults to the current season |
