# Lumeo scorecards

Daily creative scorecards for the Lumeo team, served by GitHub Pages. The all-time ads source of truth lives on its own site.

- `data.json` is rewritten every Monday by the Make scenario "Lumeo: Weekly Meta pull + ClickUp sync v2". Don't edit it by hand.
- `picks.json` holds CS / editor credit for ads ClickUp doesn't credit. Key = exact Meta ad name. The dropdowns on the page write it through the Make webhook "Lumeo: Scorecard save CS/Editor pick".
- `media.json` holds the preview link (and thumbnail, once a Meta token is set) per ad name. Rebuilt daily at 6:00 by the Make scenario "Lumeo: Scorecard ad previews".
- `daily.json` holds Meta spend, revenue, purchases, impressions, 3s views and thruplays per ad per day, from Sep 28 2026. Every morning the Make scenario "Lumeo: Scorecard daily data (Meta per ad per day)" re-pulls the last 3 days and today so far (Meta keeps adjusting recent days) and keeps the rest. Run it on demand with `since` / `until` to re-pull any dates.
- `index.html`, `style.css`, `app.js` are the page. Pick Day, Week (Mon to Sun), Month (calendar month), Range (last 7 / 14 / 30 days, this or last month, or any From / To dates, like Ads Manager) or Lifetime. Windows come from `daily.json`; anything before daily data starts falls back to the weekly rows in `data.json`. Link to a view with `?p=d:2026-11-26`, `?p=w:2026-11-23`, `?p=m:2026-11`, `?p=r:2026-11-01_2026-11-15` or `?p=life`. All windows use the same verdict rules and analyse the top 9 ads by spend (Lifetime the top 10).
