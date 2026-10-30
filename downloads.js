/* Browser downloads and the optional native macOS Save panel. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.AtelierDownload=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  'use strict';
  async function save(blob,name,host=globalThis) {
    const native=host.webkit?.messageHandlers?.saveFile;
    if(native) {
      const bytes=new Uint8Array(await blob.arrayBuffer());
      let binary='';
      for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return Boolean(await native.postMessage({name,data:host.btoa(binary)}));
    }
    const url=host.URL.createObjectURL(blob);
    const anchor=host.document.createElement('a');
    anchor.href=url;anchor.download=name;
    host.document.body.appendChild(anchor);anchor.click();anchor.remove();
    host.setTimeout(()=>host.URL.revokeObjectURL(url),2000);
    return true;
  }
  return {save};
});
