# Le marché de mon métier — les métiers du marketing

### 👉 **[Voir le site : ninon-iaeclf.github.io/metier](https://ninon-iaeclf.github.io/metier/)**

Fork du dépôt [VincentFavarin/metier](https://github.com/VincentFavarin/metier) : seuls les **8 métiers du
marketing** sont gardés, et un **deuxième canal de recrutement** est ajouté (La bonne alternance),
pour comparer les offres selon le canal. Les liens des pages ci-dessous mènent au site d'origine.

Le site est mis à jour chaque matin par une Action GitHub : elle interroge
l'API France Travail, enregistre les offres du jour et publie les chiffres.

| | |
|---|---|
| [Accueil](https://vincentfavarin.github.io/metier/) | les filtres, les chiffres, la carte de France |
| [Ce que ça paie](https://vincentfavarin.github.io/metier/salaires.html) | fourchettes par niveau, métier, contrat, territoire |
| [Ce qu'on vous demande](https://vincentfavarin.github.io/metier/exigences.html) | expérience, diplôme, outils, compétences |
| [Qui recrute](https://vincentfavarin.github.io/metier/recruteurs.html) | entreprises, secteurs, employeurs ouverts aux débutants |
| [Le marché bouge](https://vincentfavarin.github.io/metier/mouvement.html) | les extractions successives, la fraîcheur des annonces |
| [Par canal](https://ninon-iaeclf.github.io/metier/canaux.html) | France Travail et La bonne alternance côte à côte (ce fork) |

Dossier de travail pour la séance « Écouter le marché de votre métier »
(M2 MOD, IAE Clermont Auvergne). Dépôt de démonstration : il montre ce que
l'on attend d'un dossier `avenir`, étape par étape, et la chaîne complète
API → données → Action planifiée → page GitHub Pages.

## Le métier, tel que le marché le nomme

- **Intitulé principal** : chargé / chargée de marketing digital
- **Variantes rencontrées dans les offres** : chef de projet marketing digital,
  chef de produit digital, traffic manager, CRM manager, chargé d'acquisition
- **Code ROME** : **M1718** — Chargé / Chargée de marketing digital
  (le README disait M1705 « Marketing » ; c'est la première extraction qui a
  donné le bon code : 14 offres sur 22 étaient en M1718)

## Les questions que je pose à ce marché

1. Combien d'offres, et où : Clermont / Puy-de-Dôme, Auvergne-Rhône-Alpes,
   France, télétravail ?
2. Quels contrats et quels salaires affichés ?
3. Quels outils et compétences reviennent le plus — et lesquels la formation
   ne me donnera pas ?
4. Quelles entreprises publient le plus cet intitulé ?

## Ce que la première journée a appris (22/09/2026)

Trois requêtes, même jour, même API :

| Requête | Offres | Lecture |
|---|---|---|
| `motsCles = "chef de projet marketing digital"` | 22 | trop étroit, et du bruit (PMO, communication) |
| `codeROME = M1718` | 113 | le référentiel : homogène, c'est la requête de la veille |
| `motsCles = "marketing digital"` | 424 | large, mais 191 annonces identiques d'un même réseau (M1716) : à dédoublonner avant de compter |

Sur M1718 : 0 offre dans le 63, 11 en Auvergne-Rhône-Alpes, Paris et
Hauts-de-Seine en tête ; 27 % des offres affichent un salaire, médiane
31 000 → 35 700 € annuels ; réseaux sociaux, anglais, SEO/SEA, GA4 et
« IA » reviennent le plus.

## Les métiers suivis

23 codes ROME, choisis pour le M2 MOD parmi les 1 911 du référentiel France
Travail (la liste vit dans `scripts/extraire.py`, `METIERS`) : le cœur
marketing (M1718 chargé de marketing digital, M1716, M1705, M1703, M1620,
M1706, M1430, M1711), le digital (E1113 e-commerce, D1438, E1101 community
manager, E1124, E1405 SEO, M1886, M1426, M1719 et E1406 influence — 0 offre
aujourd'hui, on surveille) et, décochés par défaut, la frontière avec la
communication et le commerce (E1112, E1103, E1107, E1404, D1506, D1415 CRM).
Au 22/09/2026 : 3 362 offres actives.

## La chaîne

```
API France Travail  →  scripts/extraire.py  →  data/brut/<mois>/<ROME>.jsonl   chaque version d'annonce, une seule fois
                                            →  data/actives/<date>.csv         les offres actives du jour (rome, id)
                                            →  data/serie.csv                  par jour et par métier : total, nouvelles, modifiées
                       scripts/resumer.py   →  data/resume.json                ce que les pages affichent (+ data/geo/, cache des positions)
                       index.html + 4 pages →  https://vincentfavarin.github.io/metier/
                       .github/workflows/veille.yml : GitHub relance tout ça chaque matin à 7 h
```

- `scripts/extraire.py` — une requête `codeROME` par métier (token OAuth,
  pagination 150 / 1 150, total lu dans `Content-Range`). Le **brut est
  conservé intégralement** : une offre est écrite la première fois qu'on la
  voit, et de nouveau si son contenu change (empreinte SHA-1 du JSON, hors
  `dateActualisation`) — l'évolution d'une annonce est donc gardée, version
  par version. Relancer le même jour n'écrit rien deux fois.
- `scripts/resumer.py` — retravaille le brut des offres actives : salaires
  (libellé texte → min/max annuels bruts), outils cités dans les descriptions
  (grille à adapter), position (lat/lon de l'API, sinon centre de la commune
  via geo.api.gouv.fr, sinon ville principale du département).
- Cinq pages HTML statiques, un chantier par page, toutes servies telles quelles.
  Chacune charge `data/resume.json` et recalcule ses graphiques Chart.js dans le
  navigateur selon la sélection ; net mensuel estimé = brut × 0,78 / 12.
  - `index.html` — les filtres, les chiffres-clés, la carte Leaflet (survol =
    l'offre, clic = l'annonce sur France Travail), les départements, les
    contrats, et les liens vers les quatre autres pages.
  - `salaires.html` — ce que ça paie. `exigences.html` — ce qu'on vous demande.
    `recruteurs.html` — qui recrute. `mouvement.html` — le marché bouge, et les
    limites de ces chiffres (ancre `#limites`, liée depuis chaque pied de page).
- `assets/commun.js` et `assets/commun.css` — ce que les cinq pages partagent :
  chargement des données, panneau de filtres (mémorisé dans `localStorage`,
  replié ailleurs que sur l'accueil), barre de navigation, utilitaires et
  fabriques de graphiques. Une page ne contient que son HTML et son petit
  script `rendre(offres, D)`.

## Volume et limites GitHub

Jour 1 : 13 Mo de brut ; ensuite seulement le flux (nouvelles et modifiées),
de l'ordre de 2 à 3 Mo par jour, soit ~1 Go par an. GitHub gratuit : dépôt
1 Go recommandé, fichier ≤ 100 Mo, Pages 1 Go publié et 100 Go/mois de bande
passante, Actions illimitées sur un dépôt public. Quand le brut dépassera
quelques centaines de Mo, l'Action archivera chaque mois écoulé (compressé)
dans les Releases du dépôt ou sur Hugging Face Datasets, et le dépôt ne
gardera que les derniers mois.

## Faire tourner chez soi

```
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env        (puis remplir avec ses identifiants francetravail.io)
.venv\Scripts\python.exe scripts\extraire.py --verifier
.venv\Scripts\python.exe scripts\extraire.py
.venv\Scripts\python.exe scripts\resumer.py
.venv\Scripts\python.exe -m http.server 8125      (puis http://localhost:8125)
```

## Faire tourner sans soi (GitHub)

1. Dépôt **public** (GitHub Pages gratuit ne fonctionne que sur un dépôt public).
2. Settings → Secrets and variables → Actions : `FT_CLIENT_ID` et `FT_CLIENT_SECRET`.
3. Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Actions → veille → Run workflow : le premier commit du bot arrive dans `data/`.

## Règles

- Les identifiants sont dans `.env` (local) ou dans les secrets du dépôt
  (GitHub) : jamais dans un fichier versionné.
- Un canal, une requête, une date : chaque chiffre du site les affiche.
- Pas de scraping de LinkedIn, APEC ou Indeed (interdit par leurs CGU).

## Les canaux (ajout de ce fork)

Un canal = une source d'offres interrogée automatiquement par une **API officielle**. Les sites
qui l'interdisent dans leurs CGU (LinkedIn, Indeed, HelloWork, Welcome to the Jungle, APEC) ne sont
pas collectés : leurs offres peuvent seulement être relevées à la main dans `offres-reperees.md`.

| Canal | Script | Clé (secret du dépôt) | Ce qui est publié |
|---|---|---|---|
| France Travail | `scripts/extraire.py` + `scripts/resumer.py` | `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | les offres (licence de l'API) |
| La bonne alternance | `scripts/canal_lba.py` | `LBA_API_KEY` (type « production ») | **les chiffres seulement** : les CGU interdisent de communiquer les offres à des tiers |

```
scripts/canal_lba.py      →  data/canaux/lba.json      les chiffres du jour du canal
                          →  data/canaux/serie.csv     une ligne par jour, par canal, par métier
scripts/resumer_canaux.py →  data/canaux.json          tous les canaux côte à côte → canaux.html
.github/workflows/canaux.yml : chaque matin à 7 h 30, après la veille ; sans clé, le canal est sauté
```

Ajouter un canal : écrire `scripts/canal_<nom>.py` qui produit `data/canaux/<nom>.json` avec les
mêmes clés (`n`, `par_metier`, `contrats`, `diplome`, `sources`, `zones`, `fraicheur`…), l'appeler
dans `canaux.yml` ; `resumer_canaux.py` et la page le prennent sans autre changement.
