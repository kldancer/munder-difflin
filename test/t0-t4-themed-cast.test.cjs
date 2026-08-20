'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const cast = loadTs('src/renderer/src/scene/office/themedCast.ts');
const art = loadTs('src/renderer/src/scene/office/themeCharacterArt.ts');

const ids = ['michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'];
const themes = ['office', 'starship', 'starfield-farm'];

test('T0-T4 themed cast has exactly 15 stable appearance ids per theme', () => {
  for (const theme of themes) {
    const recipes = cast.THEME_CHARACTER_RECIPES[theme];
    assert.deepEqual(Object.keys(recipes).sort(), [...ids].sort());
    for (const id of ids) {
      assert.equal(recipes[id].id, id);
      assert.equal(recipes[id].anchors.head, `${id}:head`);
      assert.equal(recipes[id].anchors.face, `${id}:face`);
    }
  }
});

test('theme art obeys 18x28 portrait and 18x32 scene contracts', () => {
  for (const theme of themes) for (const id of ids) {
    assert.equal(art.themedPortraitBuf(id, theme).length, 18 * 28 * 4);
    const frames = art.themedSceneFrameBufs(id, theme);
    assert.equal(frames.front.length, 7);
    assert.equal(frames.back.length, 7);
    for (const frame of [...frames.front, ...frames.back]) assert.equal(frame.length, 18 * 32 * 4);
  }
});

test('all seven frame slots are stable and type/read differ from stand', () => {
  for (const theme of themes) for (const id of ids) {
    const frames = art.themedSceneFrameBufs(id, theme);
    for (const side of ['front', 'back']) {
      assert.equal(frames[side].length, 7);
      assert.notDeepEqual(frames[side][3], frames[side][0]);
      assert.notDeepEqual(frames[side][4], frames[side][3]);
      assert.notDeepEqual(frames[side][5], frames[side][0]);
      assert.notDeepEqual(frames[side][6], frames[side][5]);
    }
  }
});

test('office fallback and themes retain the same identity anchors', () => {
  for (const id of ids) {
    const office = cast.getCharacterThemeRecipe('office', id);
    for (const theme of themes) {
      const themed = cast.getCharacterThemeRecipe(theme, id);
      assert.deepEqual(themed.anchors, office.anchors);
      assert.equal(themed.id, id);
    }
  }
});

test('theme projection is visual-only and does not expose role or business state', () => {
  for (const theme of themes) for (const id of ids) {
    const recipe = cast.getCharacterThemeRecipe(theme, id);
    assert.equal(Object.prototype.hasOwnProperty.call(recipe, 'role'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recipe, 'status'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recipe, 'provider'), false);
  }
});

test('high-fidelity theme overlays add deterministic head and garment anchors', () => {
  for (const id of ids) {
    const office = art.themedPortraitBuf(id, 'office');
    const starship = art.themedPortraitBuf(id, 'starship');
    const farm = art.themedPortraitBuf(id, 'starfield-farm');
    assert.notDeepEqual(starship, office);
    assert.notDeepEqual(farm, office);
    assert.notDeepEqual(starship, farm);
    // Theme-specific pixels are in the fixed 18x28 buffer and cannot alter its contract.
    assert.equal(starship.length, 18 * 28 * 4);
    assert.equal(farm.length, 18 * 28 * 4);
  }
});
