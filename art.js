/* Pure SVG geometry generator. Everything is in millimetres for plotting. */
(function (root, factory) {
  const dependency = typeof module === 'object' && module.exports
    ? require('./noise.js') : root.PerlinNoise;
  const lettering = typeof module === 'object' && module.exports
    ? require('./lettering.js') : root.AtelierLettering;
  const api = factory(dependency, lettering);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PerlinArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (noiseModule, Lettering) {
  'use strict';

  const { Perlin, hashSeed, randomGenerator } = noiseModule;
  const PAPERS = Object.freeze({
    'A4': [210, 297],
    'A5': [148, 210],
    'A6': [105, 148],
    'Postcard 148 × 105': [148, 105],
    'Square 150': [150, 150],
    'Square 200': [200, 200]
  });
  const PALETTES = Object.freeze({
    'Kyoto earth': ['#D78231', '#AE8A61', '#664732'],
    'Micron black': ['#202522'],
    'Deep blue': ['#21588A', '#4386A8', '#8FB4BA'],
    'Botanical': ['#315A43', '#779567', '#C48D50'],
    'Evening': ['#354E79', '#8C6285', '#D48B6C'],
    'Plum & gold': ['#453854', '#96666D', '#C69B53']
  });
  const STYLES = ['Letter garden', 'Drifting lines', 'Flow field', 'Contour map', 'Organic orbits'];
  const DEFAULTS = Object.freeze({
    ...Lettering.DEFAULTS,
    style: 'Letter garden', paper: 'Postcard 148 × 105', orientation: 'landscape',
    palette: 'Kyoto earth', seed: 'garden-27', amplitude: 8,
    scale: 46, density: 56, octaves: 4, detail: 6,
    stroke: 0.3, margin: 7
  });

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function cleanNumber(value, fallback, low, high) {
    const converted = Number(value);
    return Number.isFinite(converted) ? clamp(converted, low, high) : fallback;
  }

  function normalise(options = {}) {
    const spec = Lettering.normalise({ ...DEFAULTS, ...options });
    if (!STYLES.includes(spec.style)) spec.style = DEFAULTS.style;
    if (!Object.prototype.hasOwnProperty.call(PAPERS, spec.paper)) spec.paper = DEFAULTS.paper;
    if (!Object.prototype.hasOwnProperty.call(PALETTES, spec.palette)) spec.palette = DEFAULTS.palette;
    spec.orientation = spec.orientation === 'landscape' ? 'landscape' : 'portrait';
    spec.seed = String(spec.seed).slice(0, 60);
    spec.amplitude = cleanNumber(spec.amplitude, DEFAULTS.amplitude, 0, 30);
    spec.scale = cleanNumber(spec.scale, DEFAULTS.scale, 5, 240);
    spec.density = cleanNumber(spec.density, DEFAULTS.density, 5, 180);
    spec.octaves = Math.round(cleanNumber(spec.octaves, DEFAULTS.octaves, 1, 7));
    spec.detail = Math.round(cleanNumber(spec.detail, DEFAULTS.detail, 1, 10));
    spec.stroke = cleanNumber(spec.stroke, DEFAULTS.stroke, 0.1, 1.5);
    spec.margin = cleanNumber(spec.margin, DEFAULTS.margin, 3, 20);
    let [width, height] = PAPERS[spec.paper];
    if (spec.orientation === 'landscape' && height > width) [width, height] = [height, width];
    if (spec.orientation === 'portrait' && width > height) [width, height] = [height, width];
    spec.width = width;
    spec.height = height;
    spec.margin = Math.min(spec.margin, width / 5, height / 5);
    return spec;
  }

  function fmt(number) {
    return Number(number.toFixed(3)).toString();
  }

  function xmlEscape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function createPath(points, closed = false) {
    if (points.length < 2) return '';
    return `M ${points.map((point, index) =>
      `${index ? 'L ' : ''}${fmt(point[0])} ${fmt(point[1])}`).join(' ')}${closed ? ' Z' : ''}`;
  }

  function initialise(spec) {
    return {
      spec, noise: new Perlin(spec.seed),
      random: randomGenerator(hashSeed(`art-${spec.seed}`)),
      layers: PALETTES[spec.palette].map(() => []),
      rawPaths: 0, points: 0
    };
  }

  function addPath(ctx, points, colourIndex, closed = false) {
    if (points.length < 2) return;
    const d = createPath(points, closed);
    if (d) {
      ctx.layers[colourIndex % ctx.layers.length].push(d);
      ctx.rawPaths += 1;
      ctx.points += points.length;
    }
  }

  function drawingArea(spec) {
    const { margin: m, width: w, height: h } = spec;
    return { left: m, right: w - m, top: m, bottom: h - m,
      width: w - 2 * m, height: h - 2 * m };
  }

  function driftingLines(ctx) {
    const { spec, noise } = ctx;
    const b = drawingArea(spec);
    const count = Math.round(spec.density * 0.85 + 3);
    const step = 2.7 - spec.detail * 0.20;
    for (let row = 0; row < count; row += 1) {
      const base = b.top + (row + 0.5) * b.height / count;
      const edgeDistance = Math.min(base - b.top, b.bottom - base);
      const localAmp = Math.min(spec.amplitude, Math.max(0, edgeDistance - 0.3));
      const points = [];
      const total = Math.max(2, Math.ceil(b.width / step));
      for (let i = 0; i <= total; i += 1) {
        const x = b.left + b.width * i / total;
        const n = noise.fbm(x / spec.scale + 3.2,
          base / spec.scale + 11.9, spec.octaves);
        const interference = noise.fbm(x / (spec.scale * 0.72) + 17,
          base / (spec.scale * 1.7) - 9, spec.octaves);
        const y = clamp(base + (n * 0.82 + interference * 0.25) * localAmp,
          b.top, b.bottom);
        points.push([x, y]);
      }
      addPath(ctx, points, row);
    }
  }

  function fieldDirection(ctx, x, y) {
    const { noise, spec } = ctx;
    const n = noise.fbm(x / spec.scale + 13.1,
      y / spec.scale - 8.2, spec.octaves);
    return (n * (1.5 + spec.amplitude * 0.30)) + 0.22;
  }

  function flowField(ctx) {
    const { spec, random } = ctx;
    const b = drawingArea(spec);
    const count = Math.round(spec.density * 1.2 + 8);
    const cols = Math.ceil(Math.sqrt(count * b.width / b.height));
    const rows = Math.ceil(count / cols);
    const step = 2.3 - spec.detail * 0.13;
    const maxSteps = Math.round(65 + spec.detail * 17);
    const inBounds = ([x, y]) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    for (let i = 0; i < count; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = b.left + ((col + 0.25 + random() * 0.5) / cols) * b.width;
      const y = b.top + ((row + 0.25 + random() * 0.5) / rows) * b.height;
      const start = [x, y];
      const walk = (direction) => {
        const part = [];
        let point = start;
        for (let j = 0; j < maxSteps; j += 1) {
          const angle = fieldDirection(ctx, point[0], point[1]);
          const midpoint = [point[0] + Math.cos(angle) * step * direction * 0.5,
            point[1] + Math.sin(angle) * step * direction * 0.5];
          const midAngle = fieldDirection(ctx, midpoint[0], midpoint[1]);
          const next = [point[0] + Math.cos(midAngle) * step * direction,
            point[1] + Math.sin(midAngle) * step * direction];
          if (!inBounds(next)) break;
          part.push(next);
          point = next;
        }
        return part;
      };
      const backward = walk(-1).reverse();
      const forward = walk(1);
      addPath(ctx, [...backward, start, ...forward], i);
    }
  }

  function organicOrbits(ctx) {
    const { spec, noise } = ctx;
    const b = drawingArea(spec);
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const maxRadius = Math.min(b.width, b.height) * 0.48;
    const count = Math.round(spec.density * 0.34 + 4);
    const samples = Math.round(110 + spec.detail * 32);
    const spacing = maxRadius / (count + 1);
    for (let i = 0; i < count; i += 1) {
      const baseRadius = spacing * (i + 1);
      const deviation = Math.min(spec.amplitude, spacing * 1.15) * 0.72;
      const points = [];
      for (let j = 0; j < samples; j += 1) {
        const theta = 2 * Math.PI * j / samples;
        const nx = Math.cos(theta);
        const ny = Math.sin(theta);
        const n = noise.fbm((cx + baseRadius * nx) / spec.scale + 4,
          (cy + baseRadius * ny) / spec.scale - 3, spec.octaves);
        const radius = clamp(baseRadius + n * deviation, 0.2, maxRadius);
        points.push([cx + nx * radius, cy + ny * radius]);
      }
      addPath(ctx, points, i, true);
    }
  }

  function keyFor(point) {
    return `${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}`;
  }

  function joinSegments(segments) {
    const adjacency = new Map();
    const visited = new Uint8Array(segments.length);
    for (let i = 0; i < segments.length; i += 1) {
      for (const endpoint of segments[i]) {
        const key = keyFor(endpoint);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key).push(i);
      }
    }
    const curves = [];
    for (let index = 0; index < segments.length; index += 1) {
      if (visited[index]) continue;
      visited[index] = 1;
      const chain = [segments[index][0], segments[index][1]];
      for (const backwards of [false, true]) {
        while (true) {
          const end = backwards ? chain[0] : chain[chain.length - 1];
          const candidates = adjacency.get(keyFor(end)) || [];
          const nextIndex = candidates.find(candidate => !visited[candidate]);
          if (nextIndex === undefined) break;
          visited[nextIndex] = 1;
          const segment = segments[nextIndex];
          const other = keyFor(segment[0]) === keyFor(end) ? segment[1] : segment[0];
          if (backwards) chain.unshift(other); else chain.push(other);
          if (chain.length > segments.length + 1) break;
        }
      }
      if (chain.length >= 2) curves.push(chain);
    }
    return curves;
  }

  function contourMap(ctx) {
    const { spec, noise } = ctx;
    const b = drawingArea(spec);
    const gridSize = 6 - spec.detail * 0.43;
    const nx = Math.max(3, Math.ceil(b.width / gridSize));
    const ny = Math.max(3, Math.ceil(b.height / gridSize));
    const dx = b.width / nx;
    const dy = b.height / ny;
    const values = new Float32Array((nx + 1) * (ny + 1));
    let min = Infinity;
    let max = -Infinity;
    const ix = (col, row) => row * (nx + 1) + col;
    for (let row = 0; row <= ny; row += 1) {
      for (let col = 0; col <= nx; col += 1) {
        const x = b.left + col * dx;
        const y = b.top + row * dy;
        const n = noise.fbm(x / spec.scale + 7.7,
          y / spec.scale + 16.2, spec.octaves);
        const ridges = noise.fbm(x / (spec.scale * 2.9) - 1.7,
          y / (spec.scale * 2.9) + 5.4, 2);
        const value = n + ridges * (spec.amplitude / 24);
        values[ix(col, row)] = value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    const levelCount = Math.round(clamp(spec.density / 5, 4, 26));
    for (let level = 0; level < levelCount; level += 1) {
      const target = min + ((level + 1) / (levelCount + 1)) * (max - min);
      const segments = [];
      for (let row = 0; row < ny; row += 1) {
        for (let col = 0; col < nx; col += 1) {
          const x = b.left + col * dx;
          const y = b.top + row * dy;
          const corners = [
            [x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy]
          ];
          const field = [
            values[ix(col, row)], values[ix(col + 1, row)],
            values[ix(col + 1, row + 1)], values[ix(col, row + 1)]
          ];
          const edges = [];
          for (let edge = 0; edge < 4; edge += 1) {
            const other = (edge + 1) % 4;
            if ((field[edge] > target) === (field[other] > target)) continue;
            const t = (target - field[edge]) / (field[other] - field[edge]);
            edges.push([edge, [
              corners[edge][0] + t * (corners[other][0] - corners[edge][0]),
              corners[edge][1] + t * (corners[other][1] - corners[edge][1])
            ]]);
          }
          if (edges.length === 2) {
            segments.push([edges[0][1], edges[1][1]]);
          } else if (edges.length === 4) {
            const byEdge = Object.fromEntries(edges);
            const centreHigh = field.reduce((sum, val) => sum + val, 0) / 4 > target;
            const pairs = centreHigh === (field[0] > target)
              ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]];
            pairs.forEach(pair => segments.push([byEdge[pair[0]], byEdge[pair[1]]]));
          }
        }
      }
      const curves = joinSegments(segments);
      curves.forEach(curve => addPath(ctx, curve, level));
    }
  }

  let letteringCache = null;

  function makeArtwork(options = {}) {
    const spec = normalise(options);
    const ctx = initialise(spec);
    let model = null;
    if (spec.style === 'Letter garden') {
      const { stage, palette, stroke, ...geometry } = spec;
      const key = JSON.stringify(geometry);
      if (!letteringCache || letteringCache.key !== key) {
        letteringCache = { key, model: Lettering.generate(spec) };
      }
      model = letteringCache.model;
      for (const path of model.stages[spec.stage]) addPath(ctx, path.points, path.colour);
    } else {
    switch (spec.style) {
      case 'Flow field': flowField(ctx); break;
      case 'Contour map': contourMap(ctx); break;
      case 'Organic orbits': organicOrbits(ctx); break;
      default: driftingLines(ctx);
    }
    }
    const stageName = model ? Lettering.STAGES[spec.stage] : '';
    const colours = PALETTES[spec.palette];
    const groups = colours.map((colour, index) => {
      const paths = ctx.layers[index];
      if (!paths.length) return '';
      return `  <g id="pen-${String(index + 1).padStart(2, '0')}" data-pen="${index + 1}"` +
        ` inkscape:groupmode="layer" inkscape:label="Pen ${index + 1} · ${colour}"` +
        ` data-ink="${colour}" stroke="${colour}" fill="none" stroke-width="${fmt(spec.stroke)}"` +
        ` stroke-linecap="round" stroke-linejoin="round">\n` +
        paths.map(d => `    <path d="${d}"/>`).join('\n') + '\n  </g>';
    }).filter(Boolean).join('\n');
    const settings = JSON.stringify({ ...spec, generatedBy: 'Perlin Atelier 1.1.1',
      ...(model ? { stageName, inspiration: 'Dan Catt newsletter #099; original implementation' } : {}) });
    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${fmt(spec.width)}mm" height="${fmt(spec.height)}mm" viewBox="0 0 ${fmt(spec.width)} ${fmt(spec.height)}">`,
      `  <title>Perlin Atelier — ${xmlEscape(spec.style)}${stageName ? ' · ' + stageName : ''}</title>`,
      `  <desc>${xmlEscape(spec.palette)}; seed ${xmlEscape(spec.seed)}; paths ${ctx.rawPaths}. All dimensions in millimetres.</desc>`,
      `  <metadata>${xmlEscape(settings)}</metadata>`,
      groups,
      '</svg>'
    ].join('\n');
    const guidePaths = model ? (spec.stage >= 3 ? model.stages[2].map(p =>
      `<path d="${createPath(p.points)}" fill="none" stroke="#879a96" stroke-width="0.15" opacity="0.55"/>`).join('') : '') +
      (spec.stage >= 2 ? model.masks.map(p => `<path d="${createPath(p, true)}" fill="#e9b945" fill-opacity="0.12" stroke="#b48a29" stroke-width="0.2" stroke-dasharray="1 1"/>`).join('') : '') : '';
    return { svg, spec, stageName, guidePaths, stats: model?.stats,
      warnings: model?.warnings || [], pathCount: ctx.rawPaths, pointCount: ctx.points,
      colours, pathsPerPen: ctx.layers.map(layer => layer.length) };
  }

  return { PAPERS, PALETTES, STYLES, DEFAULTS, normalise, makeArtwork,
    joinSegments, createPath };
});

