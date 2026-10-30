const test = require('node:test');
const assert = require('node:assert/strict');
const Download = require('../downloads.js');

test('native Save receives exact Unicode UTF-8 bytes and a simple filename', async () => {
  let request;
  const host={btoa:s=>Buffer.from(s,'binary').toString('base64'),webkit:{messageHandlers:{saveFile:{
    async postMessage(value) { request=value; return true; }
  }}}};
  const content='<svg>£ café → Kyoto</svg>';
  assert.equal(await Download.save(new Blob([content]),'postcard.svg',host),true);
  assert.equal(request.name,'postcard.svg');
  assert.equal(Buffer.from(request.data,'base64').toString('utf8'),content);
});

test('cancelling native Save is not reported as a saved file', async () => {
  const host={btoa:s=>Buffer.from(s,'binary').toString('base64'),webkit:{messageHandlers:{saveFile:{
    async postMessage() { return false; }
  }}}};
  assert.equal(await Download.save(new Blob(['x']),'test.svg',host),false);
});

test('native write errors reach the caller', async () => {
  const host={btoa:s=>Buffer.from(s,'binary').toString('base64'),webkit:{messageHandlers:{saveFile:{
    async postMessage() { throw new Error('Disk is full'); }
  }}}};
  await assert.rejects(Download.save(new Blob(['x']),'test.svg',host),/Disk is full/);
});

test('a browser still uses a download link and releases the object URL', async () => {
  let clicked=false,revoked=false;
  const anchor={click(){clicked=true;},remove(){}};
  const host={URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){revoked=true;}},
    document:{createElement(){return anchor;},body:{appendChild(){}}},setTimeout(fn){fn();}};
  assert.equal(await Download.save(new Blob(['x']),'test.svg',host),true);
  assert.ok(clicked && revoked);assert.equal(anchor.download,'test.svg');
});
