"""
Canal « La bonne alternance » : les offres en alternance, par l'API de l'État.

    python scripts/canal_lba.py

Clé : LBA_API_KEY, dans le fichier .env (local) ou dans les secrets du dépôt (GitHub).
Elle se crée sur https://api.apprentissage.beta.gouv.fr/compte/profil — choisir le type
« production » : une clé « sandbox » interroge l'environnement de test (offres fictives).
Sans clé, le script le dit et s'arrête sans rien écrire.

Ce que ça écrit :
    data/canaux/lba.json     les chiffres du jour : comptes et répartitions, jamais les offres
    data/canaux/serie.csv    une ligne par jour, par canal et par métier

Les offres elles-mêmes ne sont pas enregistrées : les CGU de l'API (art. 5.2) interdisent de
communiquer les données reçues à des tiers, et ce dépôt est public. Seuls les agrégats sortent.

API : https://api.apprentissage.beta.gouv.fr/fr/documentation-technique — route /job/v1/search,
60 appels par minute, 150 résultats au plus par source et par recherche. Quand une source
atteint ce plafond pour un métier, la recherche est refaite département par département.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extraire import METIERS, RACINE  # noqa: E402  (même liste de métiers, et lecture du .env)

API = "https://api.apprentissage.beta.gouv.fr/api/job/v1/search"
PLAFOND = 150        # résultats au plus par source et par recherche (documentation de l'API)
PAUSE = 1.1          # secondes entre deux appels : 60 par minute au plus
CANAL = "lba"
SORTIE = RACINE / "data" / "canaux" / "lba.json"
SERIE = RACINE / "data" / "canaux" / "serie.csv"

DEPARTEMENTS = ([f"{i:02d}" for i in range(1, 96) if i != 20]
                + ["2A", "2B", "971", "972", "973", "974", "976"])
AURA = {"01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"}
IDF = {"75", "77", "78", "91", "92", "93", "94", "95"}


def chercher(cle, rome, dep=None):
    """Un appel à /job/v1/search ; réessaie sur les erreurs passagères."""
    params = [("romes", rome)] + ([("departements", dep)] if dep else [])
    requete = urllib.request.Request(API + "?" + urllib.parse.urlencode(params),
                                     headers={"Authorization": "Bearer " + cle, "Accept": "application/json"})
    for essai in range(4):
        time.sleep(PAUSE)
        try:
            with urllib.request.urlopen(requete, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f"LBA : clé refusée (HTTP {e.code}). Vérifier le secret LBA_API_KEY (type « production »).")
            if e.code not in (419, 429, 500, 502, 503) or essai == 3:
                raise
        except urllib.error.URLError:
            if essai == 3:
                raise
        time.sleep(10 * (essai + 1))


def cle_offre(j):
    i = j.get("identifier") or {}
    return i.get("id") or f"{i.get('partner_label')}:{i.get('partner_job_id')}"


def source(j):
    return (j.get("identifier") or {}).get("partner_label") or "Non précisée"


def actives(reponse):
    return [j for j in (reponse or {}).get("jobs") or [] if (j.get("offer") or {}).get("status", "Active") == "Active"]


def au_plafond(jobs):
    return max(Counter(source(j) for j in jobs).values(), default=0) >= PLAFOND


def offres_du_metier(cle, rome):
    """Les offres actives d'un métier, France entière. Renvoie (offres, appels, encore_tronque)."""
    jobs = actives(chercher(cle, rome))
    if not au_plafond(jobs):
        return jobs, 1, False
    # Une source a rendu 150 offres : il y en a sans doute plus. On découpe par département.
    toutes, tronque = {}, False
    for dep in DEPARTEMENTS:
        lot = actives(chercher(cle, rome, dep))
        tronque = tronque or au_plafond(lot)
        for j in lot:
            toutes[cle_offre(j)] = j
    return list(toutes.values()), 1 + len(DEPARTEMENTS), tronque


def departement(j):
    """Département tiré du code postal de l'adresse du lieu de travail."""
    adresse = ((j.get("workplace") or {}).get("location") or {}).get("address") or ""
    codes = re.findall(r"\b(\d{5})\b", adresse)
    if not codes:
        return "inconnu"
    cp = codes[-1]
    if cp.startswith("97"):
        return cp[:3]
    if cp.startswith("20"):
        return "2A" if cp < "20200" else "2B"
    return cp[:2]


def type_contrat(j):
    types = set(((j.get("contract") or {}).get("type")) or [])
    if {"Apprentissage", "Professionnalisation"} <= types:
        return "Apprentissage ou professionnalisation"
    return next(iter(types)) if types else "Non précisé"


def fraicheur(j, jour):
    creation = ((j.get("offer") or {}).get("publication") or {}).get("creation") or ""
    try:
        jours = (jour - date.fromisoformat(creation[:10])).days
    except ValueError:
        return "inconnue"
    return "moins de 7 jours" if jours < 7 else "7 à 30 jours" if jours < 30 else "1 à 3 mois" if jours < 90 else "plus de 3 mois"


def ids_france_travail():
    """Identifiants des offres du canal France Travail, pour mesurer le recouvrement."""
    f = RACINE / "data" / "resume.json"
    if not f.exists():
        return set()
    return {o["id"] for o in json.loads(f.read_text(encoding="utf-8")).get("offres", [])}


def ecrire_serie(jour, par_metier):
    lignes = []
    if SERIE.exists():
        with SERIE.open(encoding="utf-8", newline="") as f:
            lignes = [l for l in csv.DictReader(f) if not (l["date"] == jour and l["canal"] == CANAL)]
    lignes += [{"date": jour, "canal": CANAL, "rome": r, "offres": n} for r, n in par_metier.items()]
    with SERIE.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "canal", "rome", "offres"])
        w.writeheader()
        w.writerows(lignes)


def main():
    cle = os.environ.get("LBA_API_KEY", "").strip()
    if not cle:
        print("LBA : pas de clé LBA_API_KEY — canal ignoré, rien n'est écrit.")
        return
    aujourd_hui = date.today()
    jour = aujourd_hui.isoformat()

    par_metier, uniques, appels, tronques = {}, {}, 0, []
    for rome, (libelle, _, _) in METIERS.items():
        jobs, n_appels, tronque = offres_du_metier(cle, rome)
        appels += n_appels
        if tronque:
            tronques.append(rome)
        par_metier[rome] = len({cle_offre(j) for j in jobs})
        for j in jobs:
            uniques.setdefault(cle_offre(j), j)
        print(f"LBA {rome} {libelle} : {par_metier[rome]} offres ({n_appels} appel(s){', encore tronqué' if tronque else ''})")

    offres = list(uniques.values())
    deps = Counter(departement(j) for j in offres)
    ft = ids_france_travail()
    venues_ft = [j for j in offres if "france travail" in source(j).lower()]
    compter = lambda f: dict(Counter(f(j) for j in offres).most_common())

    resume = {
        "code": CANAL,
        "libelle": "La bonne alternance",
        "date": jour,
        "source": "API La bonne alternance (api.apprentissage.beta.gouv.fr) — /job/v1/search",
        "requete": "une recherche par code ROME, France entière, découpée par département quand une source atteint 150 offres",
        "appels": appels,
        "tronques": tronques,
        "n": len(offres),
        "postes": sum(int((j.get("offer") or {}).get("opening_count") or 1) for j in offres),
        "par_metier": par_metier,
        "contrats": compter(type_contrat),
        "diplome": compter(lambda j: (((j.get("offer") or {}).get("target_diploma")) or {}).get("european") or "inconnu"),
        "sources": compter(source),
        "departements": dict(deps.most_common()),
        "zones": {"Puy-de-Dôme": deps.get("63", 0), "Auvergne-Rhône-Alpes": sum(deps.get(d, 0) for d in AURA),
                  "Île-de-France": sum(deps.get(d, 0) for d in IDF)},
        "fraicheur": compter(lambda j: fraicheur(j, aujourd_hui)),
        "teletravail": compter(lambda j: (j.get("contract") or {}).get("remote") or "non précisé"),
        "taille": compter(lambda j: (j.get("workplace") or {}).get("size") or "non précisée"),
        "venues_de_france_travail": len(venues_ft),
        "retrouvees_dans_france_travail": sum(1 for j in venues_ft if (j.get("identifier") or {}).get("partner_job_id") in ft),
    }
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(resume, ensure_ascii=False, indent=1), encoding="utf-8")
    ecrire_serie(jour, par_metier)
    print(f"LBA : {len(offres)} offres uniques, {appels} appels -> {SORTIE.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
