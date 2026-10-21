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

// 10. Quantités additionnées : 20 t-shirts couleur 1 face + 40 polos 2 faces = 60 pièces → palier 51-100 pour les deux.
//     T-shirt : 16,00 TTC → 13,33 HT ; 20,83 + 19 × 13,33 = 274,10. Polo : 27,00 TTC → 22,50 HT ; BAT 35,00 ; 35,00 + 39 × 22,50 = 912,50.
//     Total 1 186,60 HT. Sans addition : t-shirt au palier 6-50 (15,00) et polo au palier 6-50 (25,00 HT).
base.couts.textile_reel = {};
const deux = (cumul) => C.calculer(base, { cumulerPaliers: cumul, livraison: 'retrait', lignes: [tshirt('couleur', 1, { M: 20 }),
  { type: 'grille', produit: 'polo-premium', marquages: 2, couleurs: [{ nom: 'Marine', tailles: { L: 40 } }], ajustement: { mode: 'aucun' } }] });
r = deux(true);
assert.equal(r.lignes[0].pu, 1333); assert.equal(r.lignes[1].pu, 2250); assert.equal(r.totalHT, 118660);
assert.ok(r.client.some((l) => /quantités additionnées/.test(l.detail)));
r = deux(false);
assert.equal(r.lignes[0].pu, 1500); assert.equal(r.lignes[1].pu, 2500);

// 11. Palier accordé à la main : 20 t-shirts au tarif 51-100 → 274,10 HT, marqué « tarif préférentiel », info interne.
r = C.calculer(base, { livraison: 'retrait', lignes: [{ ...tshirt('couleur', 1, { M: 20 }), palier: 3 }] });
assert.equal(r.totalHT, 27410); assert.equal(r.lignes[0].kNormal, 2); assert.equal(r.lignes[0].k, 3);
assert.ok(r.client.some((l) => /Tarif préférentiel 51 à 100/.test(l.detail)));
assert.ok(niveaux(r, 'info').some((t) => t.includes('normalement 6 à 50')));

// 12. Manches et étiquette : 20 t-shirts couleur, 1 face + 2 manches + étiquette, palier 6-50.
//     Supplément 2,00 TTC × 3 → pièce 18,00 + 6,00 = 24,00 TTC = 20,00 HT ; 1re pièce 25,00 + 3 × 3,00 = 34,00 TTC = 28,33 HT.
//     28,33 + 19 × 20,00 = 408,33 HT. Coût : 4 marquages en tout → 3,50 + 4 × 1,00 + 1,00 = 8,50 HT par pièce.
base.frais.supplements = { manche: [300, 250, 200, 180, 150], etiquette: [300, 250, 200, 180, 150] };
r = C.calculer(base, { livraison: 'retrait', lignes: [{ ...tshirt('couleur', 1, { M: 20 }), manches: 2, etiquette: true }] });
assert.equal(r.lignes[0].bat, 2833); assert.equal(r.lignes[0].pu, 2000); assert.equal(r.totalHT, 40833);
assert.equal(r.lignes[0].coutPiece, 850);
assert.ok(r.client[0].detail.includes('2 manches + étiquette'));

// 13. Prix d'amis demandé sur un produit sans prix partenaire : on reste au prix normal.
base.frais.supplements = { manche: [300, 250, 200, 180, 150], etiquette: [250, 200, 160, 140, 120] };
//     Produit sans prix partenaire : prix normal (BAT 35,00 TTC = 29,17 HT, puis 22,50 TTC = 18,75 HT) : 29,17 + 5 × 18,75 = 122,92 HT.
r = C.calculer(base, { modeMarque: true, livraison: 'retrait', lignes: [tshirt('couleur', 2, { M: 6 })] });
assert.equal(r.totalHT, 12292);

// 14. Prix marque donné par Karim : 18 € TTC (15,00 HT) + 1 étiquette au plus petit prix (1,20 TTC) → 19,20 TTC = 16,00 HT ; 6 × 16,00 = 96,00 HT.
base.tarifs_marque = { 't-shirt-basic-noir': 1800 };
r = C.calculer(base, { modeMarque: true, livraison: 'retrait', lignes: [{ ...tshirt('couleur', 1, { M: 6 }), etiquette: true }] });
assert.equal(r.totalHT, 9600); assert.ok(!niveaux(r, 'info').some((t) => t.includes('provisoire')));

// 15. Prix marque par nombre de faces : 1 face 18 €, 2 faces 22 € TTC → 4 pièces face + dos = 4 × 18,33 HT = 73,32 HT (pas de « dos offert »).
base.tarifs_marque = { 't-shirt-basic-noir': { 1: 1800, 2: 2200 } };
r = C.calculer(base, { modeMarque: true, livraison: 'retrait', lignes: [tshirt('couleur', 2, { M: 4 })] });
assert.equal(r.lignes[0].pu, 1833); assert.equal(r.totalHT, 7332); assert.ok(!r.client[0].detail.includes('dos offert'));

// 16. Prix partenaire par teinte, faces et palier : Basic couleur face + dos, 60 pièces → palier 51-100 : 14,50 TTC (12,08 HT) dès la 1re pièce.
//     60 × 12,08 = 724,80 HT ; pas de « dos offert » (16 € contre 14 € en 1 face).
base.tarifs_marque = { 't-shirt-basic-noir': { blanc: { 1: [1200, 1200, 1200, 1050, 950], 2: [1400, 1400, 1400, 1250, 1150] },
  couleur: { 1: [1400, 1400, 1400, 1250, 1150], 2: [1600, 1600, 1600, 1450, 1350] } } };
r = C.calculer(base, { modeMarque: true, livraison: 'retrait', lignes: [tshirt('couleur', 2, { M: 30, L: 30 })] });
assert.equal(r.lignes[0].pu, 1208); assert.equal(r.totalHT, 72480); assert.ok(!r.client[0].detail.includes('dos offert'));
// Blanc 1 face, 10 pièces → 12 € (10,00 HT) : 100,00 HT.
r = C.calculer(base, { modeMarque: true, livraison: 'retrait', lignes: [tshirt('blanc', 1, { M: 10 })] });
assert.equal(r.totalHT, 10000);

// 17. Coût d'impression par taille : t-shirt couleur face + 2 manches → 3,50 + 1,20 + 2 × 0,15 + 1,00 = 6,00 HT.
base.couts.impression = { petit: 0.15, moyen: 0.75, grand: 1.2 }; base.couts.format_face = {};
base.tarifs_marque = {};
r = C.calculer(base, { livraison: 'retrait', lignes: [{ ...tshirt('couleur', 1, { M: 10 }), manches: 2 }] });
assert.equal(r.lignes[0].coutPiece, 600);
delete base.couts.impression; delete base.couts.format_face;

// 18. Impression seule (textile du client), grille TTC, 1re pièce = BAT.
base.frais.impression_seule = { paliers: [1, 2, 26, 51, 101], libelles: ['1', '2 à 25', '26 à 50', '51 à 100', '101 à 200'],
  grilles: { 'dtg-fonce': { normal: { 1: [1500, 780, 720, 660, 600], 2: [2000, 1020, 980, 940, 900] }, charge: { 1: [1500, 960, 900, 840, 780], 2: [2000, 1500, 1460, 1420, 1380] } },
    'dtf': { normal: { 1: [1500, 780, 720, 660, 600], 2: [2000, 1020, 980, 940, 900] }, charge: { 1: [1500, 960, 900, 840, 780], 2: [2000, 1500, 1460, 1420, 1380] } } },
  supplement_emplacement: 200, etiquette: 120 };
base.couts.impression_seule = { matiere: { 'dtg-fonce': 1.97, 'dtf': 2.14 }, supplement_charge: { 'dtg-fonce': 1.47, 'dtf': 1.47 }, main_oeuvre: { 'dtg-fonce': 1.2, 'dtf': 0.9 }, petit: 0.5 };
//     DTG foncé, 1 face + 2 manches + étiquette, 30 pièces : pièce 7,20 + 4,00 + 1,20 = 12,40 TTC (10,33 HT) ; BAT 15 + 5,20 = 20,20 TTC (16,83 HT).
//     16,83 + 29 × 10,33 = 316,40 HT. Coût : 1,97 + 1,20 + 3 × 0,50 = 4,67 HT par pièce.
r = C.calculer(base, { livraison: 'retrait', lignes: [{ type: 'textile_fourni', technique: 'dtg-fonce', faces: 1, manches: 2, etiquette: true, quantite: 30, ajustement: { mode: 'aucun' } }] });
assert.equal(r.lignes[0].bat, 1683); assert.equal(r.lignes[0].pu, 1033); assert.equal(r.totalHT, 31640); assert.equal(r.lignes[0].coutPiece, 467);
//     DTF face + dos, visuels chargés, 120 pièces : 13,80 TTC (11,50 HT) ; BAT 20 TTC (16,67 HT). 16,67 + 119 × 11,50 = 1 385,17 HT.
//     Coût : (2,14 + 1,47) × 2 + 0,90 × 1,5 = 8,57 HT → marge 25 %.
r = C.calculer(base, { livraison: 'retrait', lignes: [{ type: 'textile_fourni', technique: 'dtf', faces: 2, charge: true, quantite: 120, ajustement: { mode: 'aucun' } }] });
assert.equal(r.lignes[0].pu, 1150); assert.equal(r.totalHT, 138517); assert.equal(r.lignes[0].coutPiece, 857);
assert.ok(1 - 857 / 1150 >= 0.25);

// 19. Sans BAT : 10 t-shirts couleur 1 face → 10 × 15,00 HT = 150,00 HT (au lieu de 155,83) ; 1 pièce seule → prix 2-5 (19 TTC, 15,83 HT).
r = C.calculer(base, { sansBat: true, livraison: 'retrait', lignes: [tshirt('couleur', 1, { M: 10 })] });
assert.equal(r.totalHT, 15000); assert.equal(r.client[0].qte, 10);
r = C.calculer(base, { sansBat: true, livraison: 'retrait', lignes: [tshirt('couleur', 1, { M: 1 })] });
assert.equal(r.totalHT, 1583);
//     Impression seule sans BAT, DTG foncé 1 face, 1 pièce → palier 2-25 : 7,80 TTC = 6,50 HT.
r = C.calculer(base, { sansBat: true, livraison: 'retrait', lignes: [{ type: 'textile_fourni', technique: 'dtg-fonce', faces: 1, charge: false, quantite: 1, ajustement: { mode: 'aucun' } }] });
assert.equal(r.totalHT, 650);

// 20. Deux formats étiquette : 10 t-shirts couleur 1 face, palier 6-50 : 18,00 + 2 × 1,60 = 21,20 TTC (17,67 HT) ; BAT 25 + 2 × 2,50 = 30 TTC (25 HT).
//     25,00 + 9 × 17,67 = 184,03 HT.
r = C.calculer(base, { livraison: 'retrait', lignes: [{ ...tshirt('couleur', 1, { M: 10 }), etiquette: 2 }] });
assert.equal(r.totalHT, 18403); assert.ok(r.client[0].detail.includes('2 étiquettes'));

console.log('20 exemples OK');
