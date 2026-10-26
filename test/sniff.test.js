import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffType, typeFromMime, isAnimated, headerSize, gifFrameCount, describe } from '../extension/lib/sniff.js';
import { png, gif, jpegHeader, webpHeader, ftyp } from './helpers/images.js';

const u8 = (b) => new Uint8Array(b);
const red = () => [255, 0, 0, 255];
const pal = [[255, 0, 0], [0, 0, 255]];

test('sniffType recognises common formats by magic bytes', () => {
  assert.equal(sniffType(u8(png(2, 2, red))), 'png');
  assert.equal(sniffType(u8(jpegHeader(10, 10))), 'jpeg');
  assert.equal(sniffType(u8(gif(2, 2, pal, [() => 0]))), 'gif');
  assert.equal(sniffType(u8(webpHeader('VP8 ', 4, 4))), 'webp');
  assert.equal(sniffType(u8(ftyp('avif', 'mif1', 'miaf'))), 'avif');
  assert.equal(sniffType(u8(ftyp('mif1', 'avif'))), 'avif');
  assert.equal(sniffType(u8(ftyp('heic', 'mif1'))), 'heic');
  assert.equal(sniffType(u8(Buffer.from([0, 0, 1, 0, 1, 0]))), 'ico');
  assert.equal(sniffType(u8(Buffer.from('II*\0abcd'))), 'tiff');
});

test('sniffType detects SVG with prolog, BOM, comments and doctype', () => {
  for (const s of [
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '﻿<?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg>',
    '  <SVG viewBox="0 0 1 1">',
  ]) assert.equal(sniffType(u8(Buffer.from(s))), 'svg', s);
  assert.equal(sniffType(u8(Buffer.from('<!doctype html><html><body>404'))), null);
  assert.equal(sniffType(u8(Buffer.from('<svgx>'))), null);
});

test('sniffType: garbage and tiny inputs', () => {
  assert.equal(sniffType(u8([])), null);
  assert.equal(sniffType(u8([1, 2, 3])), null);
  assert.equal(sniffType(u8(Buffer.from('{"error":"not found"}'))), null);
  assert.equal(sniffType(/** @type {any} */ (null)), null);
});

test('typeFromMime handles aliases and parameters', () => {
  assert.equal(typeFromMime('image/webp'), 'webp');
  assert.equal(typeFromMime('IMAGE/JPG'), 'jpeg');
  assert.equal(typeFromMime('image/pjpeg'), 'jpeg');
  assert.equal(typeFromMime('image/svg+xml; charset=utf-8'), 'svg');
  assert.equal(typeFromMime('image/vnd.microsoft.icon'), 'ico');
  assert.equal(typeFromMime('text/html'), null);
  assert.equal(typeFromMime(undefined), null);
});

test('GIF frames: static vs animated, extensions and sub-blocks are skipped', () => {
  const one = u8(gif(5, 3, pal, [() => 1]));
  const two = u8(gif(5, 3, pal, [() => 0, (x) => x & 1]));
  assert.equal(gifFrameCount(one), 1);
  assert.equal(gifFrameCount(two), 2);
  assert.equal(isAnimated(one), false);
  assert.equal(isAnimated(two), true);
  // 400 px frames → several sub-blocks and CLEAR codes inside the image data
  assert.equal(gifFrameCount(u8(gif(20, 20, pal, [() => 0, () => 1, () => 0])), 10), 3);
  assert.equal(gifFrameCount(u8(Buffer.from('GIF89a'))), 0);
});

test('animation flags of APNG, WebP and AVIF sequences', () => {
  assert.equal(isAnimated(u8(png(2, 2, red, { apng: true }))), true);
  assert.equal(isAnimated(u8(png(2, 2, red))), false);
  assert.equal(isAnimated(u8(webpHeader('VP8X', 10, 10, { animated: true }))), true);
  assert.equal(isAnimated(u8(webpHeader('VP8X', 10, 10))), false);
  assert.equal(isAnimated(u8(ftyp('avis', 'avif'))), true);
  assert.equal(isAnimated(u8(ftyp('avif', 'mif1'))), false);
  assert.equal(isAnimated(u8(jpegHeader(1, 1))), false);
});

test('headerSize reads dimensions without decoding', () => {
  assert.deepEqual(headerSize(u8(png(7, 3, red))), { width: 7, height: 3 });
  assert.deepEqual(headerSize(u8(gif(9, 4, pal, [() => 0]))), { width: 9, height: 4 });
  assert.deepEqual(headerSize(u8(jpegHeader(1920, 1080))), { width: 1920, height: 1080 });
  assert.deepEqual(headerSize(u8(webpHeader('VP8 ', 640, 480))), { width: 640, height: 480 });
  assert.deepEqual(headerSize(u8(webpHeader('VP8L', 300, 200))), { width: 300, height: 200 });
  assert.deepEqual(headerSize(u8(webpHeader('VP8X', 16000, 9000))), { width: 16000, height: 9000 });
  assert.equal(headerSize(u8(ftyp('avif'))), null);
  assert.equal(headerSize(u8(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))), null);
});

test('describe: type, mime, extension; falls back to Content-Type for unknown bytes', () => {
  assert.deepEqual(describe(u8(gif(2, 2, pal, [() => 0, () => 1]))), { type: 'gif', mime: 'image/gif', ext: 'gif', animated: true, size: { width: 2, height: 2 } });
  assert.equal(describe(u8(jpegHeader(3, 3)), 'image/png').type, 'jpeg', 'bytes win over the header');
  assert.equal(describe(u8(Buffer.from('xxxx')), 'image/bmp').ext, 'bmp');
  assert.deepEqual(describe(u8(Buffer.from('<html>')), 'text/html'), { type: null, mime: 'text/html', ext: 'bin', animated: false, size: null });
});
