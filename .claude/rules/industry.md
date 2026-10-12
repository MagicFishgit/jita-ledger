---
paths:
  - "src/lib/{industry,industryRank,industrySites,industryLadder,industryTrack,industryOwned,industryReads,homeMarket,altFees,nameReader,copyMarket,copyFinder,copyContracts}.ts"
  - "src/components/hustles/{Industry.tsx,IndustryStart.tsx,IndustrySites.tsx,IndustryBuild.tsx,IndustryDetail.tsx,IndustryOwned.tsx,IndustryCopies.tsx,industryChars.ts,industryBundle.ts,industryMarket.ts,industryFinder.ts}"
  - "src/components/FindStructure.tsx"
  - "src/data/{industry,industryEiv,industryTypes}.json"
  - "scripts/industry-bundle.mjs"
  - "worker/src/{industryNpc,goonmetrics,industryJobs,copies,structures}.ts"
  - "worker/migrations/{0018_industry_npc,0019_home_prices,0020_copies}.sql"
---

# Industry

These files are covered by `docs/notes/industry.md`, imported below: the Industry side hustle, its bundle from CCP's
static data, the rules for jobs, research, copying and invention, build sites, the finder, home prices from Goonmetrics
and the ladder. If the note's text doesn't follow this paragraph, Read that file before changing anything here.

@../../docs/notes/industry.md
