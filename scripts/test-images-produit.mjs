// Produit de marque avec images : aucun fichier du téléphone ne doit partir dans Firestore, et un envoi raté est signalé en français.
// Lancer : node scripts/test-images-produit.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => {
  const start = html.indexOf(`async function ${name}(`);
  assert.ok(start > -1, `${name} introuvable dans index.html`);
  return html.slice(start, html.indexOf('\n}', start) + 2);
};

const sets = [];
const ctx = {
  BRAND_FILE_MAX: 20 * 1024 * 1024, DEMO_MODE: false,
  cleanSizeMeta: im => (im.widthCm ? { widthCm: im.widthCm } : {}),
  withTimeout: p => p,
  storageRef: {},
  uploadImageFile: async file => { if (file.fail) throw new Error('storage/unauthorized'); return 'https://firebasestorage.example/' + file.name; },
  db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: async data => { sets.push(data); } }) }) }) }) },
};
vm.createContext(ctx);
vm.runInContext(fn('saveProductImages') + '\n' + fn('saveProductDoc'), ctx);
const run = code => vm.runInContext(code, ctx);

// 1. Image envoyée : remplacée par son adresse en ligne, plus de fichier.
ctx.imgs = [{ name: 'a.png', file: { name: 'a.png', size: 1e6 }, url: 'blob:x', widthCm: 30 }];
assert.equal(await run(`saveProductImages('b', 'p', imgs)`), '');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.imgs[0])), { name: 'a.png', url: 'https://firebasestorage.example/a.png', path: ctx.imgs[0].path, widthCm: 30 });

// 2. Envoi refusé (fichier de plus de 20 Mo) : on rend le nom et la raison, l'image garde son fichier pour réessayer.
ctx.imgs = [{ name: 'gros.png', file: { name: 'gros.png', size: 21e6, fail: true }, url: 'blob:y' }];
assert.equal(await run(`saveProductImages('b', 'p', imgs)`), 'gros.png (plus de 20 Mo)');
assert.ok(ctx.imgs[0].file);

// 3. Le cas signalé le 11/11 : un produit dont une image n'est pas envoyée n'est jamais écrit dans la base.
const r = await run(`saveProductDoc('b', { id: 'p', nom: 'T', images: imgs })`);
assert.equal(r.ok, false);
assert.match(r.error, /gros\.png/);
assert.equal(sets.length, 0);

// 4. Sans image, ou avec des images en ligne : écrit normalement.
assert.equal((await run(`saveProductDoc('b', { id: 'p', nom: 'T', images: [] })`)).ok, true);
assert.equal((await run(`saveProductDoc('b', { id: 'p', nom: 'T', images: [{ name: 'a', url: 'https://x/a' }] })`)).ok, true);
assert.equal(sets.length, 2);

console.log('test-images-produit : OK');
