// Commandes de boutique où le client choisit Face / Dos dans la variante (cas SPACE OF ZOU, 12/11) :
// l'emplacement ne doit pas finir dans la couleur, et le nombre d'impressions doit être juste.
// Lancer : node scripts/test-emplacement-variante.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} introuvable dans index.html`);
  return html.slice(start, html.indexOf('\n}', start) + 2);
};
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fn('parseVariantTitle') + '\n' + fn('countFaces'), ctx);
const p = vt => JSON.parse(JSON.stringify(vm.runInContext(`parseVariantTitle(${JSON.stringify(vt)})`, ctx)));
const faces = t => vm.runInContext(`countFaces(${JSON.stringify(t)})`, ctx);

assert.deepEqual(p('M / Noir unisexe / Dos'), { taille: 'M', couleur: 'Noir unisexe', emplacement: 'Dos' });
assert.deepEqual(p('XL / Blanc unisexe / Face'), { taille: 'XL', couleur: 'Blanc unisexe', emplacement: 'Face' });
assert.deepEqual(p('S / Noir unisexe / Face + Dos'), { taille: 'S', couleur: 'Noir unisexe', emplacement: 'Face + Dos' });
assert.deepEqual(p("L / À l'avant / Noir"), { taille: 'L', couleur: 'Noir', emplacement: "À l'avant" });
assert.deepEqual(p('Noir / M'), { taille: 'M', couleur: 'Noir', emplacement: '' });
assert.deepEqual(p('M / T-shirt blanc - Rose framboise / Au dos'), { taille: 'M', couleur: 'T-shirt blanc - Rose framboise', emplacement: 'Au dos' });
assert.equal(faces('Face + Dos'), 2);
assert.equal(faces('Dos Emplacement : Devant'), 2);
assert.equal(faces('Noir unisexe'), 0);

console.log('test-emplacement-variante : OK');
