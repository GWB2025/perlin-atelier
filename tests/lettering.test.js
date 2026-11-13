const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lettering.js');
const Font = require('../font.js');

test('arc-length sampling follows a bend and handles repeated points', () => {
  const path = [[0, 0], [0, 0], [10, 0], [10, 10]];
  assert.deepEqual(L.samplePath(path, 15).point, [10, 5]);
  assert.equal(L.pathLength(path), 20);
});

test('break clipping removes only the interior, even when both endpoints lie outside', () => {
  const mask = [[4, -2], [6, -2], [6, 2], [4, 2]];
  assert.deepEqual(L.clipOutside([[0, 0], [10, 0]], [mask]), [
    [[0, 0], [4, 0]], [[6, 0], [10, 0]]
  ]);
  assert.deepEqual(L.clipOutside([[4.5, 0], [5.5, 0]], [mask]), []);
  assert.deepEqual(L.clipOutside([[0, 3], [10, 3]], [mask]), [[[0, 3], [10, 3]]]);
});

test('growth collision picks the first crossing and stops there', () => {
  const index = new L.SegmentIndex(4);
  index.addPath([[8, -2], [8, 2]]);
  index.addPath([[3, -2], [3, 2]]);
  assert.deepEqual(index.firstHit([0, 0], [10, 0]).point, [3, 0]);
  assert.equal(index.firstHit([0, 3], [10, 3]), null);
});

test('stroke alphabet supports mixed case, numbers and the advertised symbols', () => {
  for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?+-=/&@#%:;()[]*_<>{}£$\\"\'') {
    assert.ok(Font.hasGlyph(char), `Missing ${char}`);
    assert.ok(Font.glyph(char).length, `Empty ${char}`);
  }
  assert.notDeepEqual(Font.glyph('a'), Font.glyph('A'));
});

const options = { width: 148, height: 105, margin: 7, seed: 'garden', rows: 8,
  rounds: 3, breaks: 4, breakSize: 14, letterSize: 3, letterSpacing: 1.25,
  cables: 12, text: 'HELLO SAM', textMode: 'repeat', font: 'Monoline',
  amplitude: 8, scale: 46, density: 56, octaves: 4, detail: 6 };

test('a seed reproduces every stage of the same composition', () => {
  const a = L.generate(options), b = L.generate(options);
  assert.deepEqual(a, b);
  assert.equal(a.stages.length, 5);
  assert.notDeepEqual(a.stages[0], L.generate({...options, seed: 'other'}).stages[0]);
  assert.ok(a.stages[1].length > a.stages[0].length);
  assert.ok(a.glyphs.length > 20);
  assert.ok(a.stages[4].length > a.stages[3].length);
});

test('all five stages stay inside the requested margin and contain finite coordinates', () => {
  for (const config of [options, {...options, rows:24, rounds:6, breaks:10,
    letterSize:8, amplitude:30, scale:5, density:180, cables:40}]) {
    const model = L.generate(config);
    for (const stage of model.stages) for (const path of stage) for (const [x,y] of path.points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= 7-1e-7 && x <= 141+1e-7, `x=${x}`);
      assert.ok(y >= 7-1e-7 && y <= 98+1e-7, `y=${y}`);
    }
  }
});

test('later settings leave earlier stages unchanged', () => {
  const a = L.generate(options);
  const b = L.generate({...options, text:'OTHER WORDS', cables:0});
  assert.deepEqual(a.stages.slice(0,3), b.stages.slice(0,3));
  assert.deepEqual(b.stages[3], b.stages[4]);
  const c = L.generate({...options, breaks:0});
  assert.deepEqual(c.stages[1], c.stages[2]);
});

test('unsupported characters are reported and blank custom text stays blank', () => {
  const model = L.generate({...options,text:'hi 🌻'});
  assert.ok(model.warnings.some(w => w.includes('🌻')));
  assert.equal(L.generate({...options,text:'   '}).glyphs.length,0);
});

test('custom lettering is sequential and user text is never interpreted as markup', () => {
  const model = L.generate({...options,text:'ABC', breaks:0});
  assert.equal(model.glyphs.slice(0,9).map(g=>g.char).join(''),'ABCABCABC');
  assert.doesNotThrow(()=>L.generate({...options,text:'<script>&"'}));
});
