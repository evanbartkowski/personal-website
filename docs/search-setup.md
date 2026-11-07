# Search discovery

Production origin: https://evanbartkowski.com/

Each build exports unique page titles/descriptions, canonical URLs, Open Graph and Twitter metadata, a shared Person/WebSite graph, page breadcrumbs, and the existing orbital logo in raster favicon, Apple icon, and sharing images. The logo represents the website; it is not presented as a photograph of Evan.

`scripts/site-seo.mjs` is the metadata source. `search.config.json` contains only public ownership values. Google/Bing verification codes can be added to its `googleSiteVerification` and `bingSiteVerification` fields. Do not put API credentials in that file.

The XML sitemap is generated at `/sitemap.xml` with the six public canonical pages and any published blog articles. `robots.txt` advertises it and allows public assets. API and editor routes are excluded. Static project cards and contact links are readable without JavaScript. Published articles get real `/blog/posts/<slug>.html` documents; drafts never enter the static export. Rebuild and deploy after publishing locally.

## Google Search Console

1. Add a URL-prefix property for `https://evanbartkowski.com/` in https://search.google.com/search-console.
2. Choose the HTML tag verification method. Copy just the `content` value to `googleSiteVerification` in `search.config.json`, rebuild and deploy, then click Verify.
3. Submit `sitemap.xml` in the Sitemaps report. Use URL Inspection to request an initial crawl of the homepage.

Firebase authentication does not grant Search Console access. Sitemap discovery through robots works without a dashboard, but it is not evidence of submission or indexing. Google's Indexing API is not intended for ordinary portfolio pages.

## Bing and IndexNow

1. Add the same URL-prefix site in https://www.bing.com/webmasters/ (or import a verified Search Console property).
2. If using an HTML meta tag, copy its `msvalidate.01` content into `bingSiteVerification`, rebuild/deploy, then verify and submit the sitemap.
3. After a successful deployment run `npm run search:submit`. The helper verifies the live ownership file, sitemap and canonical pages before notifying IndexNow. The public ownership key remains stable across builds.

HTTP 200 means the notification was received; HTTP 202 means receipt with ownership validation pending. Neither guarantees indexing, ranking, favicon selection, or a particular search snippet. No obsolete sitemap-ping endpoints are used.

References: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search), [IndexNow protocol](https://www.indexnow.org/documentation).
