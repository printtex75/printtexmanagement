// Exemples vérifiés à la main pour devis-calcul.js : node scripts/test-devis-calcul.mjs
// Grilles copiées du site au 21/10/2026 (TTC en centimes, prix publics). Coûts FICTIFS (les vrais restent hors de ce dépôt public).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../devis-calcul.js');

const base = {
  paliers: [1, 2, 6, 51, 101], paliers_libelles: ['1 pièce', '2 à 5', '6 à 50', '51 à 100', '101 à 200'], palier_max: 200,
  produits: {
    't-shirt-basic-noir': { libelle: 'T-shirt Basic 180 g', max_marquages: 2, teinte_fixe: null, grilles: {
      blanc: { 1: [2000, 1400, 1300, 1200, 1080], 2: [3000, 2000, 1600, 1500, 1380] },
      couleur: { 1: [2500, 1900, 1800, 1600, 1500], 2: [3500, 2400, 2250, 2150, 2000] } } },
    'polo-premium': { libelle: 'Polo premium', max_marquages: 2, teinte_fixe: 'couleur', grilles: {
      couleur: { 1: [3500, 3000, 2600, 2400, 2400], 2: [4200, 3600, 3000, 2700, 2700] } } },
  },
  couts: { consommables_par_marquage: 1, main_oeuvre_par_piece: 1, textile: { 't-shirt-basic-noir': { blanc: 3, couleur: 3.5 } } },
  frais: { logo_refait_ht: 500, logo_offert_des_pieces: 5, print_textile_fourni_ttc: 500, cout_print_textile_fourni: null, urgence_pct: null,
    livraison: { retrait: { libelle: 'Retrait', ttc: 0 }, colissimo: { libelle: 'Colissimo', ttc: 499, offert_des_ttc: 10000 }, express: { libelle: 'Express', ttc: 1800 } } },
  historique: [],
};
const tshirt = (teinte, marquages, tailles, ajustement = { mode: 'aucun' }) => ({ type: 'grille', produit: 't-shirt-basic-noir', teinte, marquages, couleurs: [{ nom: 'Noir', tailles }], ajustement });
const niveaux = (r, n) => r.alertes.filter((a) => a.niveau === n).map((a) => a.texte);

// 1. 10 t-shirts couleur, 1 emplacement, retrait.
//    Palier 6-50 : 18,00 TTC → 15,00 HT ; BAT 25,00 TTC → 20,83 HT. 20,83 + 9 × 15,00 = 155,83 HT ; TVA 31,17 ; TTC 187,00.
//    Coût : (3,50 + 1,00 + 1,00) × 10 = 55,00 → marge 100,83 HT.
let r = C.calculer(base, { lignes: [tshirt('couleur', 1, { M: 5, L: 5 })], livraison: 'retrait' });
assert.equal(r.totalHT, 15583); assert.equal(r.tva, 3117); assert.equal(r.totalTTC, 18700);
assert.equal(r.coutTotal, 5500); assert.equal(r.marge, 10083);

// 2. 120 t-shirts blancs, 2 emplacements, remise commerciale 10 %, Colissimo (offert : plus de 100 € TTC).
//    Palier 101-200 : 13,80 TTC → 11,50 HT, −10 % → 10,35 HT ; BAT 30,00 TTC → 25,00 HT.
//    25,00 + 119 × 10,35 = 1 256,65 HT ; TVA 251,33 ; TTC 1 507,98. Coût (3,00 + 2,00 + 1,00) × 120 = 720,00.
r = C.calculer(base, { lignes: [tshirt('blanc', 2, { S: 40, M: 40, L: 40 }, { mode: 'remise', valeur: 10, motif: 'client fidèle' })], livraison: 'colissimo' });
assert.equal(r.totalHT, 125665); assert.equal(r.tva, 25133); assert.equal(r.totalTTC, 150798);
assert.equal(r.client.at(-1).pu, 0); assert.equal(r.coutTotal, 72000);
assert.equal(r.lignes[0].grillePalier, 1150); assert.equal(r.lignes[0].pu, 1035);

// 3. Coût manquant : 4 polos, 2 emplacements, express. Palier 2-5 : 36,00 TTC → 30,00 HT ; BAT 42,00 → 35,00 HT.
//    35,00 + 3 × 30,00 = 125,00 + express 18,00 TTC (15,00 HT) = 140,00 HT ; TVA 28,00 ; TTC 168,00. Marge non calculable, devis non bloqué.
r = C.calculer(base, { lignes: [{ type: 'grille', produit: 'polo-premium', marquages: 2, couleurs: [{ nom: 'Marine', tailles: { M: 2, L: 2 } }], ajustement: { mode: 'aucun' } }], livraison: 'express' });
assert.equal(r.totalHT, 14000); assert.equal(r.totalTTC, 16800);
assert.equal(r.marge, null); assert.equal(r.coutConnu, false);
assert.ok(niveaux(r, 'attention').some((t) => t.includes('coût d\'achat inconnu')));
assert.equal(niveaux(r, 'bloquant').length, 0);

// 4. Textile apporté : 15 pièces × 2 emplacements à 5 € TTC (8,33 HT par pièce) ; logo refait offert (5 pièces et plus) ;
//    urgence sans supplément validé → simple alerte ; remise globale 20 € TTC (−16,67 HT).
//    15 × 8,33 = 124,95 − 16,67 = 108,28 HT ; TVA 21,66 ; TTC 129,94.
r = C.calculer(base, { lignes: [{ type: 'textile_fourni', designation: 'Gilets', emplacements: 2, quantite: 15, ajustement: { mode: 'aucun' } }],
  logoARefaire: 1, urgent: true, codePromo: { montant_ttc: 20, code: 'ASSO', motif: 'association du quartier' }, livraison: 'retrait' });
assert.equal(r.totalHT, 10828); assert.equal(r.tva, 2166); assert.equal(r.totalTTC, 12994);
assert.ok(r.client.some((l) => l.desc === 'Logo refait proprement' && l.pu === 0));
assert.ok(niveaux(r, 'attention').some((t) => t.startsWith('Urgence demandée')));

// 5. Logo refait payant sous 5 pièces : 3 t-shirts couleur 1 emplacement + 1 logo à 5,00 HT.
//    Palier 2-5 : 19,00 TTC → 15,83 HT ; BAT 20,83. 20,83 + 2 × 15,83 + 5,00 = 57,49 HT.
r = C.calculer(base, { lignes: [tshirt('couleur', 1, { M: 3 })], logoARefaire: 1, livraison: 'retrait' });
assert.equal(r.totalHT, 5749);

// 6. Prix imposé 15 € TTC sur 250 t-shirts couleur : 12,50 HT par pièce, alerte au-delà de 200 pièces.
//    20,83 + 249 × 12,50 = 3 133,33 HT. Coût 5,50 × 250 = 1 375,00.
r = C.calculer(base, { lignes: [tshirt('couleur', 1, { L: 250 }, { mode: 'prix', valeur: 15, motif: 'tarif négocié' })], livraison: 'retrait' });
assert.equal(r.totalHT, 313333); assert.equal(r.coutTotal, 137500);
assert.ok(niveaux(r, 'attention').some((t) => t.includes('au-delà de 200')));

// 7. Prix sous le coût : prix imposé 5 € TTC (4,17 HT) < coût 5,50 HT → alerte, jamais de blocage.
r = C.calculer(base, { lignes: [tshirt('couleur', 1, { M: 10 }, { mode: 'prix', valeur: 5, motif: 'test' })], livraison: 'retrait' });
assert.ok(niveaux(r, 'attention').some((t) => t.includes('inférieur au coût')));

// 8. Séparation interne / client : aucune ligne du devis client ne parle de coût, de marge ni de justification.
r = C.calculer(base, { lignes: [tshirt('couleur', 1, { M: 10 }, { mode: 'remise', valeur: 5, motif: 'SECRET-MOTIF' })], livraison: 'retrait' });
const texteClient = JSON.stringify(r.client);
assert.ok(!/co[uû]t|marge|SECRET-MOTIF/i.test(texteClient));

// 9. Le textile payé sur facture remplace l'estimation : polo à 5,00 HT → coût (5,00 + 2 × 1,00 + 1,00) = 8,00 HT par pièce.
base.couts.textile_reel = { 'polo-premium': { ht: 5, source: 'test' } };
r = C.calculer(base, { lignes: [{ type: 'grille', produit: 'polo-premium', marquages: 2, couleurs: [{ nom: 'Marine', tailles: { M: 4 } }], ajustement: { mode: 'aucun' } }], livraison: 'retrait' });
assert.equal(r.lignes[0].coutPiece, 800); assert.equal(r.lignes[0].textileReel, true); assert.equal(r.coutTotal, 3200);

console.log('9 exemples OK');
