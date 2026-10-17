import importlib.util
import tempfile
import gzip
import json
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('scrape',Path(__file__).parents[1]/'scripts/scrape.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)

class CatalogTests(unittest.TestCase):
    def test_adult_filter(self):
        self.assertTrue(s.adult({'genderCategory':'UNISEX','sizeGender':'MEN'}))
        self.assertFalse(s.adult({'genderCategory':'UNISEX','sizeGender':'KIDS'}))
        self.assertFalse(s.adult({'genderCategory':'BABY'}))
    def test_kids_filter_excludes_baby(self):
        self.assertTrue(s.kids({'genderCategory':'KIDS','sizeGender':'KIDS'}))
        self.assertTrue(s.kids({'genderCategory':'UNISEX','sizeGender':'KIDS'}))
        self.assertFalse(s.kids({'genderCategory':'BABY','sizeGender':'BABY'}))
        self.assertFalse(s.kids({'genderCategory':'WOMEN','sizeGender':'WOMEN'}))
    def test_join_preserves_local_variants_and_styles(self):
        a={'sku':'123456','productId':'E123456-000','departments':['women'],'variants':[{'l2Id':'LOCAL-JP'}]}
        b={**a,'productId':'E123456-001','variants':[{'l2Id':'LOCAL-MY'}]}
        c={**b,'sku':'654321'}
        with tempfile.TemporaryDirectory() as d:
            r=s.build({'jp':[a], 'my':[b,c]}, {'jp':{'paginationComplete':True,'detailsRequested':True,'detailsFetched':1,'adultProducts':1},'my':{'paginationComplete':True,'detailsRequested':True,'detailsFetched':1,'adultProducts':1}},[],Path(d)/'dist')
            self.assertEqual(len(r['products']),2)
            self.assertEqual(r['products'][0]['markets']['jp'][0]['variants'][0]['l2Id'],'LOCAL-JP')
            self.assertEqual(r['products'][0]['markets']['my'][0]['variants'][0]['l2Id'],'LOCAL-MY')
            self.assertTrue(r['complete'])
            out=Path(d)/'dist'
            with gzip.open(out/'catalog.json.gz','rt',encoding='utf-8') as stream:
                self.assertEqual(json.load(stream),r)
            bundle=(out/'catalog.js').read_text()
            index=json.loads(bundle.removeprefix('window.CATALOG=').removesuffix(';'))
            self.assertNotIn('variants',index['products'][0]['markets']['jp'][0])
            self.assertEqual(index['products'][0]['detailPath'],'details/123456.js')
            self.assertIn('LOCAL-JP',(out/'details/123456.js').read_text())
            self.assertFalse((out/'catalog.json').exists())
    def test_partial_not_complete(self):
        with tempfile.TemporaryDirectory() as d:
            r=s.build({'jp':[]},{'jp':{'paginationComplete':True,'detailsRequested':True,'detailsFetched':1,'adultProducts':1}},[],Path(d)/'dist')
            self.assertFalse(r['complete'])
    def test_pagination_rejects_repeated_pages(self):
        class Fake:
            def get(self,*args):return {'pagination':{'total':3},'items':[{'productId':'E123456-000','genderCategory':'MEN'}]}
        with self.assertRaisesRegex(RuntimeError,'repeated page'):s.catalog(Fake(),'jp')
    def test_normalize_preserves_full_sku(self):
        p={'productId':'E123456-000','name':'Shirt','genderCategory':'MEN','l2s':[{'l2Id':'987','communicationCode':'123456-09-004-000','color':{'code':'COL09'},'size':{'code':'SIZ004'}}]}
        n=s.normalize(p,'jp',True)
        self.assertEqual(n['sku'],'123456');self.assertEqual(n['variants'],p['l2s'])
        self.assertTrue(n['detailsComplete'])

    def test_normalize_assigns_kids_department(self):
        p={'productId':'E123456-000','name':'Kids shirt','genderCategory':'UNISEX','sizeGender':'KIDS'}
        self.assertEqual(s.normalize(p,'my',False)['departments'],['kids'])

    def test_incremental_merge_replaces_same_local_product_only(self):
        adult={'productId':'E111111-000','sku':'111111'}
        old_kid={'productId':'E222222-000','sku':'222222','detailsComplete':False}
        new_kid={**old_kid,'detailsComplete':True}
        merged=s.merge_products([adult,old_kid],[new_kid])
        self.assertEqual(len(merged),2)
        self.assertTrue(next(p for p in merged if p['productId']=='E222222-000')['detailsComplete'])

    def test_related_articles_do_not_leak_into_primary_variants(self):
        p={'productId':'E123456-000','l1Id':'123456','name':'Shirt',
           'l1Ids':['123456','654321'],'l2s':[
               {'l2Id':'one','communicationCode':'123456-09-004-000'},
               {'l2Id':'two','communicationCode':'654321-09-004-000'}]}
        n=s.normalize(p,'jp',True)
        self.assertEqual([v['l2Id'] for v in n['variants']],['one'])
        self.assertEqual([v['l2Id'] for v in n['relatedVariants']],['two'])
        self.assertEqual(n['articleCodes'],['123456','654321'])
    def test_grouped_page_splits_into_active_article_records(self):
        base={'productId':'E469292-000','sku':'470041','articleCodes':['486164','470041'],'name':'Parka',
              'departments':['men'],'detailsComplete':True,'images':{'main':{'03':{},'57':{}},'chip':{'03':'a','57':'b'},'sub':[]},
              'prices':{'base':{'value':129.9}},'variants':[],
              'relatedVariants':[
                  {'communicationCode':'486164-03-004-000','sales':True,'color':{'code':'COL03','displayCode':'03'},
                   'size':{'code':'SIZ004'},'pld':{'code':'PTB000'},'prices':{'base':{'value':149.9}}},
                  {'communicationCode':'486164-57-004-000','sales':True,'color':{'code':'COL57','displayCode':'57'},
                   'size':{'code':'SIZ004'},'pld':{'code':'PTB000'},'prices':{'base':{'value':149.9}}}]}
        rows=s.expand_articles(base)
        self.assertEqual([r['sku'] for r in rows],['486164'])
        self.assertEqual([c['displayCode'] for c in rows[0]['colors']],['03','57'])
        self.assertEqual(set(rows[0]['images']['main']),{'03','57'})
        self.assertEqual(rows[0]['prices']['base']['value'],149.9)
        self.assertEqual(rows[0]['sourceSku'],'470041')
    def test_pending_details_not_complete(self):
        with tempfile.TemporaryDirectory() as d:
            cov={'paginationComplete':True,'detailsRequested':True,'adultProducts':2,'detailsFetched':1}
            r=s.build({'jp':[], 'my':[]},{'jp':cov,'my':cov},[],Path(d)/'dist')
            self.assertFalse(r['complete'])

if __name__=='__main__':unittest.main()
