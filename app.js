(function () {
  'use strict';
  const { makeArtwork, DEFAULTS, STYLES, PAPERS, PALETTES } = window.PerlinArt;
  const controlIds = ['style', 'paper', 'orientation', 'palette', 'seed',
    'amplitude', 'scale', 'density', 'octaves', 'detail', 'stroke', 'margin',
    'textMode','text','font','rows','rounds','breaks','breakSize','letterSize','letterSpacing','cables'];
  const byId = id => document.getElementById(id);
  const controls = Object.fromEntries(controlIds.map(id => [id, byId(id)]));
  const svgHolder = byId('artwork');
  const countLabel = byId('path-count');
  const pointLabel = byId('point-count');
  const sizeLabel = byId('paper-size');
  const status = byId('status');
  const paletteLegend = byId('palette-legend');
  const defaults = { ...DEFAULTS };
  const presets = {
    'Letter garden': { style:'Letter garden',seed:'garden-27',text:'MAKE SOMETHING',
      rows:8,rounds:3,breaks:4,breakSize:14,letterSize:3,cables:12,stage:4,
      amplitude:8,scale:46,density:56,octaves:4,palette:'Kyoto earth' },
    'Soft currents': { style: 'Drifting lines', seed: '271828', amplitude: 8,
      scale: 46, density: 56, octaves: 4, detail: 6, palette: 'Kyoto earth' },
    'River delta': { style: 'Flow field', seed: 'river-22', amplitude: 13,
      scale: 64, density: 97, octaves: 3, detail: 6, palette: 'Deep blue' },
    'Highlands': { style: 'Contour map', seed: 'terrain-7', amplitude: 12,
      scale: 44, density: 90, octaves: 5, detail: 7, palette: 'Botanical' },
    'Quiet orbit': { style: 'Organic orbits', seed: 'cosmos', amplitude: 10,
      scale: 24, density: 71, octaves: 5, detail: 7, palette: 'Evening' },
    'Ink study': { style: 'Drifting lines', seed: 'ink-101', amplitude: 18,
      scale: 23, density: 100, octaves: 6, detail: 9, palette: 'Micron black' }
  };
  let latest = null;
  let debounce = null;
  let lastError = null;
  const descriptions = [
    'Build a skeleton of neighbouring horizontal lines and curved vertical connections.',
    'Sprout new branches in successive rounds. Each branch stops when it meets another line.',
    'Cut away sections with noise-distorted rectangles, leaving spaces for the composition to breathe.',
    'Replace the skeleton with stroke lettering, with a few small islands of letters inside the breaks.',
    'Connect selected letters with flowing cables. This is the finished composition.'
  ];

  function populate(select, values) {
    for (const label of values) {
      const option = document.createElement('option');
      option.textContent = label;
      option.value = label;
      select.appendChild(option);
    }
  }

  function readControls() {
    return {...Object.fromEntries(controlIds.map(id => [id, controls[id].value])),
      stage:Number(byId('stage-index').value)};
  }

  function setControls(settings) {
    for (const [key, value] of Object.entries(settings)) {
      if (controls[key] && value !== undefined) controls[key].value = value;
    }
    if (settings.stage !== undefined) byId('stage-index').value = settings.stage;
    updateValueLabels();
  }

  function updateValueLabels() {
    const units = { amplitude: ' mm', scale: ' mm', density: '',
      octaves: '', detail: '', stroke: ' mm', margin: ' mm',rows:'',rounds:'',breaks:'',
      breakSize:' mm',letterSize:' mm',letterSpacing:'×',cables:'' };
    Object.keys(units).forEach(id => {
      const output = byId(`${id}-value`);
      if (output) output.textContent = `${controls[id].value}${units[id]}`;
    });
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function render() {
    try {
      setStatus('Rendering…');
      latest = makeArtwork(readControls());
      lastError = null;
      // SVG content is built by our own numerical engine and escaped metadata.
      drawPreview();
      const graphic = svgHolder.querySelector('svg');
      if (graphic) graphic.setAttribute('aria-label', `${latest.spec.style} ${latest.stageName} preview`);
      countLabel.textContent = latest.pathCount.toLocaleString('en-GB');
      pointLabel.textContent = latest.pointCount.toLocaleString('en-GB');
      sizeLabel.textContent = `${latest.spec.width} × ${latest.spec.height} mm`;
      const swatches = latest.colours.map((colour, index) => {
        const item = document.createElement('div');
        item.className = 'pen-swatch';
        const spot = document.createElement('span');
        spot.className = 'swatch';
        spot.style.backgroundColor = colour;
        const label = document.createElement('span');
        label.textContent = `Pen ${index + 1} · ${latest.pathsPerPen[index]} paths`;
        item.append(spot, label);
        return item;
      });
      paletteLegend.replaceChildren(...swatches);
      const lettering = latest.spec.style === 'Letter garden';
      byId('lettering-controls').hidden = !lettering;
      byId('stage-panel').hidden = !lettering;
      controls.text.disabled = !['repeat','random'].includes(controls.textMode.value);
      controls.detail.disabled = lettering;
      controls.detail.title = lettering ? 'Line detail applies to the four abstract styles.' : 'Sampling detail along the generated curves';
      document.querySelector('.preview-header h2').textContent = lettering ? 'Let your letters wander.' : 'Make something unexpected.';
      byId('preview-subtitle').textContent = lettering ? 'One seed. Five stages. Your own words.' : 'Every variation begins with a seed.';
      byId('export-note').textContent = lettering ? 'Export the selected stage; construction guides stay out of your files.' : '';
      document.querySelectorAll('[data-stage]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.stage) === latest.spec.stage));
      });
      byId('show-guides').disabled = latest.spec.stage < 2;
      byId('stage-description').textContent = descriptions[latest.spec.stage];
      if (lettering) {
        const stats=latest.stats;
        const summaries=[`${stats.foundation} foundation lines`,`${stats.growth} new branches`,
          `${stats.breaks} cut-out regions`,`${stats.letters} letters`,`${stats.letters} letters · ${stats.cables} cables`];
        byId('stage-summary').textContent = summaries[latest.spec.stage];
      }
      const warnings = lettering && latest.spec.stage >= 3 ? latest.warnings : [];
      setStatus(warnings.length ? warnings.join(' ') : `Ready to export${latest.stageName ? ' · '+latest.stageName : ''} · vector artwork`);
      byId('download-svg').disabled = !latest.pathCount;
      byId('download-png').disabled = !latest.pathCount;
    } catch (error) {
      lastError = error;
      byId('download-svg').disabled = true;
      byId('download-png').disabled = true;
      setStatus(`Rendering failed: ${error.message}`, true);
    }
  }

  function drawPreview() {
    if (!latest) return;
    const guides=byId('show-guides').checked && latest.spec.style==='Letter garden' && latest.spec.stage>=2;
    svgHolder.innerHTML = guides
      ? latest.svg.replace('</metadata>',`</metadata><g id="construction-guides">${latest.guidePaths}</g>`)
      : latest.svg;
  }

  function clearPreset() {
    document.querySelectorAll('[data-preset]').forEach(button => {
      button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false');
    });
  }

  function scheduleRender() {
    updateValueLabels();
    clearTimeout(debounce);
    byId('download-svg').disabled = true;
    byId('download-png').disabled = true;
    setStatus('Updating artwork…');
    debounce = setTimeout(render, 110);
  }

  function flushRender() {
    clearTimeout(debounce);
    render();
  }

  function downloadBlob(blob, filename) {
    return window.AtelierDownload.save(blob, filename);
  }

  function basename() {
    const cleaned = String(latest.spec.seed).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 30);
    const style = latest.spec.style.toLowerCase().replace(/\s+/g, '-');
    return `perlin-${style}${latest.stageName ? '-'+latest.stageName.toLowerCase() : ''}-${cleaned || 'seed'}`;
  }

  async function exportSvg() {
    flushRender();
    if (!latest || lastError || !latest.pathCount) return;
    const stageName=latest.stageName;
    try {
      const saved=await downloadBlob(new Blob([latest.svg], { type: 'image/svg+xml;charset=utf-8' }), `${basename()}.svg`);
      setStatus(saved ? `SVG exported${stageName ? ' · '+stageName : ''} · use actual-size import for plotting` : 'Save cancelled');
    } catch(error) { setStatus(`SVG export failed: ${error.message}`,true); }
  }

  function exportPng() {
    flushRender();
    if (!latest || lastError || !latest.pathCount) return;
    const filename=`${basename()}.png`;
    const density = 4;
    const pixelWidth = Math.round(latest.spec.width * density);
    const pixelHeight = Math.round(latest.spec.height * density);
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) { setStatus('PNG export requires a browser with canvas support.', true); return; }
    const svgBlob = new Blob([latest.svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = function () {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(async blob => {
        if (!blob) { setStatus('PNG export could not encode the drawing.', true); return; }
        try {
          const saved=await downloadBlob(blob, filename);
          setStatus(saved ? 'PNG preview exported · use SVG for your plotter' : 'Save cancelled');
        } catch(error) { setStatus(`PNG export failed: ${error.message}`,true); }
      }, 'image/png');
    };
    image.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      setStatus('PNG export failed. SVG export is still available.', true);
    };
    image.src = objectUrl;
  }

  function randomSeed() {
    clearPreset();
    const array = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
      controls.seed.value = array[0].toString(36);
    } else {
      controls.seed.value = Math.floor(Math.random() * 0xFFFFFFFF).toString(36);
    }
    flushRender();
  }

  function loadPreset(key) {
    if (!presets[key]) return;
    setControls({ ...defaults, ...presets[key],
      paper: controls.paper.value, orientation: controls.orientation.value });
    document.querySelectorAll('[data-preset]').forEach(button => {
      button.classList.toggle('selected', button.dataset.preset === key);
      button.setAttribute('aria-pressed', String(button.dataset.preset === key));
    });
    flushRender();
  }

  function init() {
    populate(controls.style, STYLES);
    populate(controls.paper, Object.keys(PAPERS));
    populate(controls.palette, Object.keys(PALETTES));
    setControls(defaults);
    for (const control of Object.values(controls)) {
      control.addEventListener(['range','text','textarea'].includes(control.type) ? 'input' : 'change', () => {
        clearPreset();
        scheduleRender();
      });
    }
    document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{
      byId('stage-index').value=button.dataset.stage;
      flushRender();
    }));
    byId('show-guides').addEventListener('change',drawPreview);
    byId('surprise').addEventListener('click', randomSeed);
    byId('download-svg').addEventListener('click', exportSvg);
    byId('download-png').addEventListener('click', exportPng);
    byId('reset').addEventListener('click', () => {
      byId('show-guides').checked=false;
      setControls(defaults);
      loadPreset('Letter garden');
    });
    document.querySelectorAll('[data-preset]').forEach(button => {
      button.addEventListener('click', () => loadPreset(button.dataset.preset));
    });
    byId('about-button').addEventListener('click', () => byId('about-dialog').showModal());
    byId('about-close').addEventListener('click', () => byId('about-dialog').close());
    window.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault(); flushRender();
      }
    });
    loadPreset('Letter garden');
  }

  document.addEventListener('DOMContentLoaded', init);
})();

