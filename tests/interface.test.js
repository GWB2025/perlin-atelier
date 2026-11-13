// UI wiring checks in an isolated DOM stub. These do not replace real-browser QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot() {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const downloads=[],urls=new Map(),nodes=new Map(),timers=new Map();
  let timerId=0,initialise;
  class Element {
    constructor(type='div',value='') {
      this.type=type; this.value=value; this.children=[]; this.dataset={};
      this.attributes={}; this.events={}; this.innerHTML=''; this.disabled=false;
      this.classList={add(){},remove(){},toggle(){}};
    }
    addEventListener(name,fn) { this.events[name]=fn; }
    fire(name) { this.events[name]?.({}); }
    setAttribute(key,value) { this.attributes[key]=value; }
    appendChild(node) { this.children.push(node); return node; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    querySelector() { return new Element(); }
    remove() {}
    click() { downloads.push({filename:this.download,blob:urls.get(this.href)}); }
    showModal() { this.open=true; }
    close() { this.open=false; }
    style={};
  }
  for(const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [,tag,attrs,id]=match;
    nodes.set(id,new Element(attrs.match(/type="([^"]+)"/)?.[1] || tag,
      attrs.match(/value="([^"]+)"/)?.[1] || ''));
  }
  const presets=Array.from(html.matchAll(/data-preset="([^"]+)"/g),m=>{
    const e=new Element('button'); e.dataset.preset=m[1]; return e;
  });
  const stages=Array.from(html.matchAll(/data-stage="([^"]+)"/g),m=>{
    const e=new Element('button'); e.dataset.stage=m[1]; return e;
  });
  const title=new Element();
  const doc={
    getElementById(id){assert.ok(nodes.has(id),`Missing actual HTML id ${id}`); return nodes.get(id);},
    querySelectorAll(selector){return selector==='[data-stage]'?stages:presets;},
    querySelector(){return title;},createElement(tag){return new Element(tag);},body:new Element(),
    addEventListener(name,fn){if(name==='DOMContentLoaded')initialise=fn;}
  };
  const context={document:doc,Blob,console,
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},
    clearTimeout(id){timers.delete(id);},
    URL:{createObjectURL(blob){const url='blob:'+urls.size;urls.set(url,blob);return url;},revokeObjectURL(){}},
    addEventListener(){},crypto:{getRandomValues(arr){arr[0]=12345;}}
  };
  context.window=context;
  vm.createContext(context);
  for(const file of ['noise.js','font.js','lettering.js','art.js','downloads.js','app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  }
  initialise();
  return {nodes,stages,presets,downloads,context,flush(){
    const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());
  }};
}

test('interface starts on the final postcard and switches through all five stages', () => {
  const ui=boot();
  assert.equal(ui.nodes.get('stage-index').value,4);
  assert.equal(ui.nodes.get('paper-size').textContent,'148 × 105 mm');
  assert.equal(ui.nodes.get('download-svg').disabled,false);
  const initial=ui.nodes.get('artwork').innerHTML;
  for(let i=0;i<5;i++) {
    ui.stages[i].fire('click');
    assert.equal(ui.stages[i].attributes['aria-pressed'],'true');
    assert.ok(ui.nodes.get('status').textContent.includes('Ready to export'));
  }
  assert.equal(ui.nodes.get('artwork').innerHTML,initial);
});

test('guides are preview-only and an edited text is used in exported SVG', async () => {
  const ui=boot(),n=ui.nodes;
  n.get('show-guides').checked=true;n.get('show-guides').fire('change');
  assert.ok(n.get('artwork').innerHTML.includes('construction-guides'));
  n.get('text').value='Hello Sam & friends';n.get('text').fire('input');
  assert.equal(n.get('download-svg').disabled,true);
  ui.flush();n.get('download-svg').fire('click');
  const download=ui.downloads.at(-1),svg=await download.blob.text();
  assert.ok(svg.includes('Hello Sam &amp; friends'));
  assert.ok(!svg.includes('construction-guides'));
  assert.ok(download.filename.includes('-decorate-'));
});

test('styles, random source, blank text, reset and about actions are wired', () => {
  const ui=boot(),n=ui.nodes;
  n.get('style').value='Flow field';n.get('style').fire('change');ui.flush();
  assert.equal(n.get('stage-panel').hidden,true);
  n.get('reset').fire('click');
  assert.equal(n.get('stage-panel').hidden,false);
  n.get('textMode').value='numbers';n.get('textMode').fire('change');ui.flush();
  assert.equal(n.get('text').disabled,true);
  n.get('textMode').value='repeat';n.get('textMode').fire('change');
  n.get('text').value=' ';n.get('text').fire('input');ui.flush();
  assert.equal(n.get('download-svg').disabled,true);
  n.get('reset').fire('click');
  assert.equal(n.get('download-svg').disabled,false);
  n.get('about-button').fire('click');assert.equal(n.get('about-dialog').open,true);
  n.get('about-close').fire('click');assert.equal(n.get('about-dialog').open,false);
});
