import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWoff1Codec} from 'woff1-codec';
import {createWoff2Codec} from 'woff2-codec';
import {FontCodecError} from 'web-font-codecs';
const directory='test/fixtures/corpus';
const provenance=JSON.parse(await readFile(`${directory}/provenance.json`,'utf8')) as {records:{name:string;sha256:string;licenseSha256:string;axes:string[];colrVersion:number|null;unicode:number[]}[]};
function tables(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=new Map<string,Uint8Array>();
 for(let i=0;i<view.getUint16(4);i++){const p=12+16*i;result.set(new TextDecoder().decode(bytes.subarray(p,p+4)),Uint8Array.from(bytes.subarray(view.getUint32(p+8),view.getUint32(p+8)+view.getUint32(p+12))));}
 return result;
}
for(const record of provenance.records)test(`${record.name}: variation/color/CJK tables survive both WOFF1 engines and WOFF2 transforms`,async()=>{
 const input=await readFile(`${directory}/${record.name}`);
 assert.equal(createHash('sha256').update(input).digest('hex'),record.sha256);
 assert.equal(createHash('sha256').update(await readFile(`${directory}/${record.name}.LICENSE.txt`)).digest('hex'),record.licenseSha256);
 const expected=tables(input);
 if(record.axes.length){assert.ok(expected.has('fvar'));const fvar=expected.get('fvar')!;assert.equal(new DataView(fvar.buffer).getUint16(8),record.axes.length);assert.ok(expected.has(record.name.endsWith('.otf')?'CFF2':'gvar'));}
 if(record.colrVersion!==null){assert.equal(new DataView(expected.get('COLR')!.buffer).getUint16(0),1);assert.ok(expected.get('CPAL')!.length>12);}
 if(record.name==='cjk.otf'){assert.ok(record.unicode.includes(0x4e2d));assert.ok(record.unicode.includes(0xac00));assert.ok(expected.has('vmtx'));}
 using one=await createWoff1Codec(),two=await createWoff2Codec();

 const first=two.encode(input).data;
 // Reuse the heap with different encodings before repeating the same operation.
 two.encode(input,{quality:0});
 assert.deepEqual(two.encode(input).data,first,'WOFF2 padding must be deterministic across heap reuse');
 const results=[one.decode(one.encode(input,{compression:'zlib'}).data).data,one.decode(one.encode(input,{compression:'zopfli',iterations:1}).data).data,...[true,false].map(allowTransforms=>two.decode(two.encode(input,{quality:4,allowTransforms}).data).data)];
 for(const bytes of results){const actual=tables(bytes);assert.deepEqual([...actual.keys()],[...expected.keys()]);for(const[tag,table]of expected){if(['head','glyf','loca'].includes(tag))continue;assert.deepEqual(actual.get(tag),table,`${record.name} ${tag} preservation`);}}
});
test('additional malformed directories, compressed lengths, and header invariants fail safely',async()=>{
 const input=await readFile(`${directory}/variable-truetype.ttf`);
 using one=await createWoff1Codec(),two=await createWoff2Codec();
 const rejects=(fn:()=>unknown)=>assert.throws(fn,(error:unknown)=>error instanceof FontCodecError);

 for(const mutate of [(b:Buffer)=>b.writeUInt32BE(b.readUInt32BE(12),28),(b:Buffer)=>b.writeUInt32BE(0xffffffff,24),(b:Buffer)=>b.writeUInt32BE(12,20)]){const bad=Buffer.from(input);mutate(bad);rejects(()=>one.encode(bad));rejects(()=>two.encode(bad));}
 for(const codec of [one,two])for(const [offset,value]of [[12,0],[14,1]] as const){const bad=codec.encode(input).data;new DataView(bad.buffer).setUint16(offset,value);rejects(()=>codec.decode(bad));}
 const woff=one.encode(input).data;new DataView(woff.buffer).setUint32(52,0xffffffff);rejects(()=>one.decode(woff));
 const woff2=two.encode(input,{quality:4}).data;new DataView(woff2.buffer).setUint32(20,0xffffffff);rejects(()=>two.decode(woff2));
 assert.ok(one.decode(one.encode(input).data).data.length,'Malformed calls do not poison the next valid conversion');
});
