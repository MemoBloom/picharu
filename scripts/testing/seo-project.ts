import { constants } from 'node:fs';
import { copyFile,cp,mkdir,readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** All synthetic assets, manifests and .next output stay in a disposable source copy. */
export async function createSeoTestProject(parent:string){
 const source=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),project=join(parent,'project');
 await mkdir(project);
 const paths=['package.json','package-lock.json','tsconfig.json','apps/web/package.json','apps/web/next.config.ts','apps/web/next-env.d.ts','apps/web/tsconfig.json','apps/web/src','apps/web/public','packages','scripts/seo','scripts/check-effect-privacy.mjs'];
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--',...paths],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of files){
  // No local environments, cloud metadata, private credentials, dependency or build trees are copied as project source.
  if(file.split('/').some(part=>part.startsWith('.env')||['.git','.vercel','.next','node_modules'].includes(part))||/\.(pem|key|p12)$/.test(file))continue;
  const target=join(project,file);await mkdir(dirname(target),{recursive:true});await copyFile(join(source,file),target,constants.COPYFILE_FICLONE);
 }
 // Keep relative workspace links inside the copy. Turbopack does not resolve external symlink roots by default.
 await cp(join(source,'node_modules'),join(project,'node_modules'),{recursive:true,verbatimSymlinks:true,mode:constants.COPYFILE_FICLONE,filter:file=>!file.includes('/node_modules/.cache')});
 const samples=[];
 for(const [name,width,height,color] of [['before',480,270,'#f7d7ac'],['after-v1',300,450,'#b5dacf'],['after-v2',640,360,'#dac8ef']] as const){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#665c67" stroke-width="4"/><rect x="10" y="${height/2-20}" width="${width-20}" height="40" fill="white"/><text x="20" y="${height/2+5}" font-size="15" fill="black">SYNTHETIC TEST ${name}</text></svg>`;
  const bytes=await sharp(Buffer.from(svg)).png().toBuffer(),sha256=createHash('sha256').update(bytes).digest('hex'),path=`/seo-examples/isolated-${name}-${sha256}.png`;
  await mkdir(join(project,'apps/web/public/seo-examples'),{recursive:true});await writeFile(join(project,'apps/web/public',path),bytes);samples.push({path,width,height,sha256});
 }
 const originalManifest=await readFile(join(source,'apps/web/src/content/seo/evidence-manifest.json'),'utf8');
 const originalBuild=await readFile(join(source,'apps/web/.next/BUILD_ID'),'utf8').catch(()=>null);
 return {project,source,samples,originalManifest,originalBuild};
}
