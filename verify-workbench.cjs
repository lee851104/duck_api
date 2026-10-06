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
assert(Buffer.from(noted).toString('utf8').includes('Relationship Id="rId5"'));
fs.writeFileSync(path.join(verificationDir, 'notes-export-check.xlsx'),Buffer.from(noted));
console.log('PASS: notes-only order, no notes in goods totals, four-sheet Excel relationships');
