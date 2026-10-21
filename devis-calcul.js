/* Calculateur de devis Printtex : moteur de calcul (aucun accès réseau, aucune donnée en dur).
   Utilisé par devis.html (navigateur) et par scripts/test-devis-calcul.mjs (node).
   Toutes les sommes sont en centimes entiers. La grille est celle du site (TTC), comme scripts/devis/creer-devis.mjs :
   - la 1re pièce de chaque ligne est au prix BAT (palier « 1 pièce »), les suivantes au palier de la quantité de la ligne ;
   - le palier se calcule sur le total de la LIGNE (toutes couleurs et tailles de la ligne), jamais en regroupant des lignes ;
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
  function coutPiece(base, l, nbMarq) {
    const c = base.couts || {}, choix = (t) => (t == null ? null : typeof t === 'object' ? (t[l.teinte] ?? t.couleur ?? null) : t);
    const reel = choix(((c.textile_reel || {})[l.produit] || {}).ht);
    const textile = reel ?? choix((c.textile || {})[l.produit]);
    if (textile == null) return null;
    return { c: Math.round((textile + (c.consommables_par_marquage || 0) * nbMarq + (c.main_oeuvre_par_piece || 0)) * 100), textileReel: reel != null };
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
        const k = indicePalier(paliers, q);
        if (q > (base.palier_max || 200)) add('attention', `${nom} : ${q} pièces, au-delà de 200 : palier ${libPaliers[k]} appliqué, prix sur mesure possible.`);
        const bat = ht(grille[0]);
        const grillePalier = ht(grille[k]);
        let pu = grillePalier, ajTexte = '';
        if (aj.mode === 'remise' && Number(aj.valeur) > 0) { pu = Math.round(grillePalier * (1 - Number(aj.valeur) / 100)); ajTexte = `remise commerciale ${aj.valeur} %`; }
        else if (aj.mode === 'prix' && Number(aj.valeur) > 0) { pu = ht(Math.round(Number(aj.valeur) * 100)); ajTexte = `prix imposé ${eur(Math.round(Number(aj.valeur) * 100))} TTC`; }
        if (prixUnePiece == null) prixUnePiece = { pu: bat, libelle: p.libelle };
        const total = bat + pu * (q - 1);
        const cpo = coutPiece(base, l, nbMarq), cp = cpo ? cpo.c : null;
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
        const detail = [`${nbMarq} emplacement${nbMarq > 1 ? 's' : ''}, impression ${l.technique || 'DTF'}`, emplTxt, couleursTxt].filter(Boolean).join(' · ');
        client.push({ desc: `${p.libelle} – 1re pièce (BAT à valider avant production)`, detail, qte: 1, pu: bat });
        if (q > 1) client.push({ desc: `${p.libelle} – pièces suivantes`, detail: `Tarif dégressif ${libPaliers[k]} pièces${aj.mode === 'remise' && Number(aj.valeur) > 0 ? ` · remise ${aj.valeur} %` : ''}`, qte: q - 1, pu });
        totalHT += total;
        lignes.push({ nom, libelle: p.libelle, q, palier: libPaliers[k], bat, grillePalier, pu, ajTexte, motif: aj.motif || '', total, coutPiece: cp, textileReel: !!(cpo && cpo.textileReel), comparables: comp });
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
