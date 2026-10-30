/* Perlin Atelier: seeded, dependency-free gradient noise. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PerlinNoise = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hashSeed(input) {
    const text = String(input);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomGenerator(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const GRADIENTS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]
  ];

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function interpolate(a, b, t) {
    return a + t * (b - a);
  }

  class Perlin {
    constructor(seed = 1) {
      const shuffled = Array.from({ length: 256 }, (_, index) => index);
      const rand = randomGenerator(hashSeed(seed));
      for (let i = 255; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.perm = Array.from({ length: 512 }, (_, i) => shuffled[i & 255]);
    }

    noise2(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);
      const p = this.perm;
      const dot = (hash, dx, dy) => {
        const gradient = GRADIENTS[hash & 7];
        return gradient[0] * dx + gradient[1] * dy;
      };
      const aa = p[p[xi] + yi];
      const ba = p[p[xi + 1] + yi];
      const ab = p[p[xi] + yi + 1];
      const bb = p[p[xi + 1] + yi + 1];
      const lower = interpolate(dot(aa, xf, yf), dot(ba, xf - 1, yf), u);
      const upper = interpolate(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u);
      return interpolate(lower, upper, v) * 1.41421356;
    }

    fbm(x, y, octaves = 4, persistence = 0.5) {
      let amplitude = 1;
      let frequency = 1;
      let sum = 0;
      let normaliser = 0;
      const count = Math.min(8, Math.max(1, Math.floor(octaves)));
      for (let i = 0; i < count; i += 1) {
        sum += amplitude * this.noise2(x * frequency, y * frequency);
        normaliser += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }
      return sum / normaliser;
    }
  }

  return { Perlin, hashSeed, randomGenerator, fade };
});

