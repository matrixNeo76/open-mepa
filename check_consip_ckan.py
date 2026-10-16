#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MePA & Consip Desk Pro - Strumento di Ispezione Versioni Open Data CKAN
Interroga le API di dati.consip.it e confronta le release remote con i dati locali.

NON esegue download automatici pesanti: rileva dimensioni, formati e date di modifica
e propone un riepilogo decisionale chiaro per l'operatore.
"""

import json
import os
import sqlite3
import sys
import urllib.request
from datetime import datetime

CKAN_API_BASE = "https://dati.consip.it/api/3/action"
DB_NAME = "gare_consip.db"

TRACKED_PACKAGES = [
    {
        "id": "dataset-richieste-di-offerta-e-trattative-dirette-bandite-sul-mepa",
        "label": "RdO & Trattative Dirette MePA (Bandi e Gare)",
        "category": "Gare"
    },
    {
        "id": "gare-asp",
        "label": "Gare ASP Consip (Application Service Provider)",
        "category": "Gare"
    },
    {
        "id": "dataset-amministrazioni",
        "label": "Anagrafica Amministrazioni del Programma",
        "category": "Amministrazioni"
    },
    {
        "id": "dataset-contratti-stipulati-a-seguito-di-rdo-td-su-mepa",
        "label": "Contratti Stipulati MePA (Esiti & Aggiudicazioni)",
        "category": "Esiti"
    }
]

def get_remote_package_info(pkg_id):
    """Interroga l'API CKAN per un singolo package."""
    url = f"{CKAN_API_BASE}/package_show?id={pkg_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "MePA-Desk-Pro-Inspector/1.1"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("result", {})
    except Exception as e:
        return {"error": str(e)}

def get_local_db_stats():
    """Rileva statistiche del database locale SQLite."""
    stats = {"tenders": 0, "amm": 0, "cataloghi": 0, "size_mb": 0.0, "last_tender_date": None}
    if not os.path.exists(DB_NAME):
        return stats
    stats["size_mb"] = round(os.path.getsize(DB_NAME) / (1024 * 1024), 2)
    try:
        conn = sqlite3.connect(DB_NAME)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM gare")
        stats["tenders"] = cur.fetchone()[0]

        cur.execute("SELECT MAX(deadline) FROM gare")
        stats["last_tender_date"] = cur.fetchone()[0]

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='amministrazioni'")
        if cur.fetchone():
            cur.execute("SELECT COUNT(*) FROM amministrazioni")
            stats["amm"] = cur.fetchone()[0]

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cataloghi'")
        if cur.fetchone():
            cur.execute("SELECT COUNT(*) FROM cataloghi")
            stats["cataloghi"] = cur.fetchone()[0]

        conn.close()
    except Exception as e:
        stats["db_error"] = str(e)
    return stats

def inspect_all_ckan_datasets():
    """Esegue l'ispezione completa e restituisce il report strutturato."""
    local_stats = get_local_db_stats()
    report = {
        "timestamp": datetime.now().isoformat(),
        "local_database": {
            "file": DB_NAME,
            "exists": os.path.exists(DB_NAME),
            "size_mb": local_stats["size_mb"],
            "tenders_count": local_stats["tenders"],
            "amministrazioni_count": local_stats["amm"],
            "cataloghi_count": local_stats["cataloghi"]
        },
        "datasets": []
    }

    for item in TRACKED_PACKAGES:
        pkg_id = item["id"]
        remote = get_remote_package_info(pkg_id)
        if "error" in remote:
            report["datasets"].append({
                "id": pkg_id,
                "label": item["label"],
                "category": item["category"],
                "status": "ERRORE_CONNESSIONE",
                "error": remote["error"]
            })
            continue

        resources = []
        for r in remote.get("resources", []):
            raw_size = r.get("size") or 0
            size_mb = round(raw_size / (1024 * 1024), 2)
            resources.append({
                "name": r.get("name"),
                "format": (r.get("format") or "").upper(),
                "size_mb": size_mb,
                "created": r.get("created"),
                "last_modified": r.get("last_modified") or r.get("created"),
                "download_url": r.get("url")
            })

        report["datasets"].append({
            "id": pkg_id,
            "label": item["label"],
            "category": item["category"],
            "title": remote.get("title"),
            "metadata_modified": remote.get("metadata_modified"),
            "notes": (remote.get("notes") or "")[:180] + "...",
            "resources": resources
        })

    return report

def print_cli_report(report):
    """Stampa a terminale una vista chiara e formattata del report."""
    loc = report["local_database"]
    print("=" * 80)
    print("   MEPA & CONSIP DESK PRO - ISPEZIONE VERSIONI OPEN DATA CKAN")
    print("   Portale di riferimento: https://dati.consip.it")
    print(f"   Data controllo: {report['timestamp'][:19]}")
    print("=" * 80)
    print(f"\n[STATO LOCALE]")
    print(f"  Database SQLite: {loc['file']} ({loc['size_mb']} MB)")
    print(f"  Gare caricate:   {loc['tenders_count']}")
    print(f"  Amministrazioni: {loc['amministrazioni_count']}")
    print(f"  Articoli Cat.:   {loc['cataloghi_count']}")

    print("\n" + "-" * 80)
    print("[DATASET REMOTI DISPONIBILI SU DATI.CONSIP.IT]")
    print("-" * 80)

    for ds in report["datasets"]:
        if ds.get("status") == "ERRORE_CONNESSIONE":
            print(f"\n* {ds['label']}: ERRORE ({ds['error']})")
            continue

        mod_date = (ds.get("metadata_modified") or "N/D")[:10]
        print(f"\n* {ds['label']}")
        print(f"  Titolo Ufficiale:  {ds.get('title')}")
        print(f"  Ultima Modifica:   {mod_date}")
        print("  Risorse Disponibili:")
        
        # Mostra le prime 3 risorse (generalmente le più recenti 2026/2025)
        for r in ds.get("resources", [])[:4]:
            size_str = f"{r['size_mb']} MB" if r['size_mb'] > 0 else "Dim. non dichiarata"
            mod_r = (r.get("last_modified") or "")[:10]
            print(f"    - [{r['format']:<4}] {r['name'][:42]:<42} | {size_str:<12} | Agg: {mod_r}")

    print("\n" + "=" * 80)
    print("RACCOMANDAZIONE OPERATIVA:")
    print("1. I dataset Consip hanno cadenza di rilascio periodica (mensile/trimestrale).")
    print("2. Alcuni file (es. JSON o Cataloghi) superano i 25-50 MB: scaricare preferibilmente i file CSV.")
    print("3. Per aggiornare, scaricare il singolo CSV dal link CKAN e importarlo tramite il gestionale.")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    rep = inspect_all_ckan_datasets()
    if "--json" in sys.argv:
        print(json.dumps(rep, indent=2, ensure_ascii=False))
    else:
        print_cli_report(rep)
