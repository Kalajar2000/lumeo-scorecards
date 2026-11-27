# Lumeo scorecards

Weekly creative scorecards for the Lumeo team, served by GitHub Pages.

- `data.json` is rewritten every Monday by the Make scenario "Lumeo: Weekly Meta pull + ClickUp sync v2". Don't edit it by hand.
- `picks.json` holds CS / editor credit for ads ClickUp doesn't credit. Key = exact Meta ad name. The dropdowns on the page write it through the Make webhook "Lumeo: Scorecard save CS/Editor pick".
- `media.json` holds the preview link (and thumbnail, once a Meta token is set) per ad name. Rebuilt daily at 6:00 by the Make scenario "Lumeo: Scorecard ad previews".
- `index.html`, `style.css`, `app.js` are the page. Week / Month / Lifetime use the same verdict rules. Week and Month analyse the top 9 ads by spend, Lifetime the top 10.
