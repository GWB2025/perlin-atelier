/* Five-stage composition inspired by Dan Catt's newsletter #099 (29 October 2026).
 * Original algorithms and stroke alphabet; not Dan's source code or handwriting.
 */
(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./noise.js') : root.PerlinNoise,
    common ? require('./font.js') : root.AtelierFont);
  if (common) module.exports = api;
  root.AtelierLettering = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Noise, Font) {
  'use strict';
  const EPS = 1e-8;
  const STAGES = ['Foundation', 'Grow', 'Break', 'Write', 'Decorate'];
  const DEFAULTS = Object.freeze({rows:8, rounds:3, breaks:4, breakSize:14,
    letterSize:3, letterSpacing:1.25, cables:12, text:'MAKE SOMETHING',
    textMode:'repeat', font:'Monoline', stage:4});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
  const distance = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
  const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
  const same = (a,b) => distance(a,b)<EPS;

  function normalise(input) {
    const result = {...input};
    for (const [key,low,high,integer] of [
      ['rows',3,24,true],['rounds',1,6,true],['breaks',0,10,true],
      ['breakSize',4,32,false],['letterSize',1.5,8,false],['letterSpacing',1,1.8,false],
      ['cables',0,40,true],['stage',0,4,true]
    ]) {
      const n = Number(input[key] ?? DEFAULTS[key]);
      const value = clamp(Number.isFinite(n)?n:DEFAULTS[key],low,high);
      result[key] = integer ? Math.round(value) : value;
    }
    result.text = String(input.text ?? DEFAULTS.text).slice(0,240);
    result.textMode = ['repeat','random','mixed','numbers','symbols'].includes(input.textMode) ? input.textMode : 'repeat';
    result.font = input.font === 'Slanted' ? 'Slanted' : 'Monoline';
    return result;
  }

  function pathLength(points) {
    let length=0;
    for(let i=1;i<points.length;i++) length+=distance(points[i-1],points[i]);
    return length;
  }

  function samplePath(points, offset) {
    let remaining=Math.max(0,offset), last={point:points[0],angle:0};
    for(let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i], length=distance(a,b);
      if(length<EPS) continue;
      const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
      if(remaining<=length) return {point:lerp(a,b,remaining/length),angle};
      remaining-=length; last={point:b,angle};
    }
    return last;
  }

  function intersection(a,b,c,d) {
    const r=sub(b,a), s=sub(d,c), denominator=cross(r,s), ca=sub(c,a);
    if(Math.abs(denominator)<EPS) return null;
    const t=cross(ca,s)/denominator, u=cross(ca,r)/denominator;
    return t>=-EPS && t<=1+EPS && u>=-EPS && u<=1+EPS
      ? {t:clamp(t,0,1),point:lerp(a,b,clamp(t,0,1))} : null;
  }

  class SegmentIndex {
    constructor(cellSize=6) { this.cellSize=cellSize; this.cells=new Map(); this.nextId=0; }
    keys(a,b) {
      const s=this.cellSize, keys=[];
      for(let x=Math.floor(Math.min(a[0],b[0])/s);x<=Math.floor(Math.max(a[0],b[0])/s);x++)
        for(let y=Math.floor(Math.min(a[1],b[1])/s);y<=Math.floor(Math.max(a[1],b[1])/s);y++) keys.push(`${x},${y}`);
      return keys;
    }
    add(a,b) {
      const segment={a,b,id:this.nextId++};
      for(const key of this.keys(a,b)) {
        if(!this.cells.has(key)) this.cells.set(key,[]);
        this.cells.get(key).push(segment);
      }
    }
    addPath(points) { for(let i=1;i<points.length;i++) this.add(points[i-1],points[i]); }
    firstHit(a,b) {
      const seen=new Set(); let first=null;
      for(const key of this.keys(a,b)) for(const segment of this.cells.get(key)||[]) {
        if(seen.has(segment.id)) continue;
        seen.add(segment.id);
        const hit=intersection(a,b,segment.a,segment.b);
        if(hit && hit.t>1e-6 && (!first || hit.t<first.t)) first=hit;
      }
      return first;
    }
  }

  function inside(point, polygon) {
    let yes=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if((a[1]>point[1]) !== (b[1]>point[1]) &&
        point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
    }
    return yes;
  }

  function clipOutside(points,masks) {
    if(!masks.length) return [points];
    const pieces=[]; let chain=[];
    const finish=()=>{if(chain.length>=2 && pathLength(chain)>EPS) pieces.push(chain);chain=[];};
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      const cuts=[0,1];
      for(const mask of masks) for(let k=0;k<mask.length;k++) {
        const hit=intersection(a,b,mask[k],mask[(k+1)%mask.length]);
        if(hit) cuts.push(hit.t);
      }
      cuts.sort((x,y)=>x-y);
      for(let k=1;k<cuts.length;k++) {
        const lo=cuts[k-1],hi=cuts[k];
        if(hi-lo<EPS) continue;
        if(masks.some(mask=>inside(lerp(a,b,(lo+hi)/2),mask))) {finish();continue;}
        const start=lerp(a,b,lo),end=lerp(a,b,hi);
        if(chain.length && !same(chain[chain.length-1],start)) finish();
        if(!chain.length) chain.push(start);
        chain.push(end);
      }
    }
    finish();return pieces;
  }

  function generate(input) {
    const s=normalise(input), m=s.margin;
    const bounds={left:m,right:s.width-m,top:m,bottom:s.height-m};
    const width=bounds.right-m,height=bounds.bottom-m;
    const noise=new Noise.Perlin(s.seed);
    const randomFor=label=>Noise.randomGenerator(Noise.hashSeed(`${s.seed}:${label}`));
    const inBounds=p=>p[0]>=m && p[0]<=bounds.right && p[1]>=m && p[1]<=bounds.bottom;
    const bounded=p=>[clamp(p[0],m,bounds.right),clamp(p[1],m,bounds.bottom)];
    const record=(points,kind,colour=0)=>({points,kind,colour});
    const foundation=[], growth=[], masks=[], glyphs=[], letters=[], cables=[], warnings=[];
    let rand=randomFor('foundation');
    const bandHeight=height/s.rows;
    const rails=Math.min(3,Math.max(1,Math.round(s.density/45)));
    // Shared broad noise keeps neighbouring rails broadly parallel; the second
    // component varies their separation to introduce attraction and repulsion.
    for(let row=0;row<s.rows;row++) {
      const y=m+(row+.5)*bandHeight;
      const x0=m+rand()*width*.09, x1=bounds.right-rand()*width*.09;
      for(let rail=0;rail<rails;rail++) {
        const points=[], count=Math.ceil((x1-x0)/1.3);
        for(let i=0;i<=count;i++) {
          const x=x0+(x1-x0)*i/count;
          const wave=noise.fbm(x/s.scale+5,row*.31+7,s.octaves)*Math.min(s.amplitude,bandHeight*.32);
          const spread=bandHeight*.21*(rail-(rails-1)/2)*(1+.35*noise.noise2(x/s.scale+21,row+.5));
          points.push(bounded([x,y+wave+spread]));
        }
        foundation.push(record(points,'foundation',row));
      }
      if(row<s.rows-1 && rand()<.85) {
        const x=m+width*(.15+.7*rand()),points=[];
        const bend=(rand()-.5)*bandHeight*.9;
        for(let i=0;i<=24;i++) {
          const t=i/24;
          points.push(bounded([x+Math.sin(Math.PI*t)*bend,y+bandHeight*t]));
        }
        foundation.push(record(points,'foundation',row));
      }
    }
    const index=new SegmentIndex(); foundation.forEach(p=>index.addPath(p.points));
    rand=randomFor('growth');
    let parents=foundation;
    for(let round=0;round<s.rounds;round++) {
      const fresh=[];
      const count=Math.min(96,Math.round(s.rows*(1.2+s.density/90)));
      for(let i=0;i<count;i++) {
        const parent=parents[Math.floor(rand()*parents.length)];
        if(!parent) continue;
        const start=samplePath(parent.points,pathLength(parent.points)*(.1+.8*rand()));
        const sign=rand()<.5?-1:1;
        const heading=start.angle+sign*Math.PI/2+(rand()-.5)*.6;
        let point=start.point;
        const points=[point],length=bandHeight*(.3+rand()*1.7)/(1+round*.15);
        const steps=Math.max(2,Math.ceil(length/.75));
        for(let step=1;step<=steps;step++) {
          const turn=noise.noise2(point[0]/s.scale+31,point[1]/s.scale+round)*.9;
          const next=[point[0]+Math.cos(heading+turn)*length/steps,
            point[1]+Math.sin(heading+turn)*length/steps];
          if(!inBounds(next)) break;
          const hit=index.firstHit(point,next);
          points.push(hit?hit.point:next);
          if(hit) break;
          point=next;
        }
        if(pathLength(points)>1.3) {
          const path=record(points,'growth',parent.colour);
          fresh.push(path);growth.push(path);index.addPath(points);
        }
      }
      parents=fresh.length?fresh:foundation;
    }
    rand=randomFor('break');
    for(let n=0;n<s.breaks;n++) {
      const rw=Math.min(width*.34,s.breakSize*(.8+rand()*.5));
      const rh=Math.min(height*.4,s.breakSize*(.6+rand()*.8));
      const cx=m+width*(.12+rand()*.76),cy=m+height*(.12+rand()*.76);
      const corners=[[-rw/2,-rh/2],[rw/2,-rh/2],[rw/2,rh/2],[-rw/2,rh/2]];
      const polygon=[];
      for(let side=0;side<4;side++) for(let i=0;i<12;i++) {
        const p=lerp(corners[side],corners[(side+1)%4],i/12);
        // Radial distortion of a rectangle keeps a simple closed boundary.
        const factor=1+.65*noise.fbm(p[0]/(s.scale*.22)+n*7+19,p[1]/(s.scale*.22)+37,3);
        polygon.push(bounded([cx+p[0]*factor,cy+p[1]*factor]));
      }
      masks.push(polygon);
    }
    const grown=[...foundation,...growth];
    const broken=grown.flatMap(path=>clipOutside(path.points,masks).map(points=>record(points,path.kind,path.colour)));

    rand=randomFor('write');
    const replacements={'’':"'",'‘':"'",'“':'"','”':'"','–':'-','—':'-','\n':' ','\t':' '};
    const chars=Array.from(s.text.normalize('NFD').replace(/[\u0300-\u036f]/g,''))
      .map(c=>replacements[c]??c);
    const missing=[...new Set(chars.filter(c=>!Font.hasGlyph(c)))];
    if(missing.length) warnings.push(`Unsupported characters replaced by ?: ${missing.join(' ')}`);
    const text=chars.map(c=>Font.hasGlyph(c)?c:'?');
    const sets={mixed:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',numbers:'0123456789',symbols:'+-=/&@#%*?!'};
    let cursor=0;
    const nextChar=()=>{
      if(s.textMode==='repeat') return text[cursor++%Math.max(1,text.length)]||' ';
      const set=s.textMode==='random'?text:(sets[s.textMode]||text);
      return set[Math.floor(rand()*set.length)]||' ';
    };
    // Spatial occupancy avoids lettering over lettering at the skeleton junctions.
    const occupied=new Map(),cell=Math.max(1,s.letterSize);
    function available(point,radius) {
      const gx=Math.floor(point[0]/cell),gy=Math.floor(point[1]/cell);
      for(let x=gx-2;x<=gx+2;x++) for(let y=gy-2;y<=gy+2;y++)
        for(const old of occupied.get(`${x},${y}`)||[]) if(distance(point,old.point)<radius+old.radius) return false;
      return true;
    }
    function reserve(point,radius) {
      const key=`${Math.floor(point[0]/cell)},${Math.floor(point[1]/cell)}`;
      if(!occupied.has(key)) occupied.set(key,[]);
      occupied.get(key).push({point,radius});
    }
    function place(path,offset,size,colour,within=null) {
      const sample=samplePath(path,offset);
      let angle=sample.angle;
      if(angle>Math.PI/2) angle-=Math.PI;
      if(angle< -Math.PI/2) angle+=Math.PI;
      const centre=[sample.point[0]+Math.sin(angle)*size*.45,sample.point[1]-Math.cos(angle)*size*.45];
      if(!available(centre,size*.39)) return;
      // Test a full character envelope before consuming the next letter.
      const transform=([x,y])=>{
        const localY=(y/8-1)*size;
        const localX=(x/8-.375)*size-(s.font==='Slanted'?localY*.18:0);
        return [sample.point[0]+localX*Math.cos(angle)-localY*Math.sin(angle),
          sample.point[1]+localX*Math.sin(angle)+localY*Math.cos(angle)];
      };
      const corners=[[0,0],[6,0],[6,10],[0,10]].map(transform);
      if(!corners.every(inBounds) || (within && !corners.every(p=>inside(p,within)))) return;
      const char=nextChar();
      if(char===' ') return;
      const strokes=Font.glyph(char).map(stroke=>stroke.map(transform));
      if(!strokes.every(stroke=>stroke.every(inBounds))) return;
      strokes.forEach(points=>letters.push(record(points,'letter',colour)));
      glyphs.push({char,centre,colour});reserve(centre,size*.39);
    }
    for(const path of broken) {
      const length=pathLength(path.points),size=s.letterSize;
      for(let offset=size*.7;offset<length-size*.7;offset+=size*.9*s.letterSpacing) place(path.points,offset,size,path.colour);
    }
    // Sparse little islands inside the removed regions retain negative space.
    for(let n=0;n<masks.length;n++) {
      const mask=masks[n];
      const minX=Math.min(...mask.map(p=>p[0])),maxX=Math.max(...mask.map(p=>p[0]));
      const cy=mask.reduce((sum,p)=>sum+p[1],0)/mask.length;
      const path=[[minX,cy],[maxX,cy]],size=s.letterSize*.85;
      for(let offset=size*1.4;offset<maxX-minX-size;offset+=size*1.4) place(path,offset,size,n,mask);
    }
    if(!glyphs.length) warnings.push('No letters fit. Enter text, reduce letter size or increase the spacing between rows.');
    rand=randomFor('decorate');
    const links=new Set();
    for(let attempt=0;attempt<s.cables*12 && cables.length<s.cables && glyphs.length>1;attempt++) {
      const ai=Math.floor(rand()*glyphs.length),bi=Math.floor(rand()*glyphs.length);
      const key=[ai,bi].sort((a,b)=>a-b).join(':');
      const a=glyphs[ai].centre,b=glyphs[bi].centre,span=distance(a,b);
      if(ai===bi || links.has(key) || span<s.letterSize*3 || span>Math.min(width,height)*.65) continue;
      links.add(key);
      const dx=b[0]-a[0],dy=b[1]-a[1],bulge=span*(.2+rand()*.35)*(rand()<.5?-1:1);
      const c1=bounded([a[0]+dx*.3-dy/span*bulge,a[1]+dy*.3+dx/span*bulge]);
      const c2=bounded([a[0]+dx*.7-dy/span*bulge,a[1]+dy*.7+dx/span*bulge]);
      const points=[],steps=Math.max(16,Math.ceil(span/.8));
      for(let i=0;i<=steps;i++) {
        const t=i/steps,u=1-t;
        points.push([u*u*u*a[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*b[0],
          u*u*u*a[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*b[1]]);
      }
      cables.push(record(points,'cable',glyphs[ai].colour));
    }
    return {spec:s,stages:[foundation,grown,broken,letters,[...letters,...cables]],
      masks,glyphs,warnings,stats:{foundation:foundation.length,growth:growth.length,
        breaks:masks.length,letters:glyphs.length,cables:cables.length}};
  }
  return {STAGES,DEFAULTS,normalise,generate,pathLength,samplePath,clipOutside,inside,SegmentIndex};
});
