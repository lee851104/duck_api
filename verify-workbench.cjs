const fs = require('fs');
const vm = require('vm');
const path = require('path');
const verificationDir = path.join(__dirname, '.verification');
const assert = require('assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'order-workbench.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(script);
const ctx = vm.createContext({TextEncoder});
const block = (start, end) => script.slice(script.indexOf(start), script.indexOf(end));
vm.runInContext(block('function dateOf(', 'function parse('), ctx);
vm.runInContext(block('function normalizeProductNotes(', 'function issuesOf('), ctx);
vm.runInContext(block('function grouped(', 'function render('), ctx);
vm.runInContext(block('function xmlText(', "$('export-xlsx').onclick"), ctx);
const records = [
  {id:1, place:'市鎮之櫻B606', items:[
    {name:'小黃瓜',qty:5,unit:'根',process:''},
    {name:'番茄',qty:3,unit:'盒',process:''},
    {name:'白蘿蔔',qty:1,unit:'',process:'去皮'}
  ]},
  {id:2, place:'好好窩D13-2', items:[
    {name:'小黃瓜',qty:2,unit:'根',process:''},
    {name:'有機紅殼雞蛋',qty:1.5,unit:'斤',process:''},
    {name:'香蕉',qty:6,unit:'根',process:''}
  ]},
  {id:3,place:'測試補單',items:[
    {name:'香蕉',qty:4,unit:'根',process:''},
    {name:'=1+2 & <商品>',qty:1,unit:'盒',process:''},
    {name:'小黃瓜',qty:1,unit:'根',process:'切片'}
  ]}
];
ctx.records=records;
const grouped=vm.runInContext('grouped(records)',ctx);
assert.equal(grouped.find(i=>i.name==='小黃瓜'&&!i.process).qty,7);
assert.equal(grouped.find(i=>i.name==='小黃瓜'&&i.process).qty,1);
assert.equal(grouped.find(i=>i.name==='香蕉').qty,10);
const bytes=vm.runInContext('buildWorkbook(records,"2026-10-08")',ctx);
assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
assert.throws(()=>vm.runInContext('buildWorkbook(records,"2026-02-31")',ctx));
fs.mkdirSync(verificationDir,{recursive:true});
fs.writeFileSync(path.join(verificationDir, 'order-export-check.xlsx'),Buffer.from(bytes));
vm.runInContext(block('function issuesOf(', 'function dateOf('),ctx);
ctx.pending=[{id:1,place:'測試社區',items:[{name:'香蕉',qty:6,unit:'根',process:''}],issues:['地瓜葉數量不明']},{id:2,place:'第二單',items:[],issues:['請核對數量']}];
assert.equal(vm.runInContext('pending.every(validResult)',ctx),true);
assert.equal(vm.runInContext('grouped(pending)[0].qty',ctx),6);
const partial=vm.runInContext('buildWorkbook(pending,"2026-10-07")',ctx);
const partialText=Buffer.from(partial).toString('utf8');
assert(partialText.includes('待確認清單'));
assert(partialText.includes('地瓜葉數量不明'));
assert(partialText.includes('Relationship Id="rId4"'));
fs.writeFileSync(path.join(verificationDir, 'partial-export-check.xlsx'),Buffer.from(partial));
console.log('PASS: source syntax, unit/process grouping, numeric totals, XLSX creation, invalid-date guard');
console.log('PASS: partial results, empty pending order, confirmed totals, pending Excel sheet and relationship IDs');
ctx.pending[0].notes=['載具：/AB12+34','請放管理室'];
ctx.pending.push({id:3,place:'只有備註的訂單',items:[],issues:[],notes:['統編：12345678']});
assert.equal(vm.runInContext('pending.every(validResult)',ctx),true);
assert.equal(vm.runInContext('grouped(pending).length',ctx),1);
const noted=vm.runInContext('buildWorkbook(pending,"2026-10-07")',ctx);
assert(Buffer.from(noted).toString('utf8').includes('訂單備註：載具：/AB12+34'));
fs.writeFileSync(path.join(verificationDir, 'notes-export-check.xlsx'),Buffer.from(noted));
console.log('PASS: notes-only order, no notes in goods totals, notes included in order details');

// Catch lost order portions, even when quantities and delivery places match.
ctx.portionOrders = [
  {id:1,place:'甲社區',items:[
    {name:'蛤蜊',qty:1,unit:'斤',process:''},
    {name:'白蘿蔔',qty:1,unit:'根',process:'切'},
    {name:'玉米',qty:3,unit:'支',process:''}]},
  {id:2,place:'乙社區',items:[
    {name:'蛤蜊',qty:0.5,unit:'斤',process:''},
    {name:'白蘿蔔',qty:1,unit:'條',process:''},
    {name:'白蘿蔔(切)',qty:2,unit:'根',process:''}]},
  {id:3,place:'甲社區',items:[{name:'蛤蜊',qty:1,unit:'斤',process:''}]}
];
const original = JSON.stringify(ctx.portionOrders);
const portions = vm.runInContext('grouped(portionOrders)',ctx);
assert(Array.isArray(portions[0].portions), 'Preparation must retain individual order portions');
assert.deepEqual(JSON.parse(JSON.stringify(portions[0].portions)),[
  {orderId:1,place:'甲社區',qty:1},
  {orderId:2,place:'乙社區',qty:0.5},
  {orderId:3,place:'甲社區',qty:1}
]);
const sorted = vm.runInContext('grouped(portionOrders,"name")',ctx);
const radishIndices=sorted.flatMap((g,i)=>g.name.startsWith('白蘿蔔')?[i]:[]);
assert.equal(radishIndices.length,3);
assert.equal(radishIndices[2]-radishIndices[0],2);
assert.equal(JSON.stringify(ctx.portionOrders),original);
assert.deepEqual(Array.from(portions,g=>g.name),['蛤蜊','白蘿蔔','玉米','白蘿蔔','白蘿蔔(切)']);
const portionBook=vm.runInContext('buildWorkbook(portionOrders,"2026-10-08","name")',ctx);
// Read the actual uncompressed worksheet emitted by the workbook writer.
const portionZip=Buffer.from(portionBook);
let prepSheet='';
for(let offset=0;portionZip.readUInt32LE(offset)===0x04034b50;){
  const size=portionZip.readUInt32LE(offset+18),nameLength=portionZip.readUInt16LE(offset+26),extraLength=portionZip.readUInt16LE(offset+28);
  const start=offset+30+nameLength+extraLength;
  if(portionZip.toString('utf8',offset+30,offset+30+nameLength)==='xl/worksheets/sheet2.xml')prepSheet=portionZip.toString('utf8',start,start+size);
  offset=start+size;
}
const prepRows=[...prepSheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].filter(m=>+m[1]>=5).map(m=>[...m[2].matchAll(/<c [^>]*>([\s\S]*?)<\/c>/g)].map(c=>c[1].match(/<v>(.*?)<\/v>|<t[^>]*>(.*?)<\/t>/)[0].replace(/<[^>]+>/g,'')));
assert.equal(prepRows.length,7);
assert.deepEqual(prepRows.filter(r=>r[1]==='蛤蜊').map(r=>[r[2],r[3],r[5],r[6],r[7]]),[
  ['1','斤','1','1','甲社區'],['0.5','斤','1','2','乙社區'],['1','斤','1','3','甲社區']
]);
const workbookRadishes=prepRows.flatMap((r,i)=>r[1].startsWith('白蘿蔔')?[i]:[]);
assert.equal(workbookRadishes[2]-workbookRadishes[0],2);
vm.runInContext(block('const escapeHtml=', 'const color='),ctx);
const rendered=vm.runInContext('productMarkup(grouped(portionOrders))',ctx);
assert.equal((rendered.match(/class="portion"/g)||[]).length,7);
assert(rendered.includes('#02</span> <span class="portion-amount">半斤'));
assert(rendered.includes('data-source-order="2"'));
assert(rendered.includes('總共 2.5斤'));
assert(rendered.includes('訂單 #03'));
ctx.unsafeOrders=[{id:4,place:'<script>bad</script>',items:[{name:'<img>',qty:1,unit:'<斤>',process:'<切>'}]}];
const escaped=vm.runInContext('productMarkup(grouped(unsafeOrders))',ctx);
assert(!escaped.includes('<script>')&&!escaped.includes('<img>'));
assert(escaped.includes('&lt;斤&gt;')&&escaped.includes('&lt;切&gt;'));
const portionText=portionZip.toString('utf8');
assert(portionText.includes('每份數量'));
assert(portionText.includes('份數'));
assert(!portionText.includes('<v>2.5</v>'));
fs.writeFileSync(path.join(verificationDir,'portions-export-check.xlsx'),Buffer.from(portionBook));
console.log('PASS: separate order portions, matching quantities, adjacent variants, source order unchanged, portion workbook');

function workbookFiles(bytes){
  const zip=Buffer.from(bytes),files={};
  for(let offset=0;zip.readUInt32LE(offset)===0x04034b50;){
    const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extraLength=zip.readUInt16LE(offset+28);
    const start=offset+30+nameLength+extraLength;
    files[zip.toString('utf8',offset+30,offset+30+nameLength)]=zip.toString('utf8',start,start+size);
    offset=start+size;
  }
  return files;
}
const navigationFiles=workbookFiles(portionBook);
assert(navigationFiles['xl/workbook.xml'].includes('<sheet name="配送地點" sheetId="1"'), 'First worksheet must be the delivery directory');
const directoryXml=navigationFiles['xl/worksheets/sheet1.xml'];
assert.equal((directoryXml.match(/<hyperlink /g)||[]).length,3);
assert(!directoryXml.includes('蛤蜊'),'Directory must show destinations without goods');
assert(directoryXml.includes('甲社區 · 訂單 #01'));
assert(directoryXml.includes('甲社區 · 訂單 #03'));
const detailXml=navigationFiles['xl/worksheets/sheet3.xml'];
const detailLinks=[...directoryXml.matchAll(/<hyperlink ref="(A\d+)" location="&apos;訂單明細&apos;!(A\d+)"/g)];
assert.equal(detailLinks.length,3);
for(const [index,link] of detailLinks.entries()){
  const target=detailXml.match(new RegExp('<c r="'+link[2]+'"[^>]*>(.*?)</c>'));
  assert(target&&target[1].includes(ctx.portionOrders[index].place));
  assert(detailXml.includes('location="&apos;配送地點&apos;!'+link[1]+'"'));
}
assert.equal(new Set(detailLinks.map(link=>link[2])).size,3,'Each order has its own destination');
const notedFiles=workbookFiles(noted);
assert.equal((notedFiles['xl/worksheets/sheet1.xml'].match(/<hyperlink /g)||[]).length,3,'Orders with only notes or issues are still clickable');
assert(notedFiles['xl/worksheets/sheet3.xml'].includes('載具：/AB12+34'));
assert(notedFiles['xl/worksheets/sheet3.xml'].includes('地瓜葉數量不明'));
assert(notedFiles['xl/worksheets/sheet3.xml'].includes('統編：12345678'));
console.log('PASS: destination directory, unique clickable order targets, return links, notes and issues in detail');

ctx.pricedOrder={id:1,place:'測試社區',raw:'測試社區\n蛤蜊1斤150元\n白蘿蔔1根45元\n玉米3支60元\n老薑50元',items:[
 {name:'蛤蜊',qty:1,unit:'斤',process:''},{name:'白蘿蔔',qty:1,unit:'根',process:''},
 {name:'玉米',qty:3,unit:'支',process:''},{name:'老薑',qty:50,unit:'',process:''}
],notes:['嘉慧','有儲值','蛤蜊1斤150元','白蘿蔔1根45元','玉米3支60元','老薑50元','載具：/9ZYG46P','玉米請分開裝'],issues:[]};
const pricedBytes=vm.runInContext('buildWorkbook([pricedOrder],"2026-10-08")',ctx);
const pricedFiles=workbookFiles(pricedBytes);
assert(!pricedFiles['xl/worksheets/sheet3.xml'].includes('訂單備註：玉米3支60元'),'A confirmed product line must not also be exported as a note');
const normalized=vm.runInContext('normalizeProductNotes(pricedOrder)',ctx);
assert.deepEqual(JSON.parse(JSON.stringify(normalized.notes)),['嘉慧','有儲值','載具：/9ZYG46P','玉米請分開裝']);
assert.deepEqual(JSON.parse(JSON.stringify(normalized.items)),[
 {name:'蛤蜊',qty:1,unit:'斤',process:'',amount:150},{name:'白蘿蔔',qty:1,unit:'根',process:'',amount:45},
 {name:'玉米',qty:3,unit:'支',process:'',amount:60},{name:'老薑',qty:50,unit:'元',process:''}
]);
assert.equal(ctx.pricedOrder.items[3].unit,'','Export must not mutate its input');
assert(pricedFiles['xl/worksheets/sheet3.xml'].includes('金額（元）'));
assert(pricedFiles['xl/worksheets/sheet3.xml'].includes('<v>150</v>'));
assert(pricedFiles['xl/worksheets/sheet3.xml'].includes('載具：/9ZYG46P'));
fs.writeFileSync(path.join(verificationDir,'priced-export-check.xlsx'),Buffer.from(pricedBytes));
ctx.priceEdge={id:2,place:'A',raw:'',items:[{name:'地瓜',qty:1,unit:'斤',process:''}],notes:['地瓜葉1斤50元','地瓜1斤50元請切塊','運費50元','地瓜2斤100元'],issues:[]};
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('normalizeProductNotes(priceEdge).notes',ctx))),ctx.priceEdge.notes);
console.log('PASS: product notes deduplicated, prices kept with products, monetary quantity repaired, real notes retained');

ctx.ambiguousPrice={id:3,place:'A',raw:'白蘿蔔1根30元\n白蘿蔔1根/切',items:[{name:'白蘿蔔',qty:1,unit:'根',process:''},{name:'白蘿蔔',qty:1,unit:'根',process:'切'}],notes:['白蘿蔔1根30元'],issues:[]};
const ambiguousPrice=vm.runInContext('normalizeProductNotes(ambiguousPrice)',ctx);
assert(ambiguousPrice.items.every(item=>item.amount===undefined),'Ambiguous prices must not be applied twice');
assert.deepEqual(JSON.parse(JSON.stringify(ambiguousPrice.notes)),['白蘿蔔1根30元']);
ctx.chinesePrice={id:4,place:'A',raw:'玉米三支60元',items:[{name:'玉米',qty:3,unit:'支',process:''}],notes:['玉米三支60元'],issues:[]};
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('normalizeProductNotes(chinesePrice).notes',ctx))),['玉米三支60元']);
console.log('PASS: ambiguous and unsupported prices retained without guessing');
