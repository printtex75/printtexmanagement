#!/usr/bin/env node
// Lecture et mise à jour de la boîte à idées (collection Firestore `idees`) depuis
// la session Claude Code du chef. Aucune dépendance : JWT signé avec node:crypto,
// échange contre un jeton OAuth2, puis API REST Firestore.
//
// Pré-requis : la variable d'environnement FIREBASE_SERVICE_ACCOUNT contient le
// JSON d'un compte de service du projet Firebase (console → Paramètres du projet →
// Comptes de service → Générer une nouvelle clé privée).
//
// Usage :
//   node scripts/idees-firestore.mjs list                 # toutes les idées (JSON)
//   node scripts/idees-firestore.mjs nouvelles            # analysées, pas encore résumées au chef
//   node scripts/idees-firestore.mjs get <id>
//   node scripts/idees-firestore.mjs set <id> '<json>'    # fusionne les champs donnés dans le document
//   node scripts/idees-firestore.mjs resume <id>          # marque l'idée comme résumée au chef
//   node scripts/idees-firestore.mjs comment <id> '<texte>'   # ajoute un commentaire signé Claude

import { createSign } from "node:crypto";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("FIREBASE_SERVICE_ACCOUNT manquante dans l'environnement."); process.exit(2); }
// Le champ « Variables d'environnement » peut avoir modifié les retours à la ligne ou les guillemets :
// on lit le JSON tel quel si possible, sinon on extrait les trois champs utiles à la main.
function parseServiceAccount(txt) {
  let t = txt.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) t = t.slice(1, -1);
  try { const j = JSON.parse(t); if (j.private_key && j.client_email) return j; } catch {}
  const field = (k) => (t.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]+)"')) || [])[1];
  const pk = t.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  if (!pk || !field("client_email")) return null;
  return { project_id: field("project_id") || "printtex-commande", client_email: field("client_email"), private_key: pk[0].replace(/\\n/g, "\n") };
}
const sa = parseServiceAccount(raw);
if (!sa) { console.error("FIREBASE_SERVICE_ACCOUNT est illisible : il faut le contenu complet du fichier JSON du compte de service."); process.exit(2); }
const PROJECT = sa.project_id;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("Échange de jeton refusé : " + (await res.text()));
  return (await res.json()).access_token;
}

/* ---- conversion valeurs Firestore <-> JS ---- */
function toJS(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(toJS);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, toJS(x)]));
  return null;
}
function toFS(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "string") return { stringValue: x };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFS) } };
  if (typeof x === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toFS(v)])) } };
  throw new Error("Type non pris en charge : " + typeof x);
}
const docToJS = (d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, toJS(v)])) });

/* ---- opérations ---- */
async function api(token, path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Firestore ${res.status} sur ${path} : ${await res.text()}`);
  return res.json();
}
async function listAll(token) {
  let out = [], pageToken = "";
  do {
    const j = await api(token, `/idees?pageSize=300${pageToken ? "&pageToken=" + pageToken : ""}`);
    out = out.concat((j.documents || []).map(docToJS));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
async function getOne(token, id) { return docToJS(await api(token, `/idees/${encodeURIComponent(id)}`)); }
async function merge(token, id, patch) {
  const fields = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, toFS(v)]));
  const mask = Object.keys(patch).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  return docToJS(await api(token, `/idees/${encodeURIComponent(id)}?${mask}`, { method: "PATCH", body: JSON.stringify({ fields }) }));
}

const [cmd, id, arg] = process.argv.slice(2);
const now = () => new Date().toISOString();
const print = (x) => console.log(JSON.stringify(x, null, 2));
try {
  const token = await accessToken();
  switch (cmd) {
    case "list": print(await listAll(token)); break;
    case "nouvelles": print((await listAll(token)).filter((i) => i.analyse && !i.resumeChef)); break;
    case "get": print(await getOne(token, id)); break;
    case "set": print(await merge(token, id, { ...JSON.parse(arg), updatedAt: now() })); break;
    case "resume": print(await merge(token, id, { resumeChef: now(), updatedAt: now() })); break;
    case "comment": {
      const i = await getOne(token, id);
      const commentaires = [...(i.commentaires || []), { uid: "claude", nom: "Claude", texte: arg, date: now() }];
      print(await merge(token, id, { commentaires, updatedAt: now() }));
      break;
    }
    default:
      console.error("Commande inconnue. Voir l'en-tête du fichier."); process.exit(2);
  }
} catch (e) { console.error(e.message || e); process.exit(1); }
