const test = require('node:test');
const assert = require('node:assert/strict');
const Art = require('../art.js');

test('lettering exports five distinct, reproducible stages as plain paths', () => {
  const stages = Array.from({length:5},(_,stage)=>Art.makeArtwork({style:'Letter garden',stage}));
  assert.equal(new Set(stages.map(s=>s.svg)).size,5);
  for(let stage=0;stage<5;stage++) {
    const a=stages[stage];
    assert.ok(a.pathCount>0);
    assert.equal(a.pathCount,a.pathsPerPen.reduce((a,b)=>a+b,0));
    assert.match(a.svg,/width="[\d.]+mm" height="[\d.]+mm"/);
    assert.doesNotMatch(a.svg,/<(?:text|clipPath|mask|image|rect)\b/);
    assert.match(a.svg,/inkscape:groupmode="layer"/);
    assert.equal(Art.makeArtwork({style:'Letter garden',stage}).svg,a.svg);
    assert.equal(a.stageName,['Foundation','Grow','Break','Write','Decorate'][stage]);
  }
});

test('all original styles retain working, repeatable SVG export', () => {
  for(const style of ['Drifting lines','Flow field','Contour map','Organic orbits']) {
    const a=Art.makeArtwork({style,seed:'original',paper:'Postcard 148 × 105',orientation:'landscape'});
    assert.ok(a.pathCount>0);
    assert.equal(a.spec.width,148); assert.equal(a.spec.height,105);
    assert.equal(Art.makeArtwork(a.spec).svg,a.svg);
  }
});

test('stage and custom text are recorded safely in SVG metadata', () => {
  const a=Art.makeArtwork({style:'Letter garden',text:'<HELLO> & "Dan"',stage:3});
  assert.match(a.svg,/&lt;HELLO&gt; &amp;/);
  assert.doesNotMatch(a.svg,/<HELLO>/);
  assert.match(a.svg,/Write/);
});

test('invalid lettering inputs normalise to finite, supported settings', () => {
  const s=Art.normalise({rows:Infinity,rounds:-9,breaks:500,letterSize:'oops',stage:99,textMode:'bad'});
  assert.equal(s.rows,8); assert.equal(s.rounds,1); assert.equal(s.breaks,10);
  assert.equal(s.letterSize,3); assert.equal(s.stage,4); assert.equal(s.textMode,'repeat');
});
