// Package the dependency-free app as one file that opens directly in a browser.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html = html.replace('<link rel="stylesheet" href="style.css"/>', () =>
  `<style>${fs.readFileSync(path.join(root,'style.css'),'utf8')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_,name) =>
  `<script>${fs.readFileSync(path.join(root,name),'utf8').replace(/<\/script/gi,'<\\/script')}</script>`);
const output = path.resolve(root,'dist');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'Perlin_Atelier.html'),html);
const Art = require('./art.js');
const samples = path.join(root,'samples');
fs.mkdirSync(samples,{recursive:true});
for(let stage=0;stage<5;stage++) {
  const art=Art.makeArtwork({style:'Letter garden',stage});
  fs.writeFileSync(path.join(samples,`${stage+1}-${art.stageName.toLowerCase()}.svg`),art.svg);
}
const mixed=Art.makeArtwork({style:'Letter garden',text:'Hello Dan! xoxo',font:'Slanted',seed:'postcard-26'});
fs.writeFileSync(path.join(samples,'mixed-case-postcard.svg'),mixed.svg);
for(const style of ['Drifting lines','Flow field','Contour map','Organic orbits']) {
  const art=Art.makeArtwork({style});
  fs.writeFileSync(path.join(samples,style.toLowerCase().replaceAll(' ','-')+'.svg'),art.svg);
}
console.log(`Built ${path.join(output,'Perlin_Atelier.html')}; wrote ten SVG samples.`);
