#!/usr/bin/env node
// Prépare la base du calculateur de devis (devis.html) et la range dans Firestore, document adminNotes/tarifsCalculateur
// (lisible par l'admin seulement : les coûts et les ventes passées ne sont jamais dans le code public du site).
// Sources : grille du site (theme/snippets/printtex-perso.liquid via scripts/devis/tarifs.mjs), devis/couts.json,
// règles de devis/memoire-tarifs.json, frais de scripts/devis/creer-devis.mjs, ventes comparables (historique-prix.json).
//
// Usage :
//   node scripts/publier-tarifs-calculateur.mjs <dossier printtex-shopify> <historique-prix.json> [--cle <compte-de-service.json>] [--appliquer]
// Sans --appliquer : affiche le résumé et la taille, n'écrit rien.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSign } from 'node:crypto';

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const iCle = args.indexOf('--cle');
const cheminCle = iCle >= 0 ? args[iCle + 1] : null;
const [R, cheminHisto] = args.filter((a, i) => !a.startsWith('--') && (iCle < 0 || i !== iCle + 1));
if (!R || !cheminHisto) { console.log('Usage : node scripts/publier-tarifs-calculateur.mjs <dossier printtex-shopify> <historique-prix.json> [--cle fichier] [--appliquer]'); process.exit(1); }

const { chargerTarifs, PALIERS, PALIERS_LIBELLES } = await import(pathToFileURL(resolve(R, 'scripts/devis/tarifs.mjs')).href);
const produits = chargerTarifs(resolve(R, 'theme/snippets/printtex-perso.liquid'));
const couts = JSON.parse(readFileSync(resolve(R, 'devis/couts.json'), 'utf8'));
const regles = JSON.parse(readFileSync(resolve(R, 'devis/memoire-tarifs.json'), 'utf8')).regles || [];
const historique = JSON.parse(readFileSync(cheminHisto, 'utf8'));

// Frais déjà appliqués par scripts/devis/creer-devis.mjs (mêmes valeurs, centimes) ; null = aucune règle validée.
const frais = {
  logo_refait_ht: 500, logo_offert_des_pieces: 5,
  print_textile_fourni_ttc: 500, cout_print_textile_fourni: null,
  urgence_pct: null,
  // Manche ou étiquette en plus, TTC par pièce et par marquage, paliers 1 / 2-5 / 6-50 / 51-100 / 101-200 (Karim, 21/10/2026 : « environ 2 € »).
  supplements: { manche: [300, 250, 200, 180, 150], etiquette: [250, 200, 160, 140, 120] }, // étiquette : à partir de 1,20 € (Karim 21/10)
  livraison: {
    retrait: { libelle: "Retrait gratuit à l'atelier – 5 rue Planchat, 75020 Paris", ttc: 0 },
    colissimo: { libelle: 'Livraison Colissimo (2 à 4 jours ouvrés)', ttc: 499, offert_des_ttc: 10000 },
    express: { libelle: 'Livraison express (moins de 24 h)', ttc: 1800 },
  },
};

// Textile payé sur facture fournisseur (HT par pièce), quand l'article correspond sans doute possible : fichier privé
// devis/couts-reels-calculateur.json du dossier printtex-shopify (jamais dans ce dépôt public). Prioritaire sur couts.json.
const cheminReels = resolve(R, 'devis/couts-reels-calculateur.json');
const textile_reel = existsSync(cheminReels) ? JSON.parse(readFileSync(cheminReels, 'utf8')).textile_reel || {} : {};

const base = {
  version: 1, genere_le: new Date().toISOString(),
  paliers: PALIERS, paliers_libelles: PALIERS_LIBELLES, palier_max: 200,
  // Prix « marque, mode gentil » donnés par Karim, TTC par pièce, par produit et par nombre de faces (à compléter avec lui un par un) ;
  // un produit absent, ou un nombre de faces absent, suit la règle provisoire du plus gros palier.
  tarifs_marque: {
    // T-shirt épais 220 g (Karim 21/10) : blanc et couleur sont deux produits de la grille
    't-shirt-epais': { 1: [1800, 1750, 1700, 1650, 1560], 2: [2000, 1950, 1900, 1850, 1800] },
    't-shirt-epais-noir': { 1: [1800, 1770, 1730, 1700, 1600], 2: [2000, 1950, 1900, 1850, 1800] },
    // T-shirt boxy 240 g (Karim 21/10) : baisse à chaque palier
    't-shirt-240-epais': { 1: [1800, 1700, 1600, 1500, 1360], 2: [2000, 1900, 1800, 1700, 1560] },
    // T-shirt 280 g (Karim 21/10)
    't-shirt-280': { 1: [2400, 2300, 2200, 2100, 2000], 2: [2600, 2500, 2400, 2300, 2200] },
    // Hoodie épais boxy 440 g (Karim 21/10)
    'sweat-a-capuche-epais': { 1: [4000, 3500, 3500, 3400, 3200], 2: [4500, 4000, 3900, 3800, 3600] },
    // Sweat col rond épais oversize 440 g (Karim 21/10)
    'sweat-shirt-epais-oversize': { 1: [3500, 3000, 3000, 2900, 2700], 2: [4000, 3500, 3500, 3400, 3100] },
    // Zip hoodie épais (Karim 21/10)
    'zip-hoodie-epais': { 1: [5000, 4500, 4300, 4100, 3900], 2: [5000, 4700, 4500, 4300, 4200] },
    // Hoodie 280 g (Karim 21/10) : nettement sous le hoodie épais 440 g
    'hoodie-280': { 1: [3000, 2700, 2600, 2500, 2300], 2: [3400, 3100, 3000, 2900, 2700] },
    // Sweat col rond 280 g et zip hoodie 280 g (Karim 21/10) : grosses quantités à 30 % puis 25 % de marge
    'sweat-col-rond-280': { 1: [2600, 2400, 2200, 1850, 1550], 2: [3000, 2800, 2500, 2100, 1750] },
    'zip-hoodie-280': { 1: [3500, 3200, 3000, 2600, 2400], 2: [3900, 3600, 3300, 2800, 2600] },
    // Manches longues (Karim 21/10) : l'épais = le boxy + 2 € jusqu'à 50 pièces
    'longsleeve-206': { 1: [2000, 1800, 1800, 1530, 1420], 2: [2200, 2000, 2000, 1730, 1620] },
    'longsleeve-epais': { 1: [2200, 2000, 2000, 1780, 1700], 2: [2400, 2200, 2200, 1980, 1860] }, // 2 derniers paliers ajustés avec Karim
    // Tote bags : pas de réduction, le tarif partenaire = le prix normal du site (Karim 21/10)
    'tote-bag-promo': { 1: [1000, 450, 400, 350, 300], 2: [1500, 650, 550, 450, 400] },
    'tote-bag-promo-noir': { 1: [1500, 650, 550, 450, 400], 2: [1750, 850, 750, 650, 550] },
    // T-shirt Basic 180 g (Karim 21/10), paliers 1 / 2-5 / 6-50 / 51-100 / 101-200
    't-shirt-basic-noir': {
      blanc: { 1: [1200, 1150, 1100, 1050, 950], 2: [1400, 1350, 1300, 1250, 1150] },
      couleur: { 1: [1400, 1350, 1300, 1250, 1150], 2: [1600, 1550, 1500, 1450, 1350] },
    },
  },
  produits, couts: { ...couts, textile_reel,
    // Coût matière d'une impression DTF Brother, HT (Karim 21/10, facture Buisine 272946) : encre blanche 0,24 €/ml,
    // couleurs 0,27 €/ml, feuille 35 x 40 cm 0,55 €, colle 5,50 €/kg ; visuel rempli à moitié, + 30 % de purges.
    // petit 10 x 10 cm (9 par feuille) 0,13 € → 0,15 ; moyen (logo de tote) 0,76 € → 0,75 ; face ou dos de vêtement (A4 0,96, grand 1,48) → 1,20.
    impression: { petit: 0.15, moyen: 0.75, grand: 1.2 },
    format_face: { 'tote-bag-promo': 'moyen', 'tote-bag-promo-noir': 'moyen', 'bob': 'petit', 'casquette-trucker': 'petit', 'casquete-bc015': 'petit' }, _statut: 'textile_reel = factures ; textile = estimations de devis/couts.json, à corriger par Karim' }, frais,
  regles: regles.map((r) => ({ date: r.date, texte: r.texte })),
  historique,
};
const json = JSON.stringify(base);
const parStatut = historique.reduce((m, x) => ((m[x.statut] = (m[x.statut] || 0) + 1), m), {});
console.log(`Produits : ${Object.keys(produits).length} · règles : ${regles.length} · historique : ${historique.length} lignes ${JSON.stringify(parStatut)}`);
console.log(`Taille : ${(json.length / 1024).toFixed(1)} Ko (limite Firestore 1 Mo)`);
if (json.length > 900000) { console.error('Base trop grosse pour un document Firestore.'); process.exit(1); }
if (!appliquer) { console.log('Aperçu seulement (ajouter --appliquer pour écrire adminNotes/tarifsCalculateur).'); process.exit(0); }

const raw = cheminCle ? readFileSync(cheminCle, 'utf8') : process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Compte de service absent (--cle fichier ou FIREBASE_SERVICE_ACCOUNT).'); process.exit(2); }
const sa = JSON.parse(raw);
const b64url = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const corps = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }))}`;
const jwt = `${corps}.${createSign('RSA-SHA256').update(corps).sign(sa.private_key, 'base64url')}`;
const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
if (!tok.ok) { console.error('Jeton refusé : ' + (await tok.text())); process.exit(2); }
const { access_token } = await tok.json();
const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/adminNotes/tarifsCalculateur`;
const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { json: { stringValue: json }, updatedAt: { stringValue: base.genere_le } } }) });
if (!res.ok) { console.error('Écriture refusée : ' + (await res.text())); process.exit(2); }
console.log('Écrit : adminNotes/tarifsCalculateur');
