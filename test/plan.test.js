import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planConversion, visibleNotes, fitsCanvas, svgOutputSize, encoderQuality, FORMATS, LIMITS, isFormat } from '../extension/lib/plan.js';

test('same format keeps the original bytes (no recompression)', () => {
  assert.deepEqual(planConversion({ type: 'png' }, 'png'), { mode: 'original', notes: ['noteSameFormat'] });
  assert.deepEqual(planConversion({ type: 'jpeg' }, 'jpg'), { mode: 'original', notes: ['noteSameFormat'] });
  assert.deepEqual(planConversion({ type: 'webp', animated: true }, 'webp'), { mode: 'original', notes: ['noteAnimatedKept'] });
});

test('approximate source (canvas fallback) is re-encoded even for the same format', () => {
  assert.equal(planConversion({ type: 'png', exact: false }, 'png').mode, 'convert');
});

test('conversion notes', () => {
  assert.deepEqual(planConversion({ type: 'webp' }, 'png'), { mode: 'convert', notes: [] });
  assert.deepEqual(planConversion({ type: 'png' }, 'jpg'), { mode: 'convert', notes: ['noteJpgBackground'] });
  assert.deepEqual(planConversion({ type: 'gif', animated: true }, 'png'), { mode: 'convert', notes: ['noteFirstFrame'] });
  assert.deepEqual(planConversion({ type: 'svg' }, 'webp'), { mode: 'convert', notes: ['noteSvgRaster'] });
  assert.deepEqual(planConversion({ type: 'avif' }, 'jpg'), { mode: 'convert', notes: ['noteJpgBackground'] });
});

test('errors: unknown source, bad target, huge header size', () => {
  assert.equal(planConversion({ type: null }, 'png').error, 'not-image');
  assert.equal(planConversion({ type: 'png' }, /** @type {any} */ ('gif')).error, 'bad-format');
  assert.equal(planConversion({ type: 'webp', size: { width: 40000, height: 10 } }, 'png').error, 'too-large');
  assert.equal(planConversion({ type: 'png', size: { width: 12000, height: 12000 } }, 'jpg').error, 'too-large');
  assert.equal(planConversion({ type: 'png', size: { width: 8000, height: 8000 } }, 'jpg').mode, 'convert');
});

test('only user-relevant notes become a toast', () => {
  assert.deepEqual(visibleNotes(['noteSameFormat', 'noteJpgBackground', 'noteFirstFrame', 'noteSvgRaster', 'noteSvgReduced']), ['noteFirstFrame', 'noteSvgReduced']);
});

test('fitsCanvas limits', () => {
  assert.ok(fitsCanvas(1, 1));
  assert.ok(fitsCanvas(10000, 10000));
  assert.ok(!fitsCanvas(0, 10));
  assert.ok(!fitsCanvas(LIMITS.side + 1, 1));
  assert.ok(!fitsCanvas(20000, 20000));
});

test('svgOutputSize scales and shrinks to fit', () => {
  assert.deepEqual(svgOutputSize({ width: 120, height: 80 }, 2), { width: 240, height: 160, reduced: false });
  assert.deepEqual(svgOutputSize({ width: 120.4, height: 80.6 }, 1), { width: 120, height: 81, reduced: false });
  const big = svgOutputSize({ width: 30000, height: 10000 }, 2);
  assert.ok(big.reduced && fitsCanvas(big.width, big.height));
  assert.ok(Math.abs(big.width / big.height - 3) < 0.01);
  assert.deepEqual(svgOutputSize({ width: 0, height: 0 }, 2), { width: 2, height: 2, reduced: false });
});

test('encoderQuality clamps', () => {
  assert.equal(encoderQuality(92), 0.92);
  assert.equal(encoderQuality(150), 1);
  assert.equal(encoderQuality(0), 0.01);
  assert.equal(encoderQuality(NaN), 0.92);
});

test('FORMATS table', () => {
  assert.deepEqual(Object.keys(FORMATS), ['png', 'jpg', 'webp', 'avif']);
  assert.equal(FORMATS.jpg.mime, 'image/jpeg');
  assert.equal(FORMATS.jpg.alpha, false);
  assert.ok(isFormat('webp') && !isFormat('toString') && !isFormat('gif'));
});
