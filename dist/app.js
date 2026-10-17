'use strict';
const $ = s => document.querySelector(s);
const data = window.CATALOG || {products:[],coverage:{},errors:[]};
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = s => {try {const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const read = (k,f) => {try{return JSON.parse(localStorage.getItem(k)) ?? f;}catch{return f;}};
const write = (k,v) => {try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
let state={dept:'all',category:'All',saved:false,limit:24,rate:read('across-rate',null)};
const storedSaved=read('across-saved',[]);let saved=new Set();
const market=(p,m)=>p.markets[m]?.[0];
const primary=p=>market(p,'my')||market(p,'jp');
const price=p=>{const v=p?.prices?.promo?.value ?? p?.prices?.base?.value;return typeof v==='number'&&Number.isFinite(v)?v:null;};
const money=(v,m)=>v===null?'Not listed':m==='jp'?'¥'+v.toLocaleString('en-US'):'RM '+v.toFixed(2);
const image=(p,c)=>p?.images?.main?.[c || p?.colors?.[0]?.displayCode]?.image || Object.values(p?.images?.main||{})[0]?.image || '';
const variantKey=(sku,color='')=>`${String(sku)}|${String(color||'')}`;
const parseVariantKey=value=>{const [sku,color='']=String(value).split('|');return {sku,color};};
const defaultColor=p=>String(primary(p)?.colors?.[0]?.displayCode||'');
(Array.isArray(storedSaved)?storedSaved:[]).forEach(item=>{if(item&&typeof item==='object'){const sku=String(item.key||item.sku||''),color=String(item.color||'');if(/^\d{6}$/.test(sku))saved.add(variantKey(sku,color));return;}const value=String(item),parsed=parseVariantKey(value),p=data.products.find(product=>String(product.sku)===parsed.sku);if(/^\d{6}$/.test(parsed.sku))saved.add(variantKey(parsed.sku,value.includes('|')?parsed.color:p?defaultColor(p):''));});
write('across-saved',[...saved]);
const textOnly=s=>{return new DOMParser().parseFromString(String(s||''),'text/html').body.textContent;};
const saving=p=>{const my=price(market(p,'my')),jp=price(market(p,'jp'));return state.rate>0&&my>0&&jp!==null ? (my-jp*state.rate/100)/my*100 : null;};
const ringgitDifference=p=>{const my=price(market(p,'my')),jp=price(market(p,'jp'));return state.rate>0&&my!==null&&jp!==null ? my-jp*state.rate/100 : null;};
const savingLabel=p=>{const percent=saving(p),difference=ringgitDifference(p);if(percent===null||difference===null)return '';const direction=percent>=0?'less':'more';return `${Math.round(Math.abs(percent))}% ${direction} in Japan · RM ${Math.abs(difference).toFixed(2)} difference`;};
const wishlistStatus=message=>{$('#wishlistStatus').textContent=message;};
const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const dateStamp=()=>new Date().toISOString().slice(0,10);
function wishlistBackup(){const items=[...saved].map(parseVariantKey).map(({sku,color})=>({key:sku,color})).sort((a,b)=>a.key.localeCompare(b.key)||a.color.localeCompare(b.color));return {format:'across-wishlist',version:2,exportedAt:new Date().toISOString(),items,keys:[...new Set(items.map(item=>item.key))]};}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=2){
 const words=String(text||'').split(/\s+/),lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width<=maxWidth)line=next;else{if(line)lines.push(line);line=word;if(lines.length===maxLines-1)break;}}
 if(line&&lines.length<maxLines)lines.push(line);
 if(lines.length===maxLines&&words.join(' ')!==lines.join(' ')){while(lines[maxLines-1]&&ctx.measureText(lines[maxLines-1]+'…').width>maxWidth)lines[maxLines-1]=lines[maxLines-1].slice(0,-1);lines[maxLines-1]+='…';}
 lines.forEach((value,i)=>ctx.fillText(value,x,y+i*lineHeight));
}
function loadWishlistImage(src){return new Promise(resolve=>{if(!src){resolve(null);return;}const img=new Image(),done=value=>{clearTimeout(timer);resolve(value);};img.onload=()=>done(img);img.onerror=()=>done(null);const timer=setTimeout(()=>done(null),8000),thumbnail=src+(src.includes('?')?'&':'?')+'width=320';img.src='/image-proxy?url='+encodeURIComponent(thumbnail);});}
async function wishlistPageImages(){
 const entries=await Promise.all([...saved].sort().map(async key=>{const variant=parseVariantKey(key),product=data.products.find(p=>String(p.sku)===variant.sku),m=product&&primary(product),colorInfo=m?.colors?.find(c=>String(c.displayCode)===variant.color);return {...variant,product,colorInfo,photo:await loadWishlistImage(m&&safeURL(image(m,variant.color)))};})),perPage=7,pages=[];
 for(let page=0;page<Math.max(1,Math.ceil(entries.length/perPage));page++){
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#e60012';ctx.fillRect(72,70,92,92);ctx.fillStyle='#fff';ctx.font='700 25px Arial,sans-serif';ctx.textAlign='center';ctx.fillText('JP',118,108);ctx.fillText('MY',118,142);ctx.textAlign='left';ctx.fillStyle='#191919';ctx.font='700 43px Arial,sans-serif';ctx.fillText('ACROSS WISHLIST',190,115);ctx.fillStyle='#666';ctx.font='24px Arial,sans-serif';ctx.fillText(`Exported ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · ${entries.length} colour selection${entries.length===1?'':'s'}`,190,151);
  ctx.strokeStyle='#d8d8d8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(72,196);ctx.lineTo(1168,196);ctx.stroke();
  entries.slice(page*perPage,(page+1)*perPage).forEach(({sku,color,product,colorInfo,photo},index)=>{
   const y=220+index*205,my=product&&market(product,'my'),jp=product&&market(product,'jp'),name=product?primary(product).name:`Article #${sku}`;
   ctx.fillStyle='#f2f2f2';ctx.fillRect(72,y+12,154,154);if(photo){const scale=Math.min(154/photo.naturalWidth,154/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;ctx.drawImage(photo,72+(154-w)/2,y+12+(154-h)/2,w,h);}else{ctx.fillStyle='#aaa';ctx.font='17px Arial,sans-serif';ctx.fillText('IMAGE',117,y+94);}
   ctx.fillStyle='#777';ctx.font='700 18px Arial,sans-serif';ctx.fillText(`#${sku}`,250,y+34);ctx.fillStyle='#191919';ctx.font='700 25px Arial,sans-serif';wrapCanvasText(ctx,name,250,y+70,470,29,2);
   ctx.fillStyle='#555';ctx.font='700 19px Arial,sans-serif';ctx.fillText(`COLOUR · ${color||'—'} ${colorInfo?.name||''}`,250,y+137);ctx.fillStyle='#777';ctx.font='17px Arial,sans-serif';ctx.fillText(product?(my&&jp?'Japan & Malaysia':jp?'Japan only':'Malaysia only'):'Unavailable in this catalog snapshot',250,y+166);
   ctx.fillStyle='#777';ctx.font='17px Arial,sans-serif';ctx.fillText('FINAL MY PRICE',760,y+34);ctx.fillText('FINAL JP PRICE',970,y+34);ctx.fillStyle='#191919';ctx.font='700 27px Arial,sans-serif';ctx.fillText(money(price(my),'my'),760,y+72);ctx.fillText(money(price(jp),'jp'),970,y+72);
   if(product&&state.rate>0&&price(jp)!==null){ctx.fillStyle='#666';ctx.font='17px Arial,sans-serif';ctx.fillText(`≈ ${money(price(jp)*state.rate/100,'my')}`,970,y+101);}ctx.fillStyle='#286b49';ctx.font='700 17px Arial,sans-serif';wrapCanvasText(ctx,product?savingLabel(product):'',760,y+137,405,22,2);
   ctx.strokeStyle='#e1e1e1';ctx.beginPath();ctx.moveTo(72,y+192);ctx.lineTo(1168,y+192);ctx.stroke();
  });
  ctx.fillStyle='#777';ctx.font='18px Arial,sans-serif';ctx.fillText(`Page ${page+1} of ${Math.max(1,Math.ceil(entries.length/perPage))}`,72,1690);ctx.textAlign='right';ctx.fillText('Final prices reflect the catalog snapshot shown on ACROSS.',1168,1690);ctx.textAlign='left';
  pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.9).split(',')[1]),c=>c.charCodeAt(0))});
 }
 return pages;
}
function pdfFromImages(images){
 const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;const add=bytes=>{parts.push(bytes);length+=bytes.length;},ascii=s=>enc.encode(s),object=(n,body)=>{offsets[n]=length;add(ascii(`${n} 0 obj\n`));add(typeof body==='string'?ascii(body):body);add(ascii('\nendobj\n'));};
 add(Uint8Array.from([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 images.forEach((image,i)=>{const page=3+i*3,imageRef=page+1,contentRef=page+2,command='q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n';object(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);const head=ascii(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),tail=ascii('\nendstream'),body=new Uint8Array(head.length+image.bytes.length+tail.length);body.set(head);body.set(image.bytes,head.length);body.set(tail,head.length+image.bytes.length);object(imageRef,body);object(contentRef,`<< /Length ${command.length} >>\nstream\n${command}endstream`);});
 const xref=length,total=2+images.length*3;add(ascii(`xref\n0 ${total+1}\n0000000000 65535 f \n${Array.from({length:total},(_,i)=>String(offsets[i+1]).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
 return new Blob(parts,{type:'application/pdf'});
}
function group(p){
 const m=market(p,'my'),n=(m?.category||m?.name||'').toLowerCase();
 if(/outer|jacket|coat|parka|blouson|down|puffer/.test(n))return 'Outerwear';
 if(/bottom|pants|jeans|trousers|shorts|skirt/.test(n))return 'Bottoms';
 if(/inner|underwear|brief|boxer|bra |socks|heattech/.test(n))return 'Innerwear';
 if(/accessor|bag|belt|cap|hat|scarf|glove|charm|umbrella/.test(n))return 'Accessories';
 if(/dress|jumpsuit/.test(n))return 'Dresses';
 if(/lounge|pajama|pyjama/.test(n))return 'Loungewear';
 if(/shirt|top|sweat|cardigan|sweater|fleece|polo|knit|hoodie|\but\b/.test(n))return 'Tops & knits';
 return 'Other';
}
function saveButton(p,color){const key=variantKey(p.sku,color),active=saved.has(key);return `<button class="save" data-save="${esc(p.sku)}" data-save-color="${esc(color)}" aria-label="${active?'Remove':'Save'} ${esc(primary(p).name)} in ${esc(color||'this colour')}" aria-pressed="${active}">${active?'♥':'♡'}</button>`;}
function priceMarkup(p){const my=price(market(p,'my')),jp=price(market(p,'jp'));return `<div class="prices"><div><span>MALAYSIA</span><strong>${money(my,'my')}</strong></div><div><span>JAPAN</span><strong>${money(jp,'jp')}</strong>${jp!==null&&state.rate>0?`<small>≈ ${money(jp*state.rate/100,'my')}</small>`:''}</div></div>`;}
function card(p,selectedColor){const m=primary(p),colors=m.colors||[],color=String(selectedColor||colors[0]?.displayCode||''),colorInfo=colors.find(c=>String(c.displayCode)===color);return `<article class="card" data-sku="${esc(p.sku)}" data-color="${esc(color)}"><div class="picture"><button data-open="${esc(p.sku)}" aria-label="View ${esc(m.name)}"><img src="${esc(safeURL(image(m,color)))}?width=600" alt="${esc(m.name)} in ${esc(colorInfo?.name||color)}" loading="lazy"></button>${saveButton(p,color)}<span class="badge">${p.markets.jp&&p.markets.my?'EXACT CODE MATCH':p.markets.jp?'JAPAN ONLY':'MALAYSIA ONLY'}</span></div><div class="swatches" aria-label="Choose a colour to save">${colors.map(c=>`<button class="${String(c.displayCode)===color?'active':''}" data-color="${esc(c.displayCode)}" title="${esc(c.displayCode+' '+c.name)}" aria-label="View ${esc(c.name)}"><img src="${esc(safeURL(m.images?.chip?.[c.displayCode]))}" alt=""></button>`).join('')}</div>${state.saved?`<div class="saved-variant">SAVED COLOUR · ${esc(color)} ${esc(colorInfo?.name||'')}</div>`:''}<div class="meta">${esc(m.gender)} · ${esc((m.sizes||[]).map(s=>s.name).filter((v,i,a)=>i===0||i===a.length-1).join(' – '))} · #${esc(p.sku)}</div><button class="title" data-open="${esc(p.sku)}">${esc(m.name)}</button>${priceMarkup(p)}<p class="saving">${savingLabel(p)}</p></article>`;}
function render(){
 $('#sort option[value="saving"]').disabled=!(state.rate>0);
 if(!state.rate&&$('#sort').value==='saving')$('#sort').value='name';
 $('#rateNote').textContent=state.rate>0?'Using your rate: ¥100 = RM '+state.rate.toFixed(2)+'. Prices exclude travel, delivery and payment fees.':'Enter your rate to compare converted prices. Prices exclude travel, delivery and payment fees.';
 let products=(state.saved?[...saved].map(key=>{const variant=parseVariantKey(key);return {p:data.products.find(product=>String(product.sku)===variant.sku),color:variant.color};}).filter(item=>item.p):data.products.map(p=>({p,color:defaultColor(p)}))).filter(({p})=>state.dept==='all'||p.departments.includes(state.dept));
 const search=$('#search').value.trim().toLowerCase(),avail=$('#availability').value;
 const searchTerms=[search,search.match(/e\d{6}-\d{3}/)?.[0],search.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1]].filter(Boolean);
 products=products.filter(({p})=>{const searchable=[p.sku,...Object.values(p.markets).flatMap(ms=>ms.flatMap(m=>[m.name,m.productId,m.sourceSku,...(m.articleCodes||[]),m.url]))].join(' ').toLowerCase();return (state.category==='All'||group(p)===state.category)&&(!search||searchTerms.some(term=>searchable.includes(term)))&&(avail==='all'||avail==='both'&&p.markets.jp&&p.markets.my||avail==='jp'&&p.markets.jp&&!p.markets.my||avail==='my'&&p.markets.my&&!p.markets.jp);});
 const sort=$('#sort').value;
 products.sort((a,b)=>sort==='saving'?(saving(b.p)??-Infinity)-(saving(a.p)??-Infinity):sort==='my'||sort==='jp'?(price(market(a.p,sort))??Infinity)-(price(market(b.p,sort))??Infinity):primary(a.p).name.localeCompare(primary(b.p).name,'en'));
 $('#grid').innerHTML=products.slice(0,state.limit).map(({p,color})=>card(p,color)).join('');
 $('#resultCount').textContent=`${products.length.toLocaleString()} items`;
 $('#total').textContent=state.saved?'Your saved edit':state.dept==='all'?'Women / Men':state.dept[0].toUpperCase()+state.dept.slice(1);
 $('#empty').hidden=products.length!==0;$('#more').hidden=products.length<=state.limit;
 $('#savedCount').textContent=saved.size;
 $('#wishlistActions').hidden=!state.saved;
 if(!state.saved)wishlistStatus('');
 document.querySelectorAll('[data-dept]').forEach(b=>b.classList.toggle('active',!state.saved&&b.dataset.dept===state.dept));
 $('#saved').classList.toggle('active',state.saved);
 $('#categories').innerHTML=['All','Tops & knits','Outerwear','Bottoms','Dresses','Innerwear','Loungewear','Accessories','Other'].map(c=>`<button data-category="${c}" class="${state.category===c?'active':''}">${c}</button>`).join('');
}
function variantsMarkup(m,idx){return `<section class="market-detail" data-market-index="${idx}"><h3>${m.url.includes('/jp/')?'JAPAN · JPY':'MALAYSIA · MYR'} <small>${esc(m.productId)}</small></h3><p><strong>${money(price(m),m.url.includes('/jp/')?'jp':'my')}</strong> · Listed product price</p><div class="variant-controls"><select data-variant="color" aria-label="${idx} colour">${m.colors.map(c=>`<option value="${esc(c.code)}">${esc(c.displayCode+' '+c.name)}</option>`).join('')}</select><select data-variant="size" aria-label="${idx} size">${m.sizes.map(s=>`<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('')}</select><select data-variant="pld" aria-label="${idx} length">${m.lengths.map(l=>`<option value="${esc(l.code)}">${esc(l.name==='-'?'Standard length':l.name)}</option>`).join('')}</select></div><p class="variant-result"></p><a href="${esc(safeURL(m.url))}" target="_blank" rel="noopener">VIEW AT UNIQLO ↗</a>${m.sizeChartUrl?`<a href="${esc(safeURL(m.sizeChartUrl))}" target="_blank" rel="noopener">SIZE CHART ↗</a>`:''}</section>`;}
let currentMarkets=[], currentSku=null;
const pendingDetails = new Map();
function loadDetails(p){
 if(!p.detailPath)return Promise.resolve(p);
 if(window.CATALOG_DETAILS?.[p.sku])return Promise.resolve(window.CATALOG_DETAILS[p.sku]);
 if(pendingDetails.has(p.sku))return pendingDetails.get(p.sku);
 const promise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=p.detailPath;
  script.onload=()=>{script.remove();const result=window.CATALOG_DETAILS?.[p.sku];result?resolve(result):reject(new Error('Product details were not found.'));};
  script.onerror=()=>{script.remove();reject(new Error('Could not load product details. Please try again.'));};
  document.head.appendChild(script);
 });
 pendingDetails.set(p.sku,promise);
 promise.catch(()=>pendingDetails.delete(p.sku));
 return promise;
}
function updateVariant(section){const m=currentMarkets[Number(section.dataset.marketIndex)],value=key=>section.querySelector(`[data-variant="${key}"]`).value;
 const v=m.variants.find(v=>v.color?.code===value('color')&&v.size?.code===value('size')&&v.pld?.code===value('pld'));
 section.querySelector('.variant-result').textContent=!m.detailsComplete?'Variant details were not fetched for this item.':!v?'This colour / size / length combination is not listed.':`${money(price(v),m.url.includes('/jp/')?'jp':'my')} · ${v.sales?'Offered for sale':'Not currently offered'} · Local SKU ${v.l2Id}. Stock is confirmed on UNIQLO.`;
}
async function openProduct(sku){
 currentSku=sku;
 $('#detailBody').innerHTML='<p role="status">Loading product details…</p>';
 if(!$('#detail').open)$('#detail').showModal();
 let p;
 try{p=await loadDetails(data.products.find(p=>p.sku===sku));}
 catch(error){if(currentSku===sku)$('#detailBody').innerHTML=`<div><p role="alert">${esc(error.message)}</p><button data-open="${esc(sku)}">TRY AGAIN</button></div>`;return;}
 if(currentSku!==sku||!$('#detail').open)return;
 const m=primary(p);currentMarkets=[...(p.markets.my||[]),...(p.markets.jp||[])];const pics=[...Object.values(m.images.main||{}),...(m.images.sub||[])].map(x=>x.image).filter(Boolean);
 $('#detailBody').innerHTML=`<div><img class="detail-image" src="${esc(safeURL(image(m)))}" alt="${esc(m.name)}"><div class="detail-gallery">${pics.map((src,i)=>`<button data-gallery="${esc(safeURL(src))}" aria-label="Product image ${i+1}"><img src="${esc(safeURL(src))}?width=150" alt=""></button>`).join('')}</div></div><div><div class="eyebrow">ARTICLE ${esc(p.sku)} · ${p.markets.jp&&p.markets.my?'EXACT MATCH':'ONE COUNTRY'}</div><h2>${esc(m.name)}</h2>${priceMarkup(p)}${currentMarkets.map(variantsMarkup).join('')}<p class="detail-text">${esc(textOnly(m.description))}</p><p class="detail-text">${esc(textOnly(m.composition))}</p><p class="detail-text">${esc(textOnly(m.care))}</p></div>`;
 document.querySelectorAll('.market-detail').forEach(updateVariant);
}
document.addEventListener('click',e=>{let b=e.target.closest('button');if(!b)return;
 if(b.dataset.dept){state.dept=b.dataset.dept;state.saved=false;state.limit=24;render();}
 if(b.dataset.category){state.category=b.dataset.category;state.limit=24;render();}
 if(b.dataset.open)openProduct(b.dataset.open);
 if(b.dataset.save){const key=variantKey(b.dataset.save,b.dataset.saveColor);saved.has(key)?saved.delete(key):saved.add(key);write('across-saved',[...saved]);if(state.saved)render();else{const active=saved.has(key),p=data.products.find(product=>String(product.sku)===String(b.dataset.save)),m=p&&primary(p),info=m?.colors?.find(c=>String(c.displayCode)===String(b.dataset.saveColor));b.textContent=active?'♥':'♡';b.setAttribute('aria-pressed',active);b.setAttribute('aria-label',`${active?'Remove':'Save'} ${m?.name||'item'} in ${info?.name||b.dataset.saveColor}`);$('#savedCount').textContent=saved.size;}}
 if(b.dataset.color){const card=b.closest('.card'),p=data.products.find(p=>p.sku===card.dataset.sku),m=primary(p),info=m.colors?.find(c=>String(c.displayCode)===String(b.dataset.color)),save=card.querySelector('[data-save]');card.dataset.color=b.dataset.color;card.querySelector('.picture img').src=safeURL(image(m,b.dataset.color))+'?width=600';card.querySelector('.picture img').alt=`${m.name} in ${info?.name||b.dataset.color}`;card.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b));save.dataset.saveColor=b.dataset.color;const active=saved.has(variantKey(p.sku,b.dataset.color));save.textContent=active?'♥':'♡';save.setAttribute('aria-pressed',active);save.setAttribute('aria-label',`${active?'Remove':'Save'} ${m.name} in ${info?.name||b.dataset.color}`);const label=card.querySelector('.saved-variant');if(label)label.textContent=`SELECTED COLOUR · ${b.dataset.color} ${info?.name||''}`;}
 if(b.dataset.gallery)$('#detailBody .detail-image').src=b.dataset.gallery;
});
$('#detail').addEventListener('change',e=>{const s=e.target.closest('.market-detail');if(s)updateVariant(s);});
$('#close').onclick=()=>$('#detail').close();$('#detail').addEventListener('close',()=>{currentSku=null;});$('#detail').addEventListener('click',e=>{if(e.target===$('#detail'))$('#detail').close();});
$('#saved').onclick=()=>{state.saved=!state.saved;state.limit=24;if(state.saved){state.dept='all';$('#availability').value='all';}render();};
$('#exportWishlist').onclick=async()=>{if(!saved.size){wishlistStatus('Save at least one colour first.');return;}const button=$('#exportWishlist');button.disabled=true;button.setAttribute('aria-busy','true');wishlistStatus('Preparing product images and wishlist files…');try{const stamp=dateStamp(),backup=wishlistBackup(),pages=await wishlistPageImages();downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`across-wishlist-${stamp}.json`);downloadBlob(pdfFromImages(pages),`across-wishlist-${stamp}.pdf`);wishlistStatus(`Exported ${saved.size} colour selection${saved.size===1?'':'s'} as PDF and JSON.`);}catch(error){console.error(error);wishlistStatus('The wishlist could not be exported. Please try again.');}finally{button.disabled=false;button.removeAttribute('aria-busy');}};
$('#importWishlist').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const parsed=JSON.parse(await file.text());let items=parsed?.format==='across-wishlist'&&Array.isArray(parsed.items)?parsed.items:Array.isArray(parsed)?parsed.map(key=>({key})):parsed?.format==='across-wishlist'&&Array.isArray(parsed.keys)?parsed.keys.map(key=>({key})):null;if(!items)throw new Error('Unsupported wishlist file');const valid=items.map(item=>({sku:String(item?.key||item?.sku||item),color:String(item?.color||'')})).filter(item=>/^\d{6}$/.test(item.sku));if(!valid.length&&items.length)throw new Error('No valid article keys');valid.forEach(item=>{const p=data.products.find(product=>String(product.sku)===item.sku);saved.add(variantKey(item.sku,item.color||p&&defaultColor(p)||''));});write('across-saved',[...saved]);state.saved=true;state.dept='all';state.limit=24;$('#availability').value='all';render();const unavailable=valid.filter(item=>!data.products.some(p=>String(p.sku)===item.sku)).length;wishlistStatus(`Imported ${valid.length} colour selection${valid.length===1?'':'s'}${unavailable?` · ${unavailable} unavailable in this snapshot`:''}.`);}catch(error){console.error(error);wishlistStatus('That file is not a valid ACROSS wishlist backup.');}};
$('#more').onclick=()=>{state.limit+=24;render();};
for(const id of ['search','availability','sort'])$('#'+id).addEventListener(id==='search'?'input':'change',()=>{
 if(id==='search'&&/(?:^|\D)(?:e)?\d{6}(?:-\d{3})?(?:\D|$)/i.test($('#search').value))$('#availability').value='all';
 state.limit=24;render();
});
$('#rate').value=state.rate||'';$('#rate').oninput=()=>{state.rate=Number.isFinite(Number($('#rate').value))&&Number($('#rate').value)>0?Number($('#rate').value):null;write('across-rate',state.rate);render();};
$('#reset').onclick=()=>{state={...state,dept:'all',category:'All',saved:false,limit:24};$('#search').value='';$('#availability').value='all';render();};
$('#matches').textContent=data.products.filter(p=>p.markets.jp&&p.markets.my).length.toLocaleString();
$('#updated').textContent=data.generatedAt?'PRICE SNAPSHOT · '+new Date(data.generatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'No catalog loaded. Run the scraper.';
$('#coverage').textContent=(data.complete?'Full catalog and variant pass completed. ':'Partial catalog: some countries or variant details may be missing. ')+Object.entries(data.coverage).map(([m,c])=>`${m.toUpperCase()}: ${c.adultProducts} adult products, ${c.detailFailures||0} detail errors`).join(' · ')+'.';
const featured=data.products.find(p=>p.markets.my&&p.markets.jp&&/Sweat.*(Shirt|Hoodie)|Oxford Shirt/i.test(primary(p).name))||data.products.find(p=>p.markets.my&&p.markets.jp)||data.products[0];
if(featured){const m=primary(featured);$('#hero').src=safeURL(m.images.sub?.[0]?.image||image(m));$('#hero').alt=m.name;}
render();
