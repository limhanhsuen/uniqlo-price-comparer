#!/usr/bin/env python3
"""Download public UNIQLO JP/MY catalogs, preserve variants, build static data.
Standard library only. No login, browser cookies or private APIs required.
"""
import argparse, concurrent.futures, gzip, hashlib, json, re, threading, time
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
MARKETS = {'jp': ('ja', 'JPY'), 'my': ('en', 'MYR')}

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)

class Client:
    def __init__(self, cache, delay=.35, fresh=False):
        self.cache, self.delay, self.fresh = cache, delay, fresh
        self.lock, self.next = threading.Lock(), 0
    def get(self, market, endpoint):
        lang = MARKETS[market][0]
        url = f'https://www.uniqlo.com/{market}/api/commerce/v5/{lang}/{endpoint}'
        path = self.cache / market / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if not self.fresh and path.exists() and time.time()-path.stat().st_mtime < 86400:
            return json.loads(path.read_text())
        for attempt in range(4):
            with self.lock:
                time.sleep(max(0, self.next-time.monotonic()))
                self.next = time.monotonic()+self.delay
            try:
                req = Request(url, headers={'User-Agent':'Mozilla/5.0', 'Accept':'application/json', 'x-fr-clientid':f'uq.{market}.web-spa'})
                with urlopen(req, timeout=25) as response:
                    payload = json.load(response)
                if payload.get('status') != 'ok':
                    raise ValueError(f'API error: {payload.get("error")}')
                result = payload['result']
                atomic_json(path, result)
                return result
            except HTTPError as exc:
                if exc.code in (401,403):
                    raise RuntimeError(f'Access denied ({exc.code}) for {url}; stopping, no bypass attempted') from exc
                if exc.code not in (429,500,502,503,504): raise
                time.sleep(min(60, float(exc.headers.get('Retry-After', 2**attempt*2))))
            except (OSError,ValueError):
                if attempt == 3: raise
                time.sleep(2**attempt)
        raise RuntimeError(f'Retries exhausted: {url}')

def adult(p):
    gender = p.get('genderCategory','').upper()
    return gender in ('MEN','WOMEN','UNISEX') and p.get('sizeGender','').upper() not in ('KIDS','BABY')

def kids(p):
    gender = p.get('genderCategory','').upper()
    size_gender = p.get('sizeGender','').upper()
    return 'BABY' not in (gender, size_gender) and (gender == 'KIDS' or size_gender == 'KIDS')

SEGMENTS = {'adults': adult, 'kids': kids}

def catalog(client, market, segment='adults'):
    offset, seen, total, pages = 0, {}, None, 0
    while total is None or offset < total:
        r = client.get(market, f'products?offset={offset}&limit=100')
        total = int(r['pagination']['total'])
        items = r['items']
        if not items: raise RuntimeError(f'{market}: empty page at {offset}/{total}')
        new = {p['productId']:p for p in items}
        if all(k in seen for k in new): raise RuntimeError(f'{market}: repeated page at {offset}')
        seen.update(new)
        offset += len(items); pages += 1
        print(f'{market.upper()} catalog {offset}/{total}', flush=True)
    selected = [p for p in seen.values() if SEGMENTS[segment](p)]
    return selected, {'reportedTotal':total,'fetchedRows':offset,'uniqueProducts':len(seen),'pages':pages,'paginationComplete':offset >= total}

def normalize(p, market, detailed):
    # l1Id is the shared six-digit article code; l2Id is a country-specific SKU.
    sku = str(p.get('l1Id') or re.search(r'E(\d+)', p['productId']).group(1))
    top = [x.lower() for x in p.get('topCategories',[]) if x.lower() in ('men','women','kids')]
    if not top:
        if p.get('sizeGender','').upper() == 'KIDS': top = ['kids']
        else: top = ['men','women'] if p.get('genderCategory') == 'UNISEX' else [p.get('genderCategory','').lower()]
    all_variants = p.get('l2s', [])
    variants = [v for v in all_variants if str(v.get('communicationCode', '')).split('-')[0] == sku]
    # Country-local SKU IDs do not establish global article identity.
    related = [v for v in all_variants if v not in variants]
    return {'sku':sku,'articleCodes':p.get('l1Ids',[sku]),'relatedVariants':related,'productId':p['productId'],'name':p['name'],'departments':top,
        'gender':p.get('genderCategory'),'url':f'https://www.uniqlo.com/{market}/{MARKETS[market][0]}/products/{p["productId"]}/00',
        'prices':p.get('prices',{}),'colors':p.get('colors',[]),'sizes':p.get('sizes',[]),'lengths':p.get('plds',[]),
        'images':p.get('images',{}),'variants':variants,'detailsComplete':detailed,
        'category':p.get('breadcrumbs',{}).get('class',{}).get('locale',''),
        'description':p.get('longDescription',''),'composition':p.get('composition',''),
        'care':p.get('washingInformation',''),'sizeChartUrl':p.get('sizeChartUrl',''),'rating':p.get('rating',{})}

def expand_articles(product):
    """Split a grouped product page into article-code records using variant communication codes."""
    all_variants = product.get('variants',[])+product.get('relatedVariants',[])
    grouped = {}
    for variant in all_variants:
        code = str(variant.get('communicationCode','')).split('-')[0]
        if re.fullmatch(r'\d{6}',code): grouped.setdefault(code,[]).append(variant)
    if not grouped: return [product]
    expanded=[]
    for code,variants in grouped.items():
        colors=[]; sizes=[]; lengths=[]
        for variant in variants:
            for key,target in (('color',colors),('size',sizes),('pld',lengths)):
                value=variant.get(key)
                if value and value.get('code') not in {x.get('code') for x in target}: target.append(value)
        color_codes={x.get('displayCode') for x in colors}
        images=product.get('images',{})
        filtered_images={**images,
            'main':{k:v for k,v in images.get('main',{}).items() if k in color_codes},
            'chip':{k:v for k,v in images.get('chip',{}).items() if k in color_codes}}
        prices=next((v.get('prices') for v in variants if v.get('prices')),product.get('prices',{}))
        aliases=sorted(set([product.get('sku',''),*map(str,product.get('articleCodes',[]))]))
        expanded.append({**product,'sku':code,'sourceSku':product.get('sku'),'articleCodes':aliases,
            'colors':colors or product.get('colors',[]),'sizes':sizes or product.get('sizes',[]),
            'lengths':lengths or product.get('lengths',[]),'images':filtered_images,'prices':prices,
            'variants':variants,'relatedVariants':[v for v in all_variants if v not in variants]})
    return expanded

def build(markets, coverage, errors, out):
    joined = {}
    for market, products in markets.items():
        for p in products:
            for article in expand_articles(p):
                row = joined.setdefault(article['sku'], {'sku':article['sku'],'markets':{},'departments':[]})
                # Preserve multiple local styles sharing an article; rank the richest active record first.
                row['markets'].setdefault(market,[]).append(article)
                row['departments'] = sorted(set(row['departments']+article['departments']))
    for row in joined.values():
        for products in row['markets'].values():
            products.sort(key=lambda p:(bool(p.get('detailsComplete')),sum(v.get('sales') is True for v in p.get('variants',[])),
                len(p.get('colors',[])),p.get('productId','').endswith('-000')),reverse=True)
    result = {'generatedAt':datetime.now(timezone.utc).isoformat(),'coverage':coverage,'errors':errors,
        'complete':all(c.get('paginationComplete') and c.get('detailFailures',0)==0 and c.get('detailsRequested') and c.get('detailsFetched',0)==c.get('products',c.get('adultProducts')) for c in coverage.values()) and len(markets)==2,
        'matchRule':'Exact six-digit article code (l1Id); local l2 SKU IDs are preserved separately.',
        'products':list(joined.values())}
    atomic_json(out.parent/'data'/'catalog.json', result)
    out.mkdir(parents=True, exist_ok=True)
    compressed = out/'catalog.json.gz.tmp'
    with gzip.open(compressed,'wt',encoding='utf-8') as stream:
        json.dump(result,stream,ensure_ascii=False,separators=(',',':'))
    compressed.replace(out/'catalog.json.gz')
    (out/'catalog.json').unlink(missing_ok=True)
    # Lazy per-article scripts also work when index.html is opened via file://.
    details_dir = out/'details'
    details_dir.mkdir(parents=True, exist_ok=True)
    lightweight = []
    heavy = {'variants','relatedVariants','description','composition','care'}
    for row in result['products']:
        detail_path = f'details/{row["sku"]}.js'
        payload = json.dumps(row,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
        target = out/detail_path
        tmp = target.with_suffix('.tmp')
        tmp.write_text('window.CATALOG_DETAILS=window.CATALOG_DETAILS||{};window.CATALOG_DETAILS['+json.dumps(row['sku'])+']='+payload+';',encoding='utf-8')
        tmp.replace(target)
        lightweight.append({**row,'detailPath':detail_path,'markets':{
            market:[{k:v for k,v in p.items() if k not in heavy} for p in products]
            for market,products in row['markets'].items()}})
    bundle = {**result,'products':lightweight}
    tmp = out/'catalog.js.tmp'
    tmp.write_text('window.CATALOG='+json.dumps(bundle,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';',encoding='utf-8')
    tmp.replace(out/'catalog.js')
    return result

def merge_products(existing, added):
    """Merge normalized records by country-local product page without refetching existing rows."""
    merged = {p['productId']:p for p in existing}
    merged.update({p['productId']:p for p in added})
    return list(merged.values())

def segment_stats(products):
    return {'products':len(products),'detailsFetched':sum(bool(p.get('detailsComplete')) for p in products),
        'detailFailures':sum(not p.get('detailsComplete') for p in products)}

def load_existing_snapshot(root):
    for path in (root/'data'/'catalog.json', root/'dist'/'catalog.json'):
        if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    return {'errors':[]}

def load_normalized_cache(cache, market):
    products=[]
    for path in (cache/f'{market}-normalized.json',cache/f'{market}-kids-normalized.json'):
        if path.exists(): products=merge_products(products,json.loads(path.read_text(encoding='utf-8')))
    return products

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=ROOT/'dist')
    ap.add_argument('--cache',type=Path,default=ROOT/'.cache')
    ap.add_argument('--fresh',action='store_true',help='Ignore the 24-hour response cache')
    ap.add_argument('--catalog-only',action='store_true',help='Skip variant-detail requests; output is labelled incomplete')
    ap.add_argument('--segment',choices=tuple(SEGMENTS),default='adults',help='Scrape adults (default) or incrementally add kids')
    ap.add_argument('--rebuild-only',action='store_true',help='Re-index cached adult/kids details without network requests')
    ap.add_argument('--workers',type=int,default=4)
    ap.add_argument('--delay',type=float,default=.35,help='Minimum seconds between request starts globally')
    args=ap.parse_args()
    if args.delay < 0 or not 1 <= args.workers <= 8: ap.error('delay must be nonnegative; workers must be 1–8')
    if args.rebuild_only:
        previous=load_existing_snapshot(ROOT)
        markets={market:load_normalized_cache(args.cache,market) for market in MARKETS}
        if any(not products for products in markets.values()): ap.error('normalized adult caches are required for --rebuild-only')
        coverage=previous.get('coverage',{})
        errors=previous.get('errors',[])
        result=build(markets,coverage,errors,args.output)
        print(f'Re-indexed {len(result["products"])} articles from cached details; no network requests.',flush=True)
        return 0 if result['complete'] else 1
    client=Client(args.cache,args.delay,args.fresh)
    markets, coverage = {}, {}
    previous = load_existing_snapshot(ROOT) if args.segment == 'kids' else {'errors':[]}
    errors = list(previous.get('errors',[]))
    for market in MARKETS:
        existing = []
        if args.segment == 'kids':
            existing_path = args.cache/f'{market}-normalized.json'
            if not existing_path.exists():
                ap.error(f'{existing_path} is required for a kids-only merge; run the adult scrape first')
            existing = json.loads(existing_path.read_text(encoding='utf-8'))
        listings, cov = catalog(client,market,args.segment)
        current = [normalize(p,market,False) for p in listings]
        markets[market] = merge_products(existing,current)
        coverage[market] = {**cov,'products':len(markets[market]),'detailsRequested':not args.catalog_only,
            'detailFailures':0,'detailsFetched':0}
        if args.catalog_only: continue
        def detail(p):
            try:
                d=client.get(market,'products/'+p['productId'])
                return normalize({**p,**d,'prices':p.get('prices',{})},market,True), None
            except Exception as exc:
                return normalize(p,market,False), {'market':market,'productId':p['productId'],'error':str(exc)}
        completed=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            for index,(p,error) in enumerate(pool.map(detail,listings),1):
                completed.append(p)
                if error: errors.append(error); coverage[market]['detailFailures']+=1
                else: coverage[market]['detailsFetched']+=1
                if index%50==0 or index==len(listings):
                    print(f'{market.upper()} details {index}/{len(listings)}; failures {coverage[market]["detailFailures"]}',flush=True)
        segment_path = args.cache/f'{market}-{args.segment}-normalized.json'
        atomic_json(segment_path,completed)
        if args.segment == 'adults':
            atomic_json(args.cache/f'{market}-normalized.json',completed)
        markets[market]=merge_products(existing,completed)
        existing_stats, current_stats = segment_stats(existing), segment_stats(completed)
        coverage[market] = {**cov,'products':len(markets[market]),'adultProducts':existing_stats['products'] if args.segment=='kids' else current_stats['products'],
            'kidsProducts':current_stats['products'] if args.segment=='kids' else 0,'detailsRequested':True,
            'detailFailures':existing_stats['detailFailures']+current_stats['detailFailures'],
            'detailsFetched':existing_stats['detailsFetched']+current_stats['detailsFetched'],
            'segments':{'adults':existing_stats if args.segment=='kids' else current_stats,
                        'kids':current_stats if args.segment=='kids' else {'products':0,'detailsFetched':0,'detailFailures':0}}}
    if args.catalog_only:
        for market in MARKETS:
            products=markets[market]
            stats=segment_stats(products)
            coverage[market]={**coverage[market],'products':len(products),'adultProducts':sum('kids' not in p.get('departments',[]) for p in products),
                'kidsProducts':sum('kids' in p.get('departments',[]) for p in products),'detailsRequested':False,
                'detailFailures':stats['detailFailures'],'detailsFetched':stats['detailsFetched']}
    # Publish only after both markets finish; interrupted runs preserve the last snapshot.
    result=build(markets,coverage,errors,args.output)
    print(f'Wrote {len(result["products"])} articles, {sum(len(p["markets"])==2 for p in result["products"])} exact matches. Complete: {result["complete"]}',flush=True)
    return 0 if result['complete'] or args.catalog_only else 1

if __name__=='__main__': raise SystemExit(main())
