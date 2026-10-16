import json
import sqlite3
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from consip_stream_ingestion import (
    clean_amount, clean_date, detect_category, detect_region, get_db
)

JSON_DIR = "json"
bandi_file = os.path.join(JSON_DIR, "bandiegare2026.json")

print(f"Aggiornamento classificazione geografica bandi da '{bandi_file}'...")
with open(bandi_file, "r", encoding="utf-8") as f:
    bandi_items = json.load(f)

conn = get_db()
cur = conn.cursor()
cur.execute("DELETE FROM gare;")

count_bandi = 0
for idx, item in enumerate(bandi_items):
    cig = item.get("Identificativo_Lotto") or f"BANDO_{idx+1}"
    title = item.get("Denominazione_Lotto") or item.get("#Denominazione_Bando") or "Gara MePA / Consip"
    authority = f"Consip S.p.A. ({item.get('#Denominazione_Bando', 'Bando Pubblico')})"
    amount = clean_amount(item.get("Base_Asta"))
    deadline = clean_date(item.get("Data_Termine") or item.get("Data_Pubblicazione"))
    cat = detect_category(item.get("Categoria_Merceologica") or title)
    reg = detect_region(f"{title} {item.get('#Denominazione_Bando', '')} {item.get('Categoria_Merceologica', '')}")
    source = item.get("Tipo_Strumento") or "Bandi e Gare"

    cur.execute("""
    INSERT OR REPLACE INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        f"BG_{cig}",
        cig.upper(),
        cat,
        reg,
        source,
        authority,
        title,
        amount,
        deadline,
        "Da Valutare",
        "Ufficio Gare",
        "https://www.acquistinretepa.it"
    ))
    count_bandi += 1

conn.commit()
print(f"Aggiornati con successo {count_bandi} bandi nel database.")

# Verifica rapida
cur.execute("SELECT region, count(*) FROM gare GROUP BY region ORDER BY count(*) DESC LIMIT 10")
for r in cur.fetchall():
    print(r)
conn.close()
