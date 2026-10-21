/* Calculateur de devis Printtex : moteur de calcul (aucun accès réseau, aucune donnée en dur).
   Utilisé par devis.html (navigateur) et par scripts/test-devis-calcul.mjs (node).
   Toutes les sommes sont en centimes entiers. La grille est celle du site (TTC), comme scripts/devis/creer-devis.mjs :
   - la 1re pièce de chaque ligne est au prix BAT (palier « 1 pièce »), les suivantes au palier de la quantité de la ligne ;
   - le palier se calcule sur le total de la LIGNE (toutes couleurs et tailles de la ligne) ; les lignes ne sont additionnées
     que si l'employé le choisit (devis.cumulerPaliers), et un palier plus avantageux peut être accordé à la main (ligne.palier) ;
   - au-delà de 200 pièces : palier 101-200 et alerte « prix sur mesure possible ». */
(function (root) {
  'use strict';
  const TVA = 0.2;
  const ht = (ttc) => Math.round(ttc / (1 + TVA));
  const eur = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  function indicePalier(paliers, q) { return paliers.reduce((i, p, k) => (q >= p ? k : i), 0); }
  function quantiteLigne(l) {
    if (l.type !== 'grille') return Math.max(0, Math.floor(Number(l.quantite) || 0));
    return (l.couleurs || []).reduce((s, c) => s + Object.values(c.tailles || {}).reduce((a, n) => a + Math.max(0, Math.floor(Number(n) || 0)), 0), 0);
  }

  // Coût d'une pièce d'une ligne de grille (centimes) : textile payé sur facture s'il est connu (couts.textile_reel),
  // sinon estimation de devis/couts.json ; + consommables par emplacement + main-d'œuvre (estimations). null si le textile manque.
  // Impression : coût selon la taille du visuel (couts.impression, calculé sur les vrais prix d'encre, de feuille et de colle) ;
  // faces au format du produit (couts.format_face, « grand » par défaut), manches et étiquette en « petit ».
  // Sans couts.impression : ancien forfait consommables_par_marquage par impression.
  function coutPiece(base, l, nbFaces, nbPetits = 0) {
    const c = base.couts || {}, choix = (t) => (t == null ? null : typeof t === 'object' ? (t[l.teinte] ?? t.couleur ?? null) : t);
    const reel = choix(((c.textile_reel || {})[l.produit] || {}).ht);
    const textile = reel ?? choix((c.textile || {})[l.produit]);
    if (textile == null) return null;
    const imp = c.impression;
    const impression = imp ? (imp[(c.format_face || {})[l.produit] || 'grand'] || 0) * nbFaces + (imp.petit || 0) * nbPetits
      : (c.consommables_par_marquage || 0) * (nbFaces + nbPetits);
    return { c: Math.round((textile + impression + (c.main_oeuvre_par_piece || 0)) * 100), textileReel: reel != null };
  }

  // Ventes comparables : même produit ; les ventes réelles d'abord, les devis non acceptés à part.
  function comparables(base, produit) {
    const h = (base.historique || []).filter((x) => x.produit === produit && !x.doublon_de);
    const reels = h.filter((x) => ['devis_accepte', 'facture', 'paye', 'commande'].includes(x.statut));
    return { reels, nonAcceptes: h.filter((x) => x.statut === 'devis_non_accepte') };
  }
  function mediane(v) { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

  function calculer(base, devis) {
    const paliers = base.paliers, libPaliers = base.paliers_libelles;
    const frais = base.frais || {};
    const alertes = [];           // { niveau: 'info'|'attention'|'bloquant', texte }
    const lignes = [];            // détail interne
    const client = [];            // lignes du devis client : { desc, detail, qte, pu } (pu HT, centimes)
    let totalHT = 0, coutTotal = 0, coutConnu = true, piecesTotal = 0, prixUnePiece = null;
    const add = (niveau, texte) => alertes.push({ niveau, texte });
    const piecesGrille = (devis.lignes || []).filter((l) => l.type === 'grille').reduce((s, l) => s + quantiteLigne(l), 0);

    (devis.lignes || []).forEach((l, i) => {
      const q = quantiteLigne(l);
      const nom = `Ligne ${i + 1}`;
      if (!q) { add('attention', `${nom} : aucune quantité saisie, ligne ignorée.`); return; }
      piecesTotal += q;
      const aj = l.ajustement || { mode: 'aucun' };
      if (aj.mode !== 'aucun' && !String(aj.motif || '').trim()) add('attention', `${nom} : ajustement sans justification interne.`);

      if (l.type === 'grille') {
        const p = (base.produits || {})[l.produit];
        if (!p) { add('bloquant', `${nom} : produit inconnu dans la grille (${l.produit}).`); return; }
        const teinte = p.teinte_fixe || l.teinte || 'couleur';
        const nbMarq = Math.min(Math.max(1, Number(l.marquages) || 1), p.max_marquages || 2);
        if ((Number(l.marquages) || 1) > nbMarq) add('attention', `${nom} : ${l.marquages} emplacements demandés, la grille s'arrête à ${nbMarq}. Prix des emplacements en plus à saisir sur une ligne libre.`);
        const grille = p.grilles?.[teinte]?.[String(nbMarq)];
        if (!grille) { add('bloquant', `${nom} : pas de grille ${teinte} / ${nbMarq} emplacement(s) pour ${p.libelle}.`); return; }
        if (l.technique && l.technique !== 'DTF') add('attention', `${nom} : la grille du site est en DTF ; aucun tarif ${l.technique} validé, prix à vérifier.`);
        // Palier normal : quantité de la ligne, ou total des articles du catalogue si l'employé choisit de les additionner.
        // Palier choisi (l.palier) : tarif préférentiel accordé à la main, affiché comme tel.
        const kNormal = indicePalier(paliers, devis.cumulerPaliers ? piecesGrille : q);
        const choisi = l.palier != null && l.palier !== '' && paliers[Number(l.palier)] != null ? Number(l.palier) : null;
        // Mode « marque gentil » (Karim 21/10) : prix du plus gros palier dès la 1re pièce, 1 face (le dos est offert),
        // sans supplément de BAT ; ex. t-shirt 220 g couleur à 18 € TTC, comme les ventes habituelles aux marques.
        // Sans prix partenaire fixé pour ce produit : prix normal (Karim 21/10), jamais de réduction automatique.
        const gentil = !!devis.modeMarque && (base.tarifs_marque || {})[l.produit] != null;
        // Sans BAT (devis.sansBat) : pas de 1re pièce plus chère, toutes les pièces au palier, au moins celui de 2 à 5 (Karim 21/10).
        const sansBat = !!devis.sansBat && !gentil;
        const k = gentil ? paliers.length - 1 : Math.max(choisi ?? kNormal, sansBat ? 1 : 0);
        const grilleVente = gentil ? (p.grilles?.[teinte]?.['1'] || grille) : grille;
        if (choisi != null && choisi > kNormal) add('info', `${nom} : tarif ${libPaliers[k]} pièces accordé pour ${q} pièce${q > 1 ? 's' : ''} (normalement ${libPaliers[kNormal]}).`);
        if (q > (base.palier_max || 200)) add('attention', `${nom} : ${q} pièces, au-delà de 200 : palier ${libPaliers[k]} appliqué, prix sur mesure possible.`);
        // Petits marquages en plus (manches, étiquette) : supplément par pièce selon le palier, table frais.supplements.
        const nbManches = Math.min(2, Math.max(0, Number(l.manches) || 0)), etiq = l.etiquette ? 1 : 0;
        const sup = frais.supplements || {};
        const supplement = (kk) => (sup.manche ? sup.manche[kk] * nbManches : 0) + (sup.etiquette ? sup.etiquette[kk] * etiq : 0); // TTC, ajouté avant le passage en HT
        if ((nbManches && !sup.manche) || (etiq && !sup.etiquette)) add('attention', `${nom} : prix des manches ou de l'étiquette absent de la base, non compté.`);
        // Prix marque donné par Karim pour ce produit (base.tarifs_marque, TTC par pièce) ; sinon règle provisoire du plus gros palier.
        // Par produit : un prix par nombre de faces ({ "1": …, "2": … }), ou un seul prix pour toutes les faces.
        // Formes acceptées : un prix ; { "1": prix, "2": prix } par nombre de faces ; { blanc: {…}, couleur: {…} } par teinte ;
        // et chaque prix peut être une liste de 5 prix (un par palier, selon la quantité).
        let tm = gentil ? (base.tarifs_marque || {})[l.produit] : null;
        if (tm && typeof tm === 'object' && !Array.isArray(tm) && (tm.blanc || tm.couleur)) tm = tm[teinte];
        const parFace = (n) => (tm == null ? null : typeof tm === 'object' && !Array.isArray(tm) ? tm[String(n)] ?? null : tm);
        const auPalier = (v) => (Array.isArray(v) ? v[kNormal] ?? null : v);
        const prixMarque = auPalier(parFace(nbMarq));
        // Dos « offert » seulement quand face + dos coûte le prix d'une face.
        const dosOffert = gentil && nbMarq > 1 && (prixMarque == null || prixMarque === auPalier(parFace(1)));
        if (gentil && prixMarque == null) add('info', `${nom} : tarif marque provisoire (prix 101-200 pièces, 1 face) en attendant le prix de Karim pour ce produit.`);
        const grillePalier = ht((prixMarque ?? grilleVente[k]) + supplement(k));
        const bat = gentil || sansBat ? grillePalier : ht(grille[0] + supplement(0));
        let pu = grillePalier, ajTexte = '';
        if (aj.mode === 'remise' && Number(aj.valeur) > 0) { pu = Math.round(grillePalier * (1 - Number(aj.valeur) / 100)); ajTexte = `remise commerciale ${aj.valeur} %`; }
        else if (aj.mode === 'prix' && Number(aj.valeur) > 0) { pu = ht(Math.round(Number(aj.valeur) * 100)); ajTexte = `prix imposé ${eur(Math.round(Number(aj.valeur) * 100))} TTC`; }
        if (prixUnePiece == null) prixUnePiece = { pu: bat, libelle: p.libelle };
        const total = gentil || sansBat ? pu * q : bat + pu * (q - 1);
        const cpo = coutPiece(base, l, nbMarq, nbManches + etiq), cp = cpo ? cpo.c : null;
        if (cp == null) { coutConnu = false; add('attention', `${nom} : coût d'achat inconnu pour ${p.libelle}, marge non calculable : prix à vérifier.`); }
        else {
          coutTotal += cp * q;
          if (pu < cp) add('attention', `${nom} : prix par pièce (${eur(pu)} HT) inférieur au coût estimé (${eur(cp)} HT).`);
        }
        const comp = comparables(base, l.produit);
        const med = mediane(comp.reels.filter((x) => x.pu_ht != null).map((x) => Math.round(x.pu_ht * 100)));
        if (med != null && Math.abs(pu - med) / med > 0.25) add('info', `${nom} : ${eur(pu)} HT par pièce, écart de plus de 25 % avec la médiane des ventes comparables (${eur(med)} HT).`);
        const couleursTxt = (l.couleurs || []).filter((c) => quantiteLigne({ type: 'grille', couleurs: [c] }))
          .map((c) => `${c.nom || 'couleur'} : ${Object.entries(c.tailles || {}).filter(([, n]) => Number(n) > 0).map(([t, n]) => `${t} ×${n}`).join(', ')}`).join(' · ');
        const emplTxt = (l.emplacements || []).filter((e) => e.lieu).map((e) => e.lieu + (e.dim ? ` (${e.dim})` : '')).join(', ');
        const petits = [nbManches ? `${nbManches} manche${nbManches > 1 ? 's' : ''}` : '', etiq ? 'étiquette' : ''].filter(Boolean).join(' + ');
        const detail = [`${nbMarq} emplacement${nbMarq > 1 ? 's' : ''}${petits ? ' + ' + petits : ''}, impression ${l.technique || 'DTF'}`, emplTxt, couleursTxt].filter(Boolean).join(' · ');
        if (gentil) {
          if (dosOffert) add('info', `${nom} : tarif marque, le dos est offert.`);
          client.push({ desc: `${p.libelle} – tarif marque`, detail: detail + (dosOffert ? ' · dos offert' : '') + ' · 1re pièce = BAT à valider avant production', qte: q, pu });
        } else if (sansBat) client.push({ desc: p.libelle, detail: detail + ` · tarif ${libPaliers[k]} pièces, sans BAT`, qte: q, pu });
        else client.push({ desc: `${p.libelle} – 1re pièce (BAT à valider avant production)`, detail, qte: 1, pu: bat });
        if (q > 1 && !gentil && !sansBat) client.push({ desc: `${p.libelle} – pièces suivantes`, detail: `${choisi != null && choisi > kNormal ? 'Tarif préférentiel' : 'Tarif dégressif'} ${libPaliers[k]} pièces${devis.cumulerPaliers && choisi == null ? ' (quantités additionnées)' : ''}${aj.mode === 'remise' && Number(aj.valeur) > 0 ? ` · remise ${aj.valeur} %` : ''}`, qte: q - 1, pu });
        totalHT += total;
        lignes.push({ nom, libelle: p.libelle, q, palier: libPaliers[k], k, kNormal, palierChoisi: choisi != null, dosOffert, bat, grillePalier, pu, ajTexte, motif: aj.motif || '', total, coutPiece: cp, textileReel: !!(cpo && cpo.textileReel), comparables: comp });
      } else if (l.type === 'textile_fourni' && frais.impression_seule && l.technique) {
        // Impression seule sur textile du client (grille Karim 21/10, TTC) : 1re pièce = BAT, les suivantes au palier de la
        // quantité de la ligne (paliers propres : 1 / 2-25 / 26-50 / 51-100 / 101-200) ; visuel « chargé » au-delà de 8 cc d'encre.
        // Suppléments par pièce : +2 € par emplacement en plus (manche, cœur), +1,20 € par étiquette.
        const g = frais.impression_seule, tech = g.grilles[l.technique];
        if (!tech) { add('bloquant', `${nom} : technique inconnue (${l.technique}).`); return; }
        const faces = Math.min(2, Math.max(1, Number(l.faces) || 1)), petits = Math.max(0, Number(l.manches) || 0), etiq = l.etiquette ? 1 : 0;
        const grille = tech[l.charge ? 'charge' : 'normal'][String(faces)];
        const sansBatT = !!devis.sansBat;
        const k = Math.max(indicePalier(g.paliers, q), sansBatT ? 1 : 0), sup = petits * g.supplement_emplacement + etiq * g.etiquette;
        const bat = sansBatT ? ht(grille[k] + sup) : ht(grille[0] + sup);
        let pu = ht(grille[k] + sup);
        if (aj.mode === 'prix' && Number(aj.valeur) > 0) pu = ht(Math.round(Number(aj.valeur) * 100));
        const total = bat + pu * (q - 1);
        const ci = (base.couts || {}).impression_seule;
        const cp = ci ? Math.round(((ci.matiere[l.technique] + (l.charge ? ci.supplement_charge[l.technique] : 0)) * faces
          + ci.main_oeuvre[l.technique] * (1 + 0.5 * (faces - 1)) + ci.petit * (petits + etiq)) * 100) : null; // 2e face : demi temps
        if (cp == null) { coutConnu = false; add('info', `${nom} : coût de l'impression seule non renseigné, marge non calculée.`); }
        else { coutTotal += cp * q; if (pu < cp) add('attention', `${nom} : prix par pièce inférieur au coût estimé.`); }
        const libT = { 'dtg-blanc': 'DTG sur textile blanc', 'dtg-fonce': 'DTG sur textile foncé', 'dtf': 'DTF' }[l.technique] || l.technique;
        const detail = [`${faces === 2 ? 'Face + dos' : '1 face'}${petits ? ` + ${petits} emplacement${petits > 1 ? 's' : ''}` : ''}${etiq ? ' + étiquette' : ''}`, libT, l.charge ? 'visuel chargé' : ''].filter(Boolean).join(' · ');
        if (sansBatT) client.push({ desc: l.designation || 'Impression sur textile fourni par le client', detail: detail + ` · tarif ${g.libelles[k]} pièces, sans BAT`, qte: q, pu });
        else client.push({ desc: `${l.designation || 'Impression sur textile fourni par le client'} – 1re pièce (BAT)`, detail, qte: 1, pu: bat });
        if (q > 1 && !sansBatT) client.push({ desc: `${l.designation || 'Impression sur textile fourni par le client'} – pièces suivantes`, detail: `Tarif ${g.libelles[k]} pièces`, qte: q - 1, pu });
        totalHT += total;
        lignes.push({ nom, libelle: 'Textile du client', type: 'textile_fourni', q, palier: g.libelles[k], k, kNormal: k, bat, grillePalier: pu, pu, total, coutPiece: cp, motif: aj.motif || '' });
      } else if (l.type === 'textile_fourni') {
        const pt = frais.print_textile_fourni_ttc;
        const n = Math.max(1, Number(l.emplacements) || 1);
        if (pt == null) { add('bloquant', `${nom} : tarif « textile apporté par le client » absent de la base.`); return; }
        let pu = ht(pt * n);
        if (aj.mode === 'prix' && Number(aj.valeur) > 0) pu = ht(Math.round(Number(aj.valeur) * 100));
        const cp = frais.cout_print_textile_fourni != null ? Math.round(frais.cout_print_textile_fourni * 100 * n) : null;
        if (cp == null) { coutConnu = false; add('info', `${nom} : coût d'un print sur textile apporté non renseigné, marge non calculée.`); } else coutTotal += cp * q;
        client.push({ desc: l.designation || 'Impression sur textile fourni par le client', detail: `${n} emplacement${n > 1 ? 's' : ''} · visuel simple, fichier prêt à imprimer fourni`, qte: q, pu });
        totalHT += pu * q;
        lignes.push({ nom, libelle: 'Textile apporté', q, pu, total: pu * q, coutPiece: cp, motif: aj.motif || '' });
      } else if (l.type === 'libre') {
        const pu = Math.round((Number(l.pu_ht) || 0) * 100);
        if (!pu) add('attention', `${nom} : prix de « ${l.designation || 'ligne libre'} » non saisi.`);
        const cp = l.cout_ht != null && l.cout_ht !== '' ? Math.round(Number(l.cout_ht) * 100) : null;
        if (cp == null) { coutConnu = false; add('info', `${nom} : coût non renseigné pour « ${l.designation || 'ligne libre'} ».`); }
        else { coutTotal += cp * q; if (pu < cp) add('attention', `${nom} : prix inférieur au coût saisi.`); }
        client.push({ desc: l.designation || 'Article', detail: l.detail || '', qte: q, pu });
        totalHT += pu * q;
        lignes.push({ nom, libelle: l.designation || 'Ligne libre', q, pu, total: pu * q, coutPiece: cp, motif: aj.motif || '' });
      }
    });

    // Logo refait proprement : prix et seuil de gratuité lus dans la base.
    if (Number(devis.logoARefaire) > 0 && frais.logo_refait_ht != null) {
      const n = Number(devis.logoARefaire), offert = frais.logo_offert_des_pieces != null && piecesTotal >= frais.logo_offert_des_pieces;
      const pu = offert ? 0 : frais.logo_refait_ht;
      client.push({ desc: 'Logo refait proprement', detail: `Redessiné net pour l'impression${frais.logo_offert_des_pieces != null ? ` · offert dès ${frais.logo_offert_des_pieces} pièces` : ''}`, qte: n, pu });
      totalHT += pu * n;
    }
    // Pièce échantillon (marques) : au prix d'une pièce, en plus de la série.
    if (devis.echantillon && prixUnePiece) {
      client.push({ desc: `Pièce échantillon – ${prixUnePiece.libelle}`, detail: 'Pour valider le rendu avant la série', qte: 1, pu: prixUnePiece.pu });
      totalHT += prixUnePiece.pu;
    }
    // Urgence : seulement si un supplément validé existe dans la base, sinon on prévient.
    const sousTotalAvantFrais = totalHT;
    if (devis.urgent) {
      if (frais.urgence_pct != null) {
        const sup = Math.round(sousTotalAvantFrais * frais.urgence_pct / 100);
        client.push({ desc: 'Supplément urgence', detail: `Production prioritaire (+${frais.urgence_pct} %)`, qte: 1, pu: sup });
        totalHT += sup;
      } else add('attention', 'Urgence demandée : aucun supplément validé dans la base. Ajouter une ligne libre si un supplément s\'applique.');
    }
    // Code promo / remise globale (montant TTC), toujours affichée à part.
    let remiseGlobale = 0;
    if (devis.codePromo && Number(devis.codePromo.montant_ttc) > 0) {
      remiseGlobale = ht(Math.round(Number(devis.codePromo.montant_ttc) * 100));
      if (!String(devis.codePromo.motif || '').trim()) add('attention', 'Remise globale sans justification interne.');
      if (lignes.some((x) => x.ajTexte)) add('attention', 'Remise globale ajoutée à des remises par ligne : vérifier que le cumul est voulu.');
      client.push({ desc: `Remise${devis.codePromo.code ? ' ' + devis.codePromo.code : ''}`, detail: '', qte: 1, pu: -remiseGlobale });
      totalHT -= remiseGlobale;
    }
    // Livraison, règles lues dans la base (Colissimo offerte au-delà d'un seuil TTC, express, retrait).
    const L = (frais.livraison || {})[devis.livraison || 'retrait'];
    if (L) {
      const ttcProduits = Math.round(totalHT * (1 + TVA));
      const gratuit = L.offert_des_ttc != null && ttcProduits >= L.offert_des_ttc;
      const pu = gratuit ? 0 : ht(L.ttc || 0);
      client.push({ desc: L.libelle + (gratuit ? ` – offerte dès ${eur(L.offert_des_ttc)} TTC` : ''), detail: '', qte: 1, pu });
      totalHT += pu;
    } else add('attention', `Mode de livraison « ${devis.livraison} » inconnu de la base.`);

    const tva = Math.round(totalHT * TVA);
    const marge = coutConnu && totalHT > 0 ? totalHT - coutTotal : null;
    if (!coutConnu) add('attention', 'Au moins un coût manque : la marge affichée est partielle ou absente, prix à vérifier.');
    return {
      lignes, client, alertes, piecesTotal,
      totalHT, tva, totalTTC: totalHT + tva, remiseGlobale, sousTotalAvantFrais,
      coutTotal, coutConnu, marge, tauxMarge: marge != null ? marge / totalHT : null,
    };
  }

  const api = { calculer, quantiteLigne, indicePalier, ht, eur, comparables, TVA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DevisCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
