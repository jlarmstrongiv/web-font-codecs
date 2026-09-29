/** Optional fixture regeneration with pinned FontTools source; not run by normal checks. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {run as runProcess} from './process.ts';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const fonts=[
 {name:'variable-truetype.ttf',family:'Codec Test Variable TrueType',repo:'googlefonts/roboto-flex',revision:'739e06dc46ebb14cddd88b9768a6c1504d4677f6',path:'fonts/RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf',license:'OFL.txt',unicodes:'U+0020,U+0041-0043,U+0061-0063'},
 {name:'variable-cff2.otf',family:'Codec Test Variable CFF',repo:'adobe-fonts/source-serif',revision:'80d3f8894c09c937bebfa9011247d2e1c79fd6f4',path:'VAR/SourceSerif4Variable-Roman.otf',license:'LICENSE.md',unicodes:'U+0020,U+0041-0043,U+0061-0063'},
 {name:'cjk.otf',family:'Codec Test CJK',repo:'googlefonts/noto-cjk',revision:'f8d157532fbfaeda587e826d4cd5b21a49186f7c',path:'Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',license:'Sans/LICENSE',unicodes:'U+0020,U+0041,U+3042,U+30A2,U+4E00,U+4E2D,U+65E5,U+672C,U+AC00'},
 {name:'color-colrv1.ttf',family:'Codec Test Color',repo:'googlefonts/noto-emoji',revision:'8998f5dd683424a73e2314a8c1f1e359c19e8742',path:'fonts/Noto-COLRv1.ttf',license:'fonts/LICENSE',unicodes:'U+0020,U+1F600,U+1F601'},
];
const python=process.env.CORPUS_PYTHON??'python3';
const env={...process.env,PYTHONPATH:resolve('.cache/fonttools-source/Lib')};
async function run(args:string[]):Promise<string> { return (await runProcess(python,args,{env})).stdout.toString(); }
const version=(await run(['-c','import fontTools; print(fontTools.__version__)'])).trim();
if(version!=='4.65.0')throw new Error(`Expected FontTools 4.65.0, got ${version}`);
const directory='test/fixtures/corpus';await mkdir('.cache/corpus',{recursive:true});await mkdir(directory,{recursive:true});
const records=[];
for(const font of fonts){
 const base=`https://raw.githubusercontent.com/${font.repo}/${font.revision}/`;
 async function download(path:string){const r=await fetch(base+encodeURI(path));if(!r.ok)throw new Error(`${r.status}: ${path}`);return Buffer.from(await r.arrayBuffer());}
 const original=await download(font.path),license=await download(font.license);
 const input=`.cache/corpus/${font.name}`,output=`${directory}/${font.name}`;await writeFile(input,original);
 await run(['-m','fontTools.subset',input,`--output-file=${output}`,`--unicodes=${font.unicodes}`,'--name-IDs=*','--name-languages=*','--name-legacy','--notdef-glyph','--notdef-outline','--recommended-glyphs','--layout-features=*','--no-recalc-timestamp']);
 const details=JSON.parse(await run(['-c',`import json,sys
from fontTools.ttLib import TTFont
p,family=sys.argv[1:]
f=TTFont(p,recalcTimestamp=False)
for n in f['name'].names:
 if n.nameID in (1,3,4,6,16,25):
  value=family.replace(' ','') if n.nameID in (6,25) else family
  n.string=value.encode(n.getEncoding())
f.save(p)
f=TTFont(p,recalcTimestamp=False)
# Force independent decompilation of every retained table.
for tag in f.keys(): f[tag]
print(json.dumps(dict(tables=sorted(f.keys()),glyphs=len(f.getGlyphOrder()),unicode=sorted(f.getBestCmap()),axes=[a.axisTag for a in f['fvar'].axes] if 'fvar' in f else [],colrVersion=f['COLR'].version if 'COLR' in f else None)))`,output,font.family]));
 const bytes=await readFile(output);await writeFile(`${directory}/${font.name}.LICENSE.txt`,license);
 records.push({...font,sourceUrl:base+encodeURI(font.path),sourceSha256:createHash('sha256').update(original).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,licenseSha256:createHash('sha256').update(license).digest('hex'),...details});
 console.log(font.name,bytes.length,details.tables);
}
await writeFile(`${directory}/provenance.json`,JSON.stringify({fontTools:{version,revision:'656f89dbf2026a7225aafba4fa11218210a765f5',releasedAt:'2026-09-10T16:24:26Z'},records},null,2)+'\n');
