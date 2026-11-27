# Lumeo scorecards

Daily creative scorecards for the Lumeo team, served by GitHub Pages. The all-time ads source of truth lives on its own site.

- `data.json` is rewritten every Monday by the Make scenario "Lumeo: Weekly Meta pull + ClickUp sync v2". Don't edit it by hand.
- `picks.json` holds CS / editor credit for ads ClickUp doesn't credit. Key = exact Meta ad name. The dropdowns on the page write it through the Make webhook "Lumeo: Scorecard save CS/Editor pick".
- `media.json` holds the preview link (and thumbnail, once a Meta token is set) per ad name. Rebuilt daily at 6:00 by the Make scenario "Lumeo: Scorecard ad previews".
- `daily.json` holds Meta spend, revenue, purchases, impressions, 3s views and thruplays per ad per day, from Sep 28 2026. Every morning the Make scenario "Lumeo: Scorecard daily data (Meta per ad per day)" re-pulls the last 3 days and today so far (Meta keeps adjusting recent days) and keeps the rest. Run it on demand with `since` / `until` to re-pull any dates.
- `index.html`, `style.css`, `app.js` are the page. Pick Day, Week (Mon to Sun), Month (calendar month), Range (last 7 / 14 / 30 days, this or last month, or any From / To dates, like Ads Manager) or Lifetime. Windows come from `daily.json`; anything before daily data starts falls back to the weekly rows in `data.json`. Link to a view with `?p=d:2026-11-26`, `?p=w:2026-11-23`, `?p=m:2026-11`, `?p=r:2026-11-01_2026-11-15` or `?p=life`. All windows analyse the top 9 ads by spend (Lifetime the top 10).

## Verdicts (IDGAF)

Joel's IDGAF doc is the rule, and the scorecard, the Monday ClickUp sync (Make 7107864) and the ads site (lumeo-ads-lab-log `tools/ads/build.py` `verdict()`) all use the same code path. An ad takes its concept's verdict (concept = DCT number or creator). Pool = all Meta spend in the account, by Monday week.

- Breakthrough: a week at 10%+ of account spend and 1.1+ ROAS, while the account spends 10%+ more than the week before the concept launched and the concept spends more than in its launch week. A week 1 spend or KPI winner can become one in week 2 or 3.
- Spend Winner: reached 10%+ of a week's spend without that budget growth at KPI.
- KPI Winner: never over the 10% line, 1.1+ ROAS with 3+ purchases.
- Loser: under the line and under 1.1 ROAS.
- Too early: under $100 spent, or new in the last 7 days of the window with under 3% of its spend.

A week only counts if the concept spent $500+ in it. In a Day, Range or Month view the weeks that overlap the window are checked; a week still in progress is compared on spend per day. The Monday Make run writes the lifetime and last-week verdicts to the Sheet's DCT 500+ tab (columns N and O are plain values now, not formulas) and the Week verdict to ClickUp.
