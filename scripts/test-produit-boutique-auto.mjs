// Commande de boutique avec un article pas encore relié (cas SPACE OF ZOU, 12/11) :
// le produit est créé et relié au lieu d'être ignoré, sauf s'il a été laissé décoché par la marque.
// Lancer : node scripts/test-produit-boutique-auto.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => {
  const start = html.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start > -1, `${name} introuvable dans index.html`);
  return html.slice(start, html.indexOf('\n}', start) + 2);
};

const savedProducts = [], savedTasks = [], acks = [];
const ctx = {
  ORDERS: [],
  shopifyCall: async (path, opts) => path.startsWith('/storeorders/ack') ? (acks.push(opts.body.refs), { ok: true }) : { orders: ctx.ORDERS },
  saveProductDoc: async (bid, p) => (savedProducts.push(p), { ok: true }),
  saveTaskDoc: async (bid, t) => (savedTasks.push(t), true),
  saveBrandDoc: async () => {}, publishStore: async () => {},
};
vm.createContext(ctx);
const oneLine = name => html.slice(html.indexOf(`function ${name}(`)).split('\n')[0];
vm.runInContext([oneLine('storeKey'), ...['parseVariantTitle', 'countFaces', 'importStoreOrders'].map(fn)].join('\n'), ctx);

ctx.b = { id: 'zou', storeConnected: true, storeMap: { 'T-SHIRT EDIE BRITT': 'p1' }, storeSkip: ['MUG ZOU'] };
ctx.tasks = [];
ctx.products = [{ id: 'p1', nom: 'T-shirt Edie Britt', blank: 'AWDIS180', images: [] }];
ctx.ORDERS = [{ ref: '#ZOU6799', date: '2026-11-12T12:49:36Z', lines: [
  { title: 'T-SHIRT EDIE BRITT', variant: 'M', quantity: 1, options: '' },
  { title: 'T-SHIRT SADE', variant: 'S / Blanc / Unisexe', quantity: 1, options: '' },
  { title: 'MUG ZOU', variant: '', quantity: 1, options: '' },
] }];

const n = await vm.runInContext('importStoreOrders(b, tasks, products)', ctx);
assert.equal(n, 2, 'Edie Britt + Sade, pas le mug écarté');
assert.equal(savedProducts.length, 1);
assert.equal(savedProducts[0].nom, 'T-SHIRT SADE');
assert.equal(ctx.b.storeMap['T-SHIRT SADE'], savedProducts[0].id, 'le nouveau produit est relié');
const sade = savedTasks.find(t => t.nom === 'T-SHIRT SADE');
assert.equal(sade.taille, 'S');
assert.match(sade.remarque, /à compléter/);
assert.equal(JSON.stringify(acks), '[["#ZOU6799"]]');

// Deuxième commande du même produit : pas de second produit créé.
ctx.ORDERS = [{ ref: '#ZOU6800', lines: [{ title: 'T-SHIRT SADE', variant: 'M', quantity: 2, options: '' }] }];
assert.equal(await vm.runInContext('importStoreOrders(b, tasks, products)', ctx), 1);
assert.equal(savedProducts.length, 1);

console.log('test-produit-boutique-auto : OK');
