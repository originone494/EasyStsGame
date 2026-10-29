// Original editable SVG sources are rasterized into small, deliberate pixel sprites.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { figure, cardArt } from '../src/ui/art.ts';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const page=await browser.newPage();
async function raster(svg,path,width,height){
 const data=await page.evaluate(async({svg,width,height})=>{
  const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,width,height);
  const pixels=ctx.getImageData(0,0,width,height);for(let i=0;i<pixels.data.length;i+=4){for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(pixels.data[i+c]/12)*12;pixels.data[i+3]=pixels.data[i+3]<80?0:255;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];
 },{svg,width,height});await writeFile(path,Buffer.from(data,'base64'));
}
await raster(await readFile('public/art/forest.svg','utf8'),'public/art/forest.png',480,240);
for(const kind of ['player','crawler','runner','brute'])await raster(figure(kind),`public/art/${kind}.png`,35,45);
for(const key of ['strike','combo','step','push','prepare','debugHeal'])await raster(cardArt(key),`public/art/card-${key}.png`,70,78);
await browser.close();
