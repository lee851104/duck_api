const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const html=fs.readFileSync(path.join(__dirname,'order-workbench.html'),'utf8');
const output=path.join(__dirname,'.verification');fs.mkdirSync(output,{recursive:true});
async function verify(){
 const failures=[],passed=[];
 const check=(condition,message)=>{if(!condition)throw Error(message);};
 const test=async(name,fn)=>{try{await fn();passed.push(name);}catch(error){failures.push(name+': '+error.message);}};
 const item=(name,qty=1)=>({name,qty,unit:'斤',process:''});
 const order=(id,items,issues=[],place='測試社區'+id)=>({id,place,items,issues,notes:[],raw:'測試訂單'+id});
 const setup=records=>{preparedProducts=new Set();orders=records.map(r=>({id:r.id,raw:r.raw}));results=copy(records);nextId=records.length+1;structuredDraft=null;selectedOrderId=null;editingId=null;lastDeleted=null;productSort='original';$('order-input').value='';render();};
 const dense=()=>[order(1,[item('帶皮蒜頭',20),...Array.from({length:22},(_,i)=>item('蔬菜'+i))]),order(2,[item('帶皮蒜頭')]),order(3,[item('帶皮蒜頭',2)])];
 const fits=selector=>{
   const rows=[...document.querySelectorAll(selector)];check(rows.length>20,'dense fixture rendered');
   for(const row of rows){
     const bounds=row.getBoundingClientRect();
     for(const child of row.querySelectorAll('.portion'))check(child.getBoundingClientRect().bottom<=bounds.bottom+1,'portion overflows product row');
     const parts=[...row.querySelectorAll('.portion')];for(let i=1;i<parts.length;i++){const a=parts[i-1].getBoundingClientRect(),b=parts[i].getBoundingClientRect();check(b.top>=a.bottom-1||b.left>=a.right-1||b.right<=a.left+1,'portions overlap');}
   }
 };
 await test('saved product notes migrate into editable price fields',()=>{setup([{...order(1,[{name:'玉米',qty:3,unit:'支',process:''},{name:'老薑',qty:50,unit:'',process:''}]),raw:'測試社區\n玉米3支60元\n老薑50元',notes:['玉米3支60元','老薑50元','請放管理室']}]);save();results=null;init();render();check(results[0].notes.join('|')==='請放管理室','duplicate product notes retained');check(results[0].items[0].amount===60&&results[0].items[1].unit==='元','price or monetary unit not recovered');startStructured(1);const price=document.querySelector('[data-item="0"] [data-field="amount"]');check(price.value==='60','price editor missing');price.value='';price.dispatchEvent(new Event('input',{bubbles:true}));$('save-structured').click();check(results[0].items[0].amount==null,'cleared price was re-inferred');save();init();check(results[0].items[0].amount==null,'cleared price returned on reload');});
 await test('portion tags open original order in both lists without navigating away',()=>{
 setup([{...order(1,[item('蛤蜊',1)]),raw:'第一張原文\n蛤蜊1斤\n<原樣保留>'},{...order(2,[item('蛤蜊',0.5)]),raw:'第二張原文\n蛤蜊半斤'}]);
 const tag=document.querySelector('#output [data-source-order="2"]');check(tag,'clickable order tag missing');tag.focus();tag.click();
 check($('source-dialog').open,'source window not opened');check($('source-raw').textContent===orders[1].raw,'wrong original order');check($('source-title').textContent.includes('#02'),'source order ID missing');
 check(selectedOrderId===null&&!structuredDraft,'source preview changed editor state');$('source-close').click();check(document.activeElement===tag,'focus not restored');
 openPrep();const list=$('prep-products'),button=list.querySelector('[data-source-order="1"]');const color=getComputedStyle(button.querySelector('.order-tag')).backgroundColor;button.click();
 check($('prep-dialog').open&&$('source-dialog').open,'expanded list closed or preview hidden');check($('source-dialog').matches(':modal'),'preview not above expanded list');
 check($('source-raw').textContent===orders[0].raw&&!$('source-raw').querySelector('*'),'original text interpreted as markup');$('source-close').click();check($('prep-dialog').open,'closing preview closed preparation list');
 check(color===getComputedStyle(document.querySelector('#output [data-source-order="1"] .order-tag')).backgroundColor,'order color changes between views');$('prep-dialog').close();
 });
 await test('long original preview fits viewport and preserves preparation scroll',()=>{
 setup(Array.from({length:24},(_,i)=>({...order(i+1,[item('蔬菜'+i)]),raw:('第'+(i+1)+'單的原始文字\n').repeat(150)})));
 openPrep();const list=$('prep-products'),button=list.querySelector('[data-source-order="20"]');button.scrollIntoView({block:'center'});button.focus({preventScroll:true});const before=list.scrollTop;button.click();
 const bounds=$('source-dialog').getBoundingClientRect();check(bounds.top>=0&&bounds.bottom<=innerHeight+1,'long preview escaped viewport');check($('source-raw').scrollHeight>$('source-raw').clientHeight,'long original cannot scroll');
 $('source-close').click();check(Math.abs(list.scrollTop-before)<2,'preparation scroll position changed');check(document.activeElement===button,'focus did not return to clicked tag');$('prep-dialog').close();
 });
 await test('expanded delivery list includes all orders and preserves list while viewing originals',()=>{
 setup(Array.from({length:50},(_,i)=>order(i+1,i===49?[]:[item('蛤蜊')],i===49?['配送地點待確認']:[],i<2?'同一社區':i===49?'地點待確認':'收貨地址'+i)));
 const trigger=document.querySelector('[data-deliveries]');check(trigger,'expand delivery button missing');trigger.focus();trigger.click();
 check($('delivery-dialog').open,'delivery list not opened');const list=$('delivery-list'),buttons=[...list.querySelectorAll('[data-source-order]')];check(buttons.length===50,'not all orders listed');check(buttons[0].textContent.includes('#01')&&buttons[1].textContent.includes('#02'),'same-place order IDs missing');check(buttons[49].textContent.includes('待確認'),'unresolved destination omitted');
 const target=buttons[39];target.scrollIntoView({block:'center'});target.focus({preventScroll:true});const before=list.scrollTop;target.click();check($('source-raw').textContent===orders[39].raw,'wrong delivery original');check($('delivery-dialog').open,'delivery list closed when previewing');$('source-close').click();check(Math.abs(list.scrollTop-before)<2,'delivery list lost scroll position');
 $('delivery-close').click();check(!$('delivery-dialog').open&&document.activeElement===trigger,'close did not restore main screen');
 openEditor(1,true);document.querySelector('[data-deliveries]').click();check($('delivery-list').querySelectorAll('[data-source-order]').length===50,'selected order filtered out other destinations');$('delivery-close').click();closeEditor();
 });
 await test('whole preparation card toggles once while order tags still preview',()=>{
 setup([order(1,[item('蛤蜊')])]);openPrep();const row=document.querySelector('#prep-products .product'),box=row.querySelector('[data-prepared]');
 row.click();check(box.checked&&row.classList.contains('prepared'),'card background did not check');row.querySelector('.product-name').click();check(!box.checked,'product name did not uncheck');row.querySelector('.quantity-total').click();check(box.checked,'total did not check');row.querySelector('.portion-breakdown').click();check(!box.checked,'allocation background did not uncheck');
 row.querySelector('.prepared-control span').click();check(box.checked,'label double-toggled');box.click();check(!box.checked,'checkbox double-toggled');row.querySelector('[data-source-order] .order-tag').click();check($('source-dialog').open&&!box.checked,'order tag changed completion');$('source-close').click();$('prep-dialog').close();
 });
 await test('preparation checkboxes toggle, persist, survive sorting and reset after quantity changes',()=>{
 setup([order(1,[item('蛤蜊'),item('玉米')]),order(2,[item('蛤蜊',0.5)])]);openPrep();
 const find=name=>[...document.querySelectorAll('#prep-products .product')].find(row=>row.querySelector('.product-name').textContent===name);
 let row=find('蛤蜊'),box=row.querySelector('[data-prepared]');check(box,'preparation checkbox missing');box.click();check(box.checked&&row.classList.contains('prepared'),'checked item not dimmed');check($('prep-meta').textContent.includes('已備妥 1 / 2'),'progress missing');
 row.querySelector('[data-source-order]').click();check($('source-dialog').open,'completed item original inaccessible');$('source-close').click();$('prep-sort').click();check(find('蛤蜊').querySelector('[data-prepared]').checked,'sorting lost completed state');$('prep-dialog').close();
 init();render();openPrep();row=find('蛤蜊');box=row.querySelector('[data-prepared]');check(box.checked,'reload lost completed state');box.click();check(!box.checked&&!row.classList.contains('prepared'),'unchecking did not restore item');box.click();$('prep-dialog').close();
 results[0].items[0].qty=2;save();openPrep();check(!find('蛤蜊').querySelector('[data-prepared]').checked,'changed quantity still marked ready');$('prep-dialog').close();results[0].items[0].qty=1;save();openPrep();check(!find('蛤蜊').querySelector('[data-prepared]').checked,'old ready state returned after reverting quantity');$('prep-dialog').close();
 });
 await test('copy buttons produce readable complete lists without changing layout',async()=>{
 setup([order(1,[item('蛤蜊',1)],[],'甲社區'),order(2,[item('蛤蜊',0.5),{name:'白蘿蔔',qty:1,unit:'根',process:'切'}],['玉米：請補數量'],'乙社區')]);
 const originalClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
 try{
 openDeliveries();check($('delivery-copy'),'delivery copy button missing');const before=$('delivery-list').innerHTML;await $('delivery-copy').onclick();check(copied.includes('配送清單')&&copied.includes('#01｜甲社區')&&copied.includes('#02｜乙社區'),'delivery numbering or places missing');check(copied.includes('訂單待確認'),'pending status lost');check(before===$('delivery-list').innerHTML&&$('delivery-dialog').open,'copy changed delivery layout');$('delivery-dialog').close();
 openPrep();document.querySelector('#prep-products [data-prepared]').click();const prepBefore=$('prep-products').innerHTML;await $('prep-copy').onclick();check(copied.includes('1. 蛤蜊｜總共 1.5斤｜已備妥'),'product total or ready state missing');check(copied.includes('• #01：1斤（甲社區）')&&copied.includes('• #02：半斤（乙社區）'),'individual portions missing');check(copied.includes('白蘿蔔（切）')&&copied.includes('玉米：請補數量'),'processing or unresolved information missing');check(prepBefore===$('prep-products').innerHTML,'copy changed preparation layout');
 navigator.clipboard.writeText=async()=>{throw Error('Permission denied');};await $('prep-copy').onclick();check($('copy-dialog').open&&$('copy-text').value.includes('備貨清單'),'clipboard failure lost manual-copy text');check($('copy-text').selectionEnd===$('copy-text').value.length,'manual text not selected');$('copy-close').click();check($('prep-dialog').open,'manual fallback closed original list');$('prep-dialog').close();
 }finally{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());if(originalClipboard)Object.defineProperty(navigator,'clipboard',originalClipboard);else delete navigator.clipboard;}
 });
 await test('sort buttons toggle both lists and preserve the setting',()=>{setup([order(1,[item('蛤蜊'),item('白蘿蔔'),item('玉米'),item('白蘿蔔(切)')])]);const names=()=>[...document.querySelectorAll('#output .product-name')].map(e=>e.textContent);$('product-sort').click();const sorted=names(),positions=sorted.flatMap((name,index)=>name.startsWith('白蘿蔔')?[index]:[]);check(positions[1]-positions[0]===1,'one click did not group variants');check($('product-sort').getAttribute('aria-pressed')==='true','sorted state missing');check(JSON.parse(localStorage.getItem('duck-order-prototype-v1')).productSort==='name','sort not saved');openPrep();check($('prep-sort').getAttribute('aria-pressed')==='true','dialog state not synced');$('prep-sort').click();check(names().join('|')==='蛤蜊|白蘿蔔|玉米|白蘿蔔(切)','second click did not restore original order');check($('product-sort').getAttribute('aria-pressed')==='false','main state not synced');$('prep-dialog').close();});
 await test('destination buttons always show stable order IDs',()=>{setup([order(2,[item('高山菠菜')],[],'同一社區'),order(7,[item('高山菠菜')],[],'同一社區')]);const buttons=[...document.querySelectorAll('[data-result]')];check(buttons[0].textContent.includes('#02')&&buttons[1].textContent.includes('#07'),'missing stable order IDs');});
 await test('unitless goods show total servings and each order quantity',()=>{const spinach=qty=>({name:'高山菠菜',qty,unit:'',process:''});setup([order(1,[spinach(1)]),order(2,[spinach(1)])]);const row=document.querySelector('#output .product');check(row.querySelector('.quantity-total')?.textContent==='總共 2份','missing serving total');check([...row.querySelectorAll('.portion')].map(p=>p.textContent).join('|')==='#01 1份|#02 1份','missing per-order servings');openPrep();check(document.querySelector('#prep-products .quantity-total').textContent==='總共 2份','expanded total missing');$('prep-dialog').close();});
 await test('weight totals retain unequal order portions',()=>{setup([order(1,[item('蛤蜊',1)]),order(2,[item('蛤蜊',0.5)])]);const row=document.querySelector('#output .product');check(row.querySelector('.quantity-total')?.textContent==='總共 1.5斤','wrong weight total');check([...row.querySelectorAll('.portion')].map(p=>p.textContent).join('|')==='#01 1斤|#02 半斤','weight portions lost');});
 await test('fifty allocations stay visible without overlap',()=>{setup(Array.from({length:50},(_,i)=>order(i+1,[item('蛤蜊',0.5)])));const row=document.querySelector('#output .product');check(row.querySelector('.quantity-total').textContent==='總共 25斤','incorrect large total');const portions=[...row.querySelectorAll('.portion')];check(portions.length===50,'lost allocation');for(const part of portions)check(part.getBoundingClientRect().bottom<=row.getBoundingClientRect().bottom+1,'allocation escaped its row');});
 await test('dense main list has no overlaps',()=>{setup(dense());fits('#output .product');});
 await test('dense expanded list has no overlaps',()=>{setup(dense());openPrep();fits('#prep-products .product');$('prep-dialog').close();});
 await test('accept complete order stays out of editor',()=>{setup([order(1,[item('番茄')],['番茄：請核對數量'])]);acceptReview(1);check(!structuredDraft,'opened editor');check(!results[0].issues.length,'issue not cleared');});
 await test('missing place gives inline explanation',()=>{setup([order(1,[item('番茄')],['配送地點不明，請補上配送地點。'],'地點待確認')]);acceptReview(1);check(!structuredDraft,'unexpected editor navigation');check($('result-message').textContent.includes('配送地點'),'missing actionable explanation');check(results[0].issues.length===1,'required issue lost');});
 await test('missing place action focuses highlighted field',()=>{setup([order(1,[item('番茄')],['配送地點不明，請補上配送地點。'],'地點待確認')]);check(!document.querySelector('[data-review-accept]'),'misleading accept button visible');document.querySelector('[data-review-edit]').click();check(document.activeElement===$('structured-place'),'place not focused');check($('structured-place').classList.contains('review-target'),'place not highlighted');});
 await test('quantity issue points to matching quantity',()=>{setup([order(1,[item('番茄')],['番茄：請核對數量'])]);document.querySelector('[data-review-issue]').click();check(document.activeElement.dataset.field==='qty','wrong field focused');check(document.activeElement.classList.contains('review-target'),'quantity not highlighted');check($('review-guidance').textContent.includes('番茄'),'source missing');});
 await test('omitted product gets empty quantity to fill',()=>{setup([order(1,[item('番茄')],['地瓜葉：請補上數量'])]);document.querySelector('[data-review-issue]').click();check(structuredDraft.items.length===2,'missing editable new item');check(structuredDraft.items[1].qty==='','invented quantity');check(document.activeElement.dataset.field==='name','product field not focused');check($('review-guidance').textContent.includes('地瓜葉'),'source missing');});
 await test('similar product name cannot receive another product issue',()=>{setup([order(1,[item('地瓜')],['地瓜葉：請補上數量'])]);document.querySelector('[data-review-issue]').click();check(structuredDraft.items.length===2,'pointed missing leaves at sweet potato');check(structuredDraft.items[0].qty===1,'existing quantity changed');check(document.activeElement.dataset.field==='name','wrong product quantity focused');});
 await test('fifty orders accepted, fifty-first blocked, all survive reload',()=>{setup([]);for(let i=1;i<=50;i++){$('order-input').value='測試地址'+i+'\n番茄1斤';add();}check(orders.length===50,'stopped before fifty');$('order-input').value='測試地址51\n番茄1斤';add();check(orders.length===50,'accepted fifty-first');check($('count').textContent.includes('/ 50'),'wrong limit label');save();orders=[];init();check(orders.length===50,'saved orders lost');});
 await test('fifty orders processed in bounded batches',async()=>{setup(Array.from({length:50},(_,i)=>order(i+1,[item('番茄')])));const calls=[];apiConfigured=true;apiRequest=async(route,body)=>{calls.push(body.orders.length);return {orders:body.orders.map(o=>order(o.id,[item('番茄')]))};};await $('generate').onclick();check(calls.join(',')==='10,10,10,10,10','unexpected batch sizes '+calls);check(results.length===50,'orders missing');check(!apiBusy,'busy flag stuck');});
 await test('failed later batch preserves previous results',async()=>{setup(Array.from({length:11},(_,i)=>order(i+1,[item('原商品')])));const before=JSON.stringify(results);let calls=0;apiRequest=async(route,body)=>{if(++calls===2)throw Error('測試中斷');return {orders:body.orders.map(o=>order(o.id,[item('新商品')]))};};await $('generate').onclick();check(JSON.stringify(results)===before,'partial batch replaced previous results');check(!apiBusy,'busy flag stuck');});
 setup(dense());clearPasteFeedback();resultNotice('');say('');window.scrollTo(0,0);if(innerWidth<680)openPrep();
 const report=document.createElement('pre');report.id='verification-result';report.hidden=true;report.textContent=failures.length?'FAIL: '+failures.join(' | '):'PASS: '+passed.join('; ');document.body.append(report);
}
const fixture=html.replace('</body>','<script>('+verify.toString()+')();</script></body>');
const fixturePath=path.join(output,'regression-ui.html');fs.writeFileSync(fixturePath,fixture);
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let failed=false;
for(const [name,size] of [['desktop','1440,900'],['narrow','480,850']]){
 const run=spawnSync(chrome,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--allow-file-access-from-files','--user-data-dir='+path.join(output,'regression-profile-'+name),'--window-size='+size,'--virtual-time-budget=5000','--dump-dom','--screenshot='+path.join(output,'regression-'+name+'.png'),'file:///'+fixturePath.replaceAll('\\','/')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 const report=run.stdout?.match(/<pre id="verification-result"[^>]*>([^<]*)/);
 console.log(name+': '+(report?report[1]:run.error||'No browser test report'));
 fs.writeFileSync(path.join(output,'regression-'+name+'.html'),run.stdout||'');
 if(!report||!report[1].startsWith('PASS:'))failed=true;
}
process.exitCode=failed?1:0;
