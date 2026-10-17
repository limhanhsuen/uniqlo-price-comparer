# Across — UNIQLO Japan × Malaysia

A static HTML storefront and a Python scraper for the public Japanese and Malaysian UNIQLO catalogs. No Python packages, API keys or login are required.

## Run

```sh
python3 scripts/scrape.py
python3 scripts/serve.py --host 127.0.0.1 --port 8765
```

Open http://127.0.0.1:8765/. The included server also supplies the restricted UNIQLO thumbnails needed for image-rich wishlist PDF exports. The initial complete scrape can take 15–30 minutes depending on network speed. Successful API responses are cached for 24 hours in `.cache/`; rerunning resumes using those responses.

```sh
python3 scripts/scrape.py --fresh         # Refresh every response
python3 scripts/scrape.py --catalog-only # Faster listing-only pass; no detailed variant records
python3 scripts/scrape.py --segment kids # Fetch only kids details and merge cached adult records
python3 scripts/scrape.py --rebuild-only # Re-index cached details without network requests
python3 -m unittest discover -s tests -v
```

## Data and matching

- Reads paginated public `/api/commerce/v5/{language}/products` catalogs for Japan and Malaysia. The default run retains men's, women's and adult unisex items; `--segment kids` retains kids and kids-sized unisex items while excluding baby products.
- Kids mode requires the existing adult normalized caches (`.cache/jp-normalized.json` and `.cache/my-normalized.json`). It fetches details only for kids products, stores separate kids caches and merges both segments into the output without repeating adult detail requests.
- Retrieves each product's detail endpoint for colour/size/length combinations, local SKU IDs, per-variant prices, product images, descriptions, composition, care instructions and size-chart links.
- Preserves source prices and currencies, including promotional prices. Catalog images remain original remote URLs; PDF thumbnail requests are cached locally on demand.
- Pairs exact six-digit article codes (`l1Id`). A country's `l2Id` is a local colour/size SKU and is **not** assumed to be globally identical. Similar names alone never create a match.
- Some product pages group multiple article codes. The build splits these pages by the six-digit prefix in each variant's `communicationCode`, so current and older articles retain their own colours, sizes, prices and country matches. The listing code and all page aliases remain searchable, as do complete UNIQLO product URLs.
- Products found in just one country remain in the catalog. Choose “All products”, “Japan only” or “Malaysia only” to see them.
- Actual variant combinations are retained; the scraper never invents all possible colour × size combinations. `sales` indicates that the variant is offered, not guaranteed warehouse stock.
- Enter your own MYR-per-100-JPY exchange rate for converted prices and savings. No live rate is assumed. Fees, shipping and tax-free tourist eligibility are not calculated.
- `data/catalog.json` is the full machine-readable export; `dist/catalog.json.gz` is its compressed downloadable copy. `dist/catalog.js` is a lightweight index; `dist/details/{article}.js` loads full product details on demand, including when opened directly from disk. Coverage and errors are included. A complete snapshot requires successful details for every retained listing in both markets. Intermediate progress never replaces the previous snapshot.

## Scope and limits

“Full catalog” means the products exposed by the public catalog at scrape time, not every discontinued item, hidden listing or physical-store-only item. Catalogs may change during pagination. Snapshots are not checkout quotes; confirm stock, regional sizing and final prices on UNIQLO.

The scraper throttles request starts, retries transient failures and rate limits, and stops the affected request on access denial. It does not bypass authentication or challenges. The endpoints are not a guaranteed third-party API and can change. Keep the delay conservative; inspect reported failures before treating a snapshot as complete.

The frontend includes department and category filters, text/product-code search, country availability, price/savings sorting, saved items, colour previews, galleries and per-country variant selectors. Saved items and the exchange rate stay in browser-local storage. Category chips are a convenience grouping based on source categories and English product names; unmatched Japanese items may appear under Other.

Independent project; not affiliated with UNIQLO. UNIQLO owns its product imagery, descriptions and trademarks.
