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
  produits, couts: { ...couts, textile_reel, _statut: 'textile_reel = factures ; textile = estimations de devis/couts.json, à corriger par Karim' }, frais,
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
