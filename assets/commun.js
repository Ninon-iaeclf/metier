/* ============================================================
   commun.js — ce que les cinq pages partagent.
   Chargé par index.html, salaires.html, exigences.html,
   recruteurs.html et mouvement.html, après Chart.js.

   Tout est déclaré au premier niveau : le petit script de chaque
   page peut donc appeler directement euro(), barres(), NIVEAUX…
   Une page ne fait plus que deux choses : son HTML de section, et
   Commun.demarrer(rendre) où rendre(offres, D) dessine SES
   graphiques à chaque changement de filtre.
   ============================================================ */

/* ============================================================
   1) UTILITAIRES
   ============================================================ */
const euro = (n, pas = 1) => n == null || !isFinite(n) ? "—" : (Math.round(n / pas) * pas).toLocaleString("fr-FR") + " €";
const net = brutAnnuel => brutAnnuel * 0.78 / 12;
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const mediane = a => quantile(a, .5);
function quantile(a, q) {
  const s = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const p = (s.length - 1) * q, bas = Math.floor(p), haut = Math.ceil(p);
  return bas === haut ? s[bas] : s[bas] + (s[haut] - s[bas]) * (p - bas);
}
const compter = (liste, cle) => { const c = new Map(); for (const x of liste) { const k = cle(x); if (k == null || k === "") continue; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]); };
const court = (s, n) => !s ? "—" : (s.length > n ? s.slice(0, n - 1) + "…" : s);
/* Le libellé de salaire de France Travail, rendu lisible : « Mensuel de 2500.0 Euros à
   2500.0 Euros » -> « 2 500 € brut par mois ». Le commentaire libre qui suit un tiret
   (« - Salaire horaire : Smic horaire (+ majoration…) ») est coupé : il fait trois lignes
   dans une liste compacte et n'ajoute rien au chiffre. */
function salaireCourt(o) {
  const lib = String(o.salaire || "").split(" - ")[0].trim();
  if (!lib) return "";
  const m = /^(annuel|mensuel|horaire)\s+de\s+([\d.,]+)\s*euros(?:\s*à\s*([\d.,]+)\s*euros)?/i.exec(lib);
  if (!m) return court(lib, 60);
  const periode = { annuel: "par an", mensuel: "par mois", horaire: "de l'heure" }[m[1].toLowerCase()];
  const nb = v => Number(String(v).replace(",", "."));
  const somme = v => nb(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €";
  const haut = m[3] && nb(m[3]) > nb(m[2]) ? somme(m[3]) : null;
  return (haut ? somme(m[2]) + " à " + haut : somme(m[2])) + " brut " + periode;
}
/* Coupe un libellé long en lignes courtes : Chart.js affiche un tableau sur
   plusieurs lignes, donc rien n'est tronqué, même sur un écran de 400 px. */
function enLignes(texte, max = 28) {
  const lignes = [];
  let ligne = "";
  for (const mot of String(texte).split(" ")) {
    if (ligne && (ligne + " " + mot).length > max) { lignes.push(ligne); ligne = mot; }
    else ligne = ligne ? ligne + " " + mot : mot;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}
const ans = v => v == null ? "—" : v === 0 ? "débutant" : v < 1 ? Math.round(v * 12) + " mois" : (Math.round(v * 10) / 10).toLocaleString("fr-FR") + (v >= 2 ? " ans" : " an");
// 2026-09-22 -> 22/09/2026 (ou 22/09 pour les étiquettes de graphique).
const dateFr = (s, bref = false) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? (bref ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`) : (s || "?"); };
// Âge d'une annonce en jours, par rapport à la date d'extraction.
const age = o => { const jour = Date.parse(D.date), t = Date.parse(o.date); return (isFinite(jour) && isFinite(t)) ? (jour - t) / 86400000 : null; };

const couleur = "#0a5cff", pale = "rgba(10,92,255,.25)";
const COULEURS = { Marketing: "#0a5cff", Digital: "#ff6a00", Frontière: "#8e8e93" };
// Palette des niveaux : du clair au foncé, assistant → directeur, « autre » en gris. Valable sur toute la page.
const COUL_NIV = { assistant: "#a7c9ff", charge: "#5f9bf5", responsable: "#2a6ad4", directeur: "#123a7a", autre: "#b4b4bc" };
// Sur ces trois teintes claires, le texte blanc n'est pas lisible : on écrit en encre foncée.
const ENCRE_FONCEE = new Set(["assistant", "charge", "autre"]);
const NIVEAUX_DEFAUT = [["assistant", "Assistant·e / junior"], ["charge", "Chargé·e"], ["responsable", "Responsable"], ["directeur", "Directeur·rice"], ["autre", "Autre"]];
const FORMATIONS_DEFAUT = ["< Bac", "Bac", "Bac+2", "Bac+3/4", "Bac+5"];
// Six familles de contrat, exclusives : une offre tombe dans une seule.
const CONTRATS = [["cdi", "CDI"], ["cdd", "CDD"], ["alt", "Alternance"], ["mis", "Intérim"], ["indep", "Indépendant"], ["autre", "Autre"]];
const AURA = new Set(["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]);
const IDF = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);
const EXPS = ["Débutant accepté", "Moins d'un an", "1 à 2 ans", "3 à 4 ans", "5 ans et plus", "Non précisé"];

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.plugins.legend.display = false;

let D, graphiques = {};
let NIVEAUX = NIVEAUX_DEFAUT, FORMATIONS = FORMATIONS_DEFAUT;

/* Famille de contrat d'une offre : l'alternance l'emporte sur le CDI/CDD qui la porte. */
function familleContrat(o) {
  const c = o.contrat || "", nat = o.nature || "";
  if (o.alternance || nat === "apprentissage" || nat === "professionnalisation") return "alt";
  if (c === "MIS") return "mis";
  if (c === "LIB" || c === "FRA" || c === "CCE" || nat === "non_salarie") return "indep";
  if (c === "CDI") return "cdi";
  if (c === "CDD") return "cdd";
  return "autre";
}
const niv = o => (o && COUL_NIV[o.niveau]) ? o.niveau : "autre";
const libNiv = k => (NIVEAUX.find(x => x[0] === k) || [k, k])[1];
const libContrat = code => (D && D.contrats && D.contrats[code]) || code || "Non précisé";
/* Le contrat tel qu'on l'annonce au lecteur : l'alternance passe devant le CDI/CDD
   qui la porte, pour dire partout la même chose que le filtre. */
const libContratOffre = o => familleContrat(o) === "alt" ? "Alternance" : libContrat(o.contrat);

/* Une offre ouverte aux débutants. L'accueil annonce ce chiffre dans son lien vers
   « Ce qu'on vous demande », qui l'affiche aussi : une seule règle écrite une fois,
   pour que les deux pages ne puissent pas se contredire. */
const debutantAccepte = o => o.exp_exige === "D" || o.exp_ans === 0;

/* Tranche d'expérience demandée. */
function trancheExp(o) {
  if (o.exp_exige === "D" || o.exp_ans === 0) return "Débutant accepté";
  if (o.exp_ans == null) return "Non précisé";
  if (o.exp_ans < 1) return "Moins d'un an";
  if (o.exp_ans < 3) return "1 à 2 ans";
  if (o.exp_ans < 5) return "3 à 4 ans";
  return "5 ans et plus";
}

/* Secteurs : libellés officiels très longs, on les rend lisibles. */
const RACCOURCIS = [
  [/agences de travail temporaire/i, "Agences d'intérim"],
  [/placement de main-d'?œuvre|placement de main-d'?oeuvre/i, "Placement de main-d'œuvre"],
  [/mise à disposition de ressources humaines/i, "Mise à disposition de personnel"],
  [/relations publiques et communication/i, "Conseil en communication"],
  [/conseil pour les affaires et autres conseils de gestion/i, "Conseil en gestion"],
  [/programmation informatique/i, "Programmation informatique"],
  [/portails internet/i, "Portails internet"],
  [/régie publicitaire/i, "Régie publicitaire"],
  [/agences de publicité/i, "Agences de publicité"],
  [/commerce de détail/i, "Commerce de détail"],
];
function secteurCourt(s) {
  if (!s) return null;
  for (const [re, lib] of RACCOURCIS) if (re.test(s)) return lib;
  return court(s.replace(/^Activités? (de(s)? |d'|du )?/i, "").replace(/^./, c => c.toUpperCase()), 48);
}

/* ============================================================
   2) GRAPHIQUES : création la première fois, mise à jour ensuite
   ============================================================ */
function dessiner(id, type, data, options) {
  const el = document.getElementById(id);
  if (!el) return null;
  // resize() avant update() : la hauteur de la zone peut avoir changé avec le nombre de barres.
  if (graphiques[id]) { const g = graphiques[id]; g.data.labels = data.labels; g.data.datasets = data.datasets; g.resize(); g.update(); return g; }
  graphiques[id] = new Chart(el, { type, data, options: Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, options) });
  return graphiques[id];
}

/* Un graphique en barres horizontales doit grandir avec le nombre de barres :
   sinon Chart.js masque une étiquette sur deux et on ne sait plus qui est qui. */
function zoneSelonBarres(id, n, parBarre) {
  const el = document.getElementById(id);
  if (el) el.parentNode.style.height = Math.max(220, 56 + n * parBarre) + "px";
}

/* Barres simples, une seule série. */
function barres(id, etiquettes, valeurs, horizontal = true, suffixe = "", teinte = couleur) {
  dessiner(id, "bar",
    { labels: etiquettes, datasets: [{ data: valeurs, backgroundColor: teinte, borderRadius: 4 }] },
    { indexAxis: horizontal ? "y" : "x",
      plugins: { tooltip: { callbacks: { label: c => c.parsed[horizontal ? "x" : "y"] + suffixe } } },
      scales: { x: { grid: { display: !horizontal }, beginAtZero: true },
                y: { grid: { display: horizontal }, ticks: { autoSkip: !horizontal } } } });
}

/* Barres empilées par niveau de poste. */
function empilees(id, etiquettes, offresParEtiquette, horizontal = false) {
  // Un niveau décoché dans les filtres n'a plus aucune barre : on le retire aussi de la
  // légende, sinon elle annonce cinq couleurs dont deux ne sont nulle part sur le graphique.
  const datasets = NIVEAUX.map(([k, lib]) => ({
    label: lib, backgroundColor: COUL_NIV[k], borderRadius: 3,
    data: etiquettes.map((_, i) => (offresParEtiquette[i] || []).filter(o => niv(o) === k).length),
  })).filter(d => d.data.some(v => v > 0));
  // Total de chaque barre, pour dire dans l'infobulle « 320 offres sur 900, soit 36 % ».
  const totaux = etiquettes.map((_, i) => datasets.reduce((s, d) => s + d.data[i], 0));
  dessiner(id, "bar", { labels: etiquettes, datasets },
    { indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
                 tooltip: { callbacks: {
                   title: c => `${c[0].label} — ${totaux[c[0].dataIndex]} offres`,
                   label: c => { const v = c.parsed[horizontal ? "x" : "y"], t = totaux[c.dataIndex];
                     return `${c.dataset.label} : ${v} offre${v > 1 ? "s" : ""}${t ? ` (${Math.round(100 * v / t)} % de la barre)` : ""}`; } } } },
      scales: { x: { stacked: true, beginAtZero: true, grid: { display: !horizontal },
                     title: horizontal ? { display: true, text: "nombre d'offres" } : undefined },
                y: { stacked: true, beginAtZero: true, grid: { display: horizontal }, ticks: { autoSkip: !horizontal },
                     title: horizontal ? undefined : { display: true, text: "nombre d'offres" } } } });
}

/* Barres flottantes : de la médiane des minima à la médiane des maxima. */
function fourchette(lot) {
  const mn = mediane(lot.map(o => o.smin).filter(v => v != null));
  if (mn == null) return null;
  const mx = mediane(lot.map(o => (o.smax != null ? o.smax : o.smin)).filter(v => v != null));
  return [mn, Math.max(mx == null ? mn : mx, mn)];
}
function flottantes(id, lignes) {
  // lignes : [{ label, n, paire:[min,max] }]
  dessiner(id, "bar",
    { labels: lignes.map(l => [].concat(l.label, l.n + " offre" + (l.n > 1 ? "s" : ""))),
      datasets: [{ data: lignes.map(l => l.paire), backgroundColor: lignes.map(l => l.teinte || couleur), borderRadius: 4, borderSkipped: false }] },
    { indexAxis: "y",
      plugins: { tooltip: { callbacks: { label: c => { const r = c.raw || []; return r.length < 2 ? "" :
        [`${euro(r[0], 100)} → ${euro(r[1], 100)} brut par an`, `soit ${euro(net(r[0]), 10)} → ${euro(net(r[1]), 10)} net par mois`]; } } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => Math.round(v / 1000) + " k€" } },
                y: { grid: { display: true }, ticks: { autoSkip: false } } } });
}

/* ============================================================
   3) ÉTAT DES FILTRES
   ============================================================ */
const cochees = sel => new Set([...document.querySelectorAll(sel + " input:checked")].map(i => i.value));
function etatFiltres() {
  return { metiers: cochees("#metiers"), contrats: cochees("#f-contrats"), niveaux: cochees("#f-niveaux") };
}
/* Les offres retenues par les trois filtres. */
function filtrer(f) {
  f = f || etatFiltres();
  return D.offres.filter(o => f.metiers.has(o.rome) && f.contrats.has(familleContrat(o)) && f.niveaux.has(niv(o)));
}

/* ============================================================
   4) NAVIGATION ET PANNEAU DE FILTRES, IDENTIQUES PARTOUT
   ============================================================ */
const PAGES = [
  ["index.html", "Accueil"],
  ["salaires.html", "Ce que ça paie"],
  ["exigences.html", "Ce qu'on vous demande"],
  ["recruteurs.html", "Qui recrute"],
  ["mouvement.html", "Le marché bouge"],
  ["canaux.html", "Par canal"],
];
// Chemins relatifs partout : le site vit dans un sous-dossier (/metier/) sur GitHub Pages.
const PAGE_ICI = (location.pathname.split("/").pop() || "index.html");

const HTML_FILTRES = `
  <div class="filtres">
    <div>
      <h3>Les métiers</h3>
      <div class="metiers" id="metiers"></div>
      <div class="boutons">
        <button data-groupe="tous">Tout cocher</button>
        <button data-groupe="aucun">Tout décocher</button>
        <span class="groupes" id="groupes"></span>
      </div>
    </div>
    <div>
      <h3>Type de contrat</h3>
      <div class="cases" id="f-contrats"></div>
    </div>
    <div>
      <h3>Niveau de poste</h3>
      <div class="cases" id="f-niveaux"></div>
      <p class="note" style="margin:8px 0 0">Déduit de l'intitulé de l'annonce. Ces couleurs servent de repère dans toute la page.</p>
    </div>
  </div>
  <p class="compte" id="compte"></p>`;

function poserNavEtFiltres() {
  const n = document.getElementById("nav-ici");
  if (n) n.outerHTML = `<nav class="nav">` + PAGES.map(([url, lib]) =>
    `<a href="${url}"${url === PAGE_ICI ? ' class="ici" aria-current="page"' : ""}>${lib}</a>`).join("") + `</nav>`;

  const f = document.getElementById("filtres-ici");
  if (f) f.outerHTML = (PAGE_ICI === "index.html"
    // Accueil : le panneau est déplié, c'est le point de départ.
    ? `<div class="carte">${HTML_FILTRES}</div>`
    // Ailleurs : replié, on vient lire une page, pas refaire ses filtres.
    : `<details class="carte"><summary id="resume-filtres">Filtres</summary>${HTML_FILTRES}</details>`)
    + `<div class="vide" id="aucune" hidden>Aucune offre ne correspond à ces filtres. Recochez un métier, un type de contrat ou un niveau de poste.</div>`;

  const p = document.getElementById("pied");
  if (p) p.innerHTML =
    `<p style="margin:0 0 8px"><a href="mouvement.html#limites">Limites de ces chiffres</a></p>
     Chaîne : API France Travail → <code>scripts/extraire.py</code> → <code>data/brut/</code> (chaque version d'annonce, une seule fois) + <code>data/actives/</code> (les offres du jour) → <code>scripts/resumer.py</code> → <code>data/resume.json</code> → ces pages (GitHub Pages).
     Une Action GitHub relance la collecte chaque matin à 7 h. Identifiants dans les secrets du dépôt, jamais dans le code.
     Dépôt de démonstration — M2 MOD, IAE Clermont Auvergne, séminaires métiers.`;
}

/* ============================================================
   5) CHARGEMENT ET BOUCLE DE RENDU
   ============================================================ */
const Commun = {
  D: null,          // les données, une fois chargées
  f: null,          // l'état des filtres au dernier rendu
  lib: {},          // code ROME -> { libelle, groupe, … }
  rendre: null,     // le dessinateur de la page

  /* Tout ce qui est commun à chaque rendu : compteurs des cases, ligne de
     synthèse, mémorisation, puis la page dessine ses propres graphiques. */
  rafraichir() {
    const f = etatFiltres();
    Commun.f = f;
    const parMetier = D.offres.filter(o => f.metiers.has(o.rome));           // base des compteurs de filtres
    const offres = filtrer(f);
    const n = offres.length, total = D.offres.length;

    // Compteurs dans les cases de filtre + ligne de synthèse
    CONTRATS.forEach(([k]) => { const e = document.getElementById("nb-c-" + k); if (e) e.textContent = parMetier.filter(o => familleContrat(o) === k).length; });
    NIVEAUX.forEach(([k]) => { const e = document.getElementById("nb-n-" + k); if (e) e.textContent = parMetier.filter(o => niv(o) === k).length; });
    document.getElementById("compte").innerHTML = `<b>${n}</b> offre${n > 1 ? "s" : ""} sélectionnée${n > 1 ? "s" : ""} sur ${total} — ${f.metiers.size} métier${f.metiers.size > 1 ? "s" : ""} coché${f.metiers.size > 1 ? "s" : ""}.`;
    document.getElementById("aucune").hidden = n > 0;
    const resume = document.getElementById("resume-filtres");
    if (resume) resume.textContent = `Filtres (${f.metiers.size} métier${f.metiers.size > 1 ? "s" : ""}, ${n} offre${n > 1 ? "s" : ""})`;
    // Plus rien de sélectionné : le message dit « recochez un métier », le panneau replié
    // doit donc s'ouvrir. Sinon la page réclame une action dont elle cache les cases.
    if (n === 0) { const d = document.querySelector("details.carte"); if (d) d.open = true; }

    // Mémorisation des trois filtres ensemble : ils suivent d'une page à l'autre.
    try { localStorage.setItem("metiers-filtres", JSON.stringify({ metiers: [...f.metiers], contrats: [...f.contrats], niveaux: [...f.niveaux] })); } catch (e) {}

    Commun.rendre(offres, D);
  },

  /* rendre(offres, D) : rappelée au chargement puis à chaque changement de filtre.
     initier(D) : facultatif, une seule fois, avant le premier rendu. */
  demarrer(rendre, initier) {
    Commun.rendre = rendre;
    poserNavEtFiltres();
    // GitHub Pages met le JSON en cache 10 minutes : on le redemande frais à chaque chargement.
    fetch("data/resume.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
      if (!d.metiers || !d.offres) throw new Error("ancien format de resume.json — rechargez la page (Ctrl+F5)");
      D = d;
      Commun.D = d;
      Commun.lib = Object.fromEntries(d.metiers.map(m => [m.code, m]));
      if (Array.isArray(d.niveaux) && d.niveaux.length) NIVEAUX = d.niveaux.filter(x => Array.isArray(x) && x.length === 2);
      if (Array.isArray(d.formations) && d.formations.length) FORMATIONS = d.formations;

      const sous = document.getElementById("sous");
      if (sous) sous.innerHTML =
        `${d.source} · ${d.requete} · extraction du <b>${dateFr(d.date)}</b> · ${d.offres.length} offres actives, ${d.versions_conservees} versions d'annonces conservées`;

      let memo = null;
      try { memo = JSON.parse(localStorage.getItem("metiers-filtres")); } catch (e) {}
      if (!memo) { try { const vieux = JSON.parse(localStorage.getItem("metiers-coches")); if (Array.isArray(vieux)) memo = { metiers: vieux }; } catch (e) {} }
      const memoA = (cle, defaut) => (memo && Array.isArray(memo[cle])) ? memo[cle] : defaut;

      // --- Filtre métiers, par groupe ---
      const groupes = [...new Set(d.metiers.map(m => m.groupe))];
      const memoM = memo && Array.isArray(memo.metiers) ? memo.metiers : null;
      document.getElementById("metiers").innerHTML = groupes.map(g => `<h4 style="color:${COULEURS[g] || ""}">${g}</h4>` +
        d.metiers.filter(m => m.groupe === g).map(m =>
          `<label><input type="checkbox" value="${m.code}" data-groupe="${m.groupe}" ${(memoM ? memoM.includes(m.code) : m.coche) ? "checked" : ""}> ${m.libelle} <small>${m.code} · ${m.actives}</small></label>`).join("")).join("");
      // Une case par groupe : cocher/décocher le groupe entier, cumulables ; état intermédiaire si le groupe est partiel.
      document.getElementById("groupes").innerHTML = groupes.map(g =>
        `<label style="color:${COULEURS[g] || ""}"><input type="checkbox" data-groupe-case="${g}"> ${g}</label>`).join("");
      const majGroupes = () => document.querySelectorAll("[data-groupe-case]").forEach(c => {
        const cases = [...document.querySelectorAll(`#metiers input[data-groupe="${c.dataset.groupeCase}"]`)];
        const k = cases.filter(i => i.checked).length;
        c.checked = cases.length > 0 && k === cases.length; c.indeterminate = k > 0 && k < cases.length;
      });
      document.querySelectorAll("[data-groupe-case]").forEach(c => c.addEventListener("change", () => {
        document.querySelectorAll(`#metiers input[data-groupe="${c.dataset.groupeCase}"]`).forEach(i => { i.checked = c.checked; });
        majGroupes(); Commun.rafraichir();
      }));
      document.getElementById("metiers").addEventListener("change", () => { majGroupes(); Commun.rafraichir(); });
      document.querySelectorAll(".boutons button").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#metiers input").forEach(i => { i.checked = b.dataset.groupe === "tous"; });
        majGroupes(); Commun.rafraichir();
      }));
      majGroupes();

      // --- Filtre type de contrat ---
      const memoC = memoA("contrats", CONTRATS.map(x => x[0]));
      document.getElementById("f-contrats").innerHTML = CONTRATS.map(([k, l]) =>
        `<label><input type="checkbox" value="${k}" ${memoC.includes(k) ? "checked" : ""}> ${l} <small id="nb-c-${k}"></small></label>`).join("");
      // --- Filtre niveau de poste ---
      const memoN = memoA("niveaux", NIVEAUX.map(x => x[0]));
      document.getElementById("f-niveaux").innerHTML = NIVEAUX.map(([k, l]) =>
        `<label><input type="checkbox" value="${k}" ${memoN.includes(k) ? "checked" : ""}> <i class="pastille" style="background:${COUL_NIV[k]}"></i> ${l} <small id="nb-n-${k}"></small></label>`).join("");
      document.getElementById("f-contrats").addEventListener("change", Commun.rafraichir);
      document.getElementById("f-niveaux").addEventListener("change", Commun.rafraichir);

      if (initier) initier(d);
      Commun.rafraichir();
    }).catch(e => { const s = document.getElementById("sous"); if (s) s.textContent = "Impossible de lire data/resume.json : " + e; });
  },
};
