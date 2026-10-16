// Textures drawn on a canvas at start-up: no image files. Facade tile, water ripples, sign atlas.

import { CanvasTexture, LinearMipmapLinearFilter, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { LOOK } from './config.js';

function canvas(width, height) {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return el;
}

/** One window column and one floor, tinted per building by vertex colour. */
export function createFacadeTexture(maxAnisotropy) {
  const size = LOOK.facadeTile;
  const el = canvas(size, size);
  const g = el.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  // Soft grime at the top and a slab line at the bottom keep large walls from looking flat.
  const grime = g.createLinearGradient(0, 0, 0, size);
  grime.addColorStop(0, 'rgba(120,100,80,0.10)');
  grime.addColorStop(0.35, 'rgba(120,100,80,0)');
  grime.addColorStop(1, 'rgba(120,100,80,0.14)');
  g.fillStyle = grime;
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(90,80,70,0.25)';
  g.fillRect(0, size - 6, size, 6);
  // The window.
  const wx = size * 0.28;
  const wy = size * 0.2;
  const ww = size * 0.44;
  const wh = size * 0.5;
  g.fillStyle = '#f1ece0';
  g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
  g.fillStyle = '#3f5368';
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(wx, wy, ww, wh * 0.22);
  g.fillStyle = '#f1ece0';
  g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
  g.fillStyle = 'rgba(70,60,50,0.45)';
  g.fillRect(wx - 7, wy + wh + 5, ww + 14, 5);
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = Math.min(4, maxAnisotropy);
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}

/** Tiling, soft light streaks on water. */
export function createRippleTexture() {
  const size = LOOK.rippleTile;
  const el = canvas(size, size);
  const g = el.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(70,130,140,0.28)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  // A fixed pattern, not random: the water looks the same every visit.
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 97) % size;
    const y = (i * 53 + (i % 7) * 19) % size;
    const len = 14 + ((i * 31) % 26);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + len / 2, y + oy - 4, x + ox + len, y + oy);
        g.stroke();
      }
    }
  }
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

const SIGN_STYLES = Object.freeze({
  vendor: { background: '#fff3d6', text: '#3b2a1c', border: '#c8553d' },
  stop: { background: '#f2c230', text: '#1d1d1d', border: '#1d1d1d' },
  billboard: { background: '#2f6f9f', text: '#fff6e0', border: '#f2c230' },
});
const BILLBOARD_BACKGROUNDS = Object.freeze(['#2f6f9f', '#c8553d', '#2f9e5a', '#8a4fc7', '#d98a2d', '#1f8a8a']);

/**
 * One texture holding every sign text. Cell 0 is solid dark, for posts and frames.
 * @param {Array<{ kind: string, text: string }>} signs
 * @returns {{ texture: CanvasTexture, rectFor: (sign: { kind: string, text: string }) => object,
 *   solid: { u: number, v: number } }}
 */
export function createSignAtlas(signs) {
  const { width: cellW, height: cellH } = LOOK.atlasCell;
  const { width, height } = LOOK.atlas;
  const columns = Math.floor(width / cellW);
  const rows = Math.floor(height / cellH);
  const el = canvas(width, height);
  const g = el.getContext('2d');
  const rects = new Map();
  const cellRect = (index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return { u0: (col * cellW) / width, u1: ((col + 1) * cellW) / width, v1: 1 - (row * cellH) / height, v0: 1 - ((row + 1) * cellH) / height };
  };
  g.fillStyle = '#2a2622';
  g.fillRect(0, 0, cellW, cellH);
  let next = 1;
  for (const sign of signs) {
    const key = `${sign.kind}:${sign.text}`;
    if (rects.has(key)) continue;
    if (next >= columns * rows) throw new Error('Sign atlas is full');
    const style = SIGN_STYLES[sign.kind];
    const x = (next % columns) * cellW;
    const y = Math.floor(next / columns) * cellH;
    g.fillStyle = sign.kind === 'billboard' ? BILLBOARD_BACKGROUNDS[next % BILLBOARD_BACKGROUNDS.length] : style.background;
    g.fillRect(x, y, cellW, cellH);
    g.strokeStyle = style.border;
    g.lineWidth = 8;
    g.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
    g.fillStyle = style.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fontSize = 60;
    g.font = `800 ${fontSize}px system-ui, "Segoe UI", Roboto, sans-serif`;
    const maxWidth = cellW - 40;
    const measured = g.measureText(sign.text).width;
    if (measured > maxWidth) {
      fontSize = Math.floor((fontSize * maxWidth) / measured);
      g.font = `800 ${fontSize}px system-ui, "Segoe UI", Roboto, sans-serif`;
    }
    g.fillText(sign.text, x + cellW / 2, y + cellH / 2 + 3);
    rects.set(key, cellRect(next));
    next += 1;
  }
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const dark = cellRect(0);
  return {
    texture,
    rectFor: (sign) => rects.get(`${sign.kind}:${sign.text}`),
    solid: { u: (dark.u0 + dark.u1) / 2, v: (dark.v0 + dark.v1) / 2 },
  };
}
