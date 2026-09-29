"""
Met les canaux côte à côte : data/canaux.json, que lit la page canaux.html.

    python scripts/resumer_canaux.py

Lit :
    data/resume.json          le canal France Travail (fait par resumer.py), résumé ici aux mêmes chiffres
    data/canaux/<canal>.json  un fichier par autre canal (fait par scripts/canal_<canal>.py)
    data/canaux/serie.csv     l'historique des autres canaux

Ajouter un canal = écrire scripts/canal_<nom>.py qui produit data/canaux/<nom>.json avec les
mêmes clés (n, par_metier, contrats, diplome, sources, departements, zones, fraicheur,
teletravail) : ce script et la page le prennent sans autre changement.
Aucune bibliothèque externe : seulement Python.
"""
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER = RACINE / "data" / "canaux"
SORTIE = RACINE / "data" / "canaux.json"

AURA = {"01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"}
IDF = {"75", "77", "78", "91", "92", "93", "94", "95"}
# Niveau de formation France Travail -> niveau européen, l'échelle de La bonne alternance.
NIVEAU_EUROPEEN = {"< Bac": "3", "Bac": "4", "Bac+2": "5", "Bac+3/4": "6", "Bac+5": "7"}


def famille_contrat(o):
    """Même règle que familleContrat() dans assets/commun.js : l'alternance passe devant le CDI/CDD."""
    c, nat = o.get("contrat") or "", o.get("nature") or ""
    if o.get("alternance") or nat in ("apprentissage", "professionnalisation"):
        return "Alternance"
    if c == "MIS":
        return "Intérim"
    if c in ("LIB", "FRA", "CCE") or nat == "non_salarie":
        return "Indépendant"
    return {"CDI": "CDI", "CDD": "CDD"}.get(c, "Autre")


def fraicheur(o, jour):
    try:
        jours = (jour - date.fromisoformat((o.get("date") or "")[:10])).days
    except ValueError:
        return "inconnue"
    return "moins de 7 jours" if jours < 7 else "7 à 30 jours" if jours < 30 else "1 à 3 mois" if jours < 90 else "plus de 3 mois"


def canal_france_travail(R):
    offres = R.get("offres", [])
    jour = date.fromisoformat(R["date"])
    deps = Counter(o.get("dep") or "inconnu" for o in offres)
    compter = lambda f: dict(Counter(f(o) for o in offres).most_common())
    alternance = [o for o in offres if famille_contrat(o) == "Alternance"]
    return {
        "code": "france-travail",
        "libelle": "France Travail",
        "date": R["date"],
        "source": R.get("source"),
        "requete": R.get("requete"),
        "n": len(offres),
        "postes": sum(int(o.get("postes") or 1) for o in offres),
        "par_metier": dict(Counter(o["rome"] for o in offres)),
        "alternance": len(alternance),
        "par_metier_alternance": dict(Counter(o["rome"] for o in alternance)),
        "contrats": compter(famille_contrat),
        "diplome": compter(lambda o: NIVEAU_EUROPEEN.get(o.get("formation"), "inconnu")),
        "sources": {"France Travail": len(offres)},
        "departements": dict(deps.most_common()),
        "zones": {"Puy-de-Dôme": deps.get("63", 0), "Auvergne-Rhône-Alpes": sum(deps.get(d, 0) for d in AURA),
                  "Île-de-France": sum(deps.get(d, 0) for d in IDF)},
        "fraicheur": compter(lambda o: fraicheur(o, jour)),
        "teletravail": compter(lambda o: "mentionné" if o.get("teletravail") else "non précisé"),
        "salaire_affiche": sum(1 for o in offres if o.get("smin") is not None),
    }


def main():
    R = json.loads((RACINE / "data" / "resume.json").read_text(encoding="utf-8"))
    metiers = [{"code": m["code"], "libelle": m["libelle"]} for m in R.get("metiers", [])]
    codes = {m["code"] for m in metiers}

    canaux = [canal_france_travail(R)]
    for f in sorted(DOSSIER.glob("*.json")):
        c = json.loads(f.read_text(encoding="utf-8"))
        c["par_metier"] = {k: v for k, v in c.get("par_metier", {}).items() if k in codes}
        canaux.append(c)

    # Historique : France Travail depuis resume.json, les autres depuis data/canaux/serie.csv.
    serie = [{"date": j["date"], "canal": "france-travail",
              "offres": sum(v for k, v in (j.get("par_metier") or {}).items() if k in codes)}
             for j in R.get("serie", [])]
    fichier_serie = DOSSIER / "serie.csv"
    if fichier_serie.exists():
        totaux = Counter()
        with fichier_serie.open(encoding="utf-8", newline="") as f:
            for l in csv.DictReader(f):
                if l["rome"] in codes:
                    totaux[(l["date"], l["canal"])] += int(l["offres"])
        serie += [{"date": d, "canal": c, "offres": n} for (d, c), n in sorted(totaux.items())]

    sortie = {"maj": date.today().isoformat(), "metiers": metiers, "canaux": canaux, "serie": serie}
    SORTIE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print("canaux : " + ", ".join(f"{c['libelle']} {c['n']} offres ({c['date']})" for c in canaux)
          + f" -> {SORTIE.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
