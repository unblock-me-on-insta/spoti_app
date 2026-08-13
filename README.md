# SPOTi

Responsive, dependency-free prototype for a Slovenian event discovery app. It connects a home feed, location-aware Explore, a separate event map, filters and search, verified event links and photography, saving, sharing, calendar, onboarding, avatar customization, and a preference-based SPOTi AI agent.

## SPOTi AI

The floating SPOTi AI assistant asks about interests, timing, budget and travel radius. It can also understand compact prompts such as `danes, koncert, brezplačno, 3 km`. Its ranking then becomes the ordering used by Explore.

Recommendations and location-based scoring run locally in the browser; location data is not sent to an external service.

## Run locally

Open `index.html` directly in a modern browser, or serve this folder with any static HTTP server. For example:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

The app can also be opened directly through `index.html`; the generated `events-data.js` works without a server.

## Automatic event updates

Run the scraper manually from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\update-events.ps1
```

It reads public event cards from Visit Ljubljana, including their official photography, normalizes dates, venues and coordinates, removes expired entries, and only replaces `events-data.js` when at least five valid current events were found. Every card links back to its official source.

The included GitHub Actions workflow runs this update every day at 04:17 UTC and commits changed event data. Enable Actions and repository write permissions after pushing the project to GitHub.

For a local Windows installation, register the included daily task once:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-event-schedule.ps1
```

Browser geolocation normally requires `localhost` or HTTPS. If permission is declined, Explore transparently falls back to Ljubljana city centre.
