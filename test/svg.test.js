import { test } from 'node:test';
import assert from 'node:assert/strict';
import { svgSize, parseLength } from '../extension/lib/svg.js';

test('parseLength: units, unitless, rejects percentages', () => {
  assert.equal(parseLength('120'), 120);
  assert.equal(parseLength(' 64px '), 64);
  assert.equal(parseLength('1in'), 96);
  assert.equal(parseLength('72pt'), 96);
  assert.ok(Math.abs(/** @type {number} */ (parseLength('2.54cm')) - 96) < 1e-9);
  assert.equal(parseLength('100%'), null);
  assert.equal(parseLength('auto'), null);
  assert.equal(parseLength('0'), null);
  assert.equal(parseLength(null), null);
});

test('svgSize: width/height win', () => {
  assert.deepEqual(svgSize('<svg width="200" height="100" viewBox="0 0 20 10">'), { width: 200, height: 100, fromViewBox: false });
});

test('svgSize: viewBox only, or one dimension + viewBox ratio', () => {
  assert.deepEqual(svgSize("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 80'>"), { width: 120, height: 80, fromViewBox: true });
  assert.deepEqual(svgSize('<svg width="60" viewBox="0,0,120,80">'), { width: 60, height: 40, fromViewBox: true });
  assert.deepEqual(svgSize('<svg height="40" viewBox="0 0 120 80">'), { width: 60, height: 40, fromViewBox: true });
  assert.deepEqual(svgSize('<svg width="100%" height="100%" viewBox="0 0 24 24">'), { width: 24, height: 24, fromViewBox: true });
});

test('svgSize: nothing usable → 300×150 like the browser', () => {
  assert.deepEqual(svgSize('<svg>'), { width: 300, height: 150, fromViewBox: false });
  assert.deepEqual(svgSize('<svg viewBox="0 0 0 10">'), { width: 300, height: 150, fromViewBox: false });
  assert.deepEqual(svgSize(''), { width: 300, height: 150, fromViewBox: false });
  assert.deepEqual(svgSize('<svg width="50">'), { width: 50, height: 150, fromViewBox: false });
});

test('svgSize looks only at the root tag', () => {
  assert.deepEqual(svgSize('<?xml version="1.0"?><svg viewBox="0 0 10 20"><rect width="999" height="999"/></svg>'), { width: 10, height: 20, fromViewBox: true });
});
