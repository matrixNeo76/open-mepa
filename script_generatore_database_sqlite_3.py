#!/usr/bin/env python3
"""
MePA & Consip Desk Pro - Backend Engine & Database SQLite 3
Genera il database relazionale 'gare_consip.db' ed avvia il server REST
per collegare l'interfaccia web e garantire la persistenza dei dati.

Utilizzo:
  python script_generatore_database_sqlite_3.py              # Avvia il server locale su http://127.0.0.1:8000
  python script_generatore_database_sqlite_3.py --build-only # Genera/rigenera solo il database e termina
"""

import sys
import os
import sqlite3
import json
import csv
import tempfile
import urllib.request
import ssl
import re
import datetime
import socket
import ipaddress
from datetime import datetime as dt, timedelta, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_NAME = "gare_consip.db"
HTML_FILE = "index.html" if os.path.exists("index.html") else "gestionale_bandi_mepa_open_data_consip.html"
DEFAULT_PORT = 8050
DEFAULT_HOST = "0.0.0.0"
VALID_STATUSES = ("Da Valutare", "In Lavorazione", "Inviata", "Vinta", "Persa", "Scartata")

SAMPLE_RECORDS = [
    (
        "T1",
        "A045B891C1",
        "IT",
        "Emilia-Romagna",
        "Bandi e Gare",
        "Comune di Bologna - Settore Transizione Digitale",
        "Fornitura server rack, licenze e apparati di rete per potenziamento data center comunale",
        86500.00,
        "2026-10-19T12:00",
        "In Lavorazione",
        "Ing. Rossi",
        "https://www.acquistinretepa.it"
    ),
    (
        "T2",
        "B129F447E2",
        "IT",
        "Lazio",
        "RdO MePA",
        "ASL Roma 1 - UOC Tecnologie Informatiche",
        "Servizi di manutenzione evolutiva applicativi sanitari e workstation grafiche per telemedicina",
        142000.00,
        "2026-10-22T18:00",
        "In Lavorazione",
        "Dott.ssa Bianchi",
        "https://www.acquistinretepa.it"
    ),
    (
        "T3",
        "C7829910D4",
        "CANCELLERIA",
        "Veneto",
        "RdO MePA",
        "Università degli Studi di Padova",
        "Fornitura carta ecologica per fotocopiatori ad alta tiratura e materiale di cancelleria didattica",
        34500.00,
        "2026-10-18T14:00",
        "Da Valutare",
        "Marco N.",
        "https://www.acquistinretepa.it"
    ),
    (
        "T4",
        "98741235AA",
        "IT",
        "Toscana",
        "Gare ASP",
        "Regione Toscana - Direzione Gare",
        "RdO Aperta: Servizio di supporto Help Desk e gestione parco PC e postazioni di lavoro",
        320000.00,
        "2026-11-20T12:00",
        "Inviata",
        "Team Gare",
        "https://www.acquistinretepa.it"
    ),
    (
        "T5",
        "96582314FF",
        "CANCELLERIA",
        "Lazio",
        "Bandi e Gare",
        "Ministero della Giustizia",
        "Fornitura toner, consumabili e apparati di stampa a basso impatto ambientale (CAM Cancelleria)",
        54000.00,
        "2026-10-24T12:00",
        "Vinta",
        "Ing. Rossi",
        "https://www.acquistinretepa.it"
    ),
    (
        "T6",
        "D9041285E7",
        "SANITA",
        "Lombardia",
        "Gare ASP",
        "ASST Grande Ospedale Metropolitano Niguarda",
        "Fornitura reagenti di laboratorio e dispositivi diagnostici monouso",
        215000.00,
        "2026-11-12T16:00",
        "Da Valutare",
        "Gare Sanità",
        "https://www.acquistinretepa.it"
    ),
    (
        "T7",
        "E4519028A1",
        "CANCELLERIA",
        "Piemonte",
        "RdO MePA",
        "Città Metropolitana di Torino",
        "Fornitura carta formato A4 e A3 ecologica certificata Ecolabel per gli istituti scolastici",
        48000.00,
        "2026-10-20T10:00",
        "In Lavorazione",
        "Ufficio Acquisti",
        "https://www.acquistinretepa.it"
    )
]

def init_database(force_recreate=False):
    """Crea la tabella e inserisce i dati iniziali se non presenti."""
    if force_recreate and os.path.exists(DB_NAME):
        os.remove(DB_NAME)

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gare (
        id TEXT PRIMARY KEY,
        cig TEXT UNIQUE,
        category TEXT,
        region TEXT,
        source TEXT,
        authority TEXT,
        title TEXT,
        amount REAL,
        deadline TEXT,
        status TEXT,
        owner TEXT,
        link TEXT
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cig ON gare(cig);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_category ON gare(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deadline ON gare(deadline);")

    # Tabella per Workflow Deterministico / Wizard 4 Fasi
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gare_workflow (
        gara_id TEXT PRIMARY KEY,
        current_step INTEGER DEFAULT 1,
        step1_data TEXT DEFAULT '{}',
        step2_data TEXT DEFAULT '{}',
        step3_data TEXT DEFAULT '{}',
        step4_data TEXT DEFAULT '{}',
        updated_at TEXT,
        FOREIGN KEY (gara_id) REFERENCES gare(id) ON DELETE CASCADE
    );
    """)

    # Tabella Note e Diario di Bordo per singola gara (Milestone 4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS note_gare (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gara_id TEXT NOT NULL,
        author TEXT DEFAULT 'Operatore Gare',
        category TEXT DEFAULT 'GENERALE',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (gara_id) REFERENCES gare(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_note_gara_id ON note_gare(gara_id);")

    # Tabella Tracciamento Allegati CAdES e Ricevute di Gara (Milestone 4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS allegati_gare (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gara_id TEXT NOT NULL,
        busta TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_type TEXT DEFAULT 'PDF_P7M',
        signed_cades BOOLEAN DEFAULT 1,
        timestamp_verified BOOLEAN DEFAULT 0,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (gara_id) REFERENCES gare(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_allegati_gara_id ON allegati_gare(gara_id);")

    # Tabella Cataloghi Beni & Servizi MePA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cataloghi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iniziativa TEXT,
        lotto_cig TEXT,
        lotto_nome TEXT,
        categoria TEXT,
        cpv TEXT,
        cpv_desc TEXT,
        prodotto TEXT,
        dettaglio TEXT,
        strumento TEXT,
        disponibile TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cat_cpv ON cataloghi(cpv);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cat_iniz ON cataloghi(iniziativa);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cat_prod ON cataloghi(prodotto);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cat_lotto ON cataloghi(lotto_cig);")

    # Tabella Anagrafica Amministrazioni Pubbliche
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS amministrazioni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipa TEXT UNIQUE,
        codice_fiscale TEXT,
        denominazione TEXT,
        tipologia TEXT,
        regione TEXT,
        provincia TEXT,
        comune TEXT,
        po_attivi INTEGER
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_amm_ipa ON amministrazioni(ipa);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_amm_cf ON amministrazioni(codice_fiscale);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_amm_reg ON amministrazioni(regione);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_amm_den ON amministrazioni(denominazione);")

    # Tabella Albo Operatori Economici & Fornitori MePA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS operatori_economici (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partita_iva TEXT UNIQUE,
        ragione_sociale TEXT,
        forma_societaria TEXT,
        nazione TEXT DEFAULT 'ITALIA',
        regione TEXT,
        provincia TEXT,
        comune TEXT,
        indirizzo TEXT,
        numero_aggiudicazioni INTEGER DEFAULT 0,
        numero_abilitazioni INTEGER DEFAULT 0,
        numero_transazioni INTEGER DEFAULT 0,
        contratti_attivi INTEGER DEFAULT 0
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oe_piva ON operatori_economici(partita_iva);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oe_ragione ON operatori_economici(ragione_sociale);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oe_regione ON operatori_economici(regione);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oe_provincia ON operatori_economici(provincia);")

    # Tabella Contratti e Spesa Reale
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contratti_stipulati (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anno INTEGER,
        tipologia_amministrazione TEXT,
        regione_fornitore TEXT,
        regione_pa TEXT,
        provincia_pa TEXT,
        tipo_negoziazione TEXT,
        n_negoziazioni INTEGER DEFAULT 0,
        n_contratti INTEGER DEFAULT 0,
        valore_base_asta REAL DEFAULT 0,
        valore_stipulato REAL DEFAULT 0,
        durata_media REAL DEFAULT 0
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cs_anno ON contratti_stipulati(anno);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cs_reg_pa ON contratti_stipulati(regione_pa);")


    # Controlla se ci sono già record
    cursor.execute("SELECT COUNT(*) FROM gare")
    count = cursor.fetchone()[0]

    if count == 0:
        cursor.executemany("""
        INSERT OR IGNORE INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, SAMPLE_RECORDS)
        conn.commit()
        cursor.execute("SELECT COUNT(*) FROM gare")
        count = cursor.fetchone()[0]

    conn.close()
    file_size_kb = os.path.getsize(DB_NAME) / 1024
    print(f"[SQLite 3] Database '{DB_NAME}' pronto. Record: {count} | Dimensione: {file_size_kb:.2f} KB")
    return count

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def generate_ics_content(tenders):
    """Genera stringa conforme a RFC 5545 iCalendar per scadenze gare."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//MePA and Consip Desk Pro//Scadenziario Gare//IT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
    ]
    now_str = dt.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for t in tenders:
        cig = t.get("cig") or t.get("id") or "GARA"
        title = (t.get("title") or "Procedura MePA").replace("\n", " ").replace(";", r"\;").replace(",", r"\,")
        authority = (t.get("authority") or "Stazione Appaltante").replace("\n", " ").replace(";", r"\;").replace(",", r"\,")
        deadline_str = t.get("deadline") or ""
        dt_obj = None
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
            try:
                dt_obj = dt.strptime(deadline_str[:19], fmt)
                break
            except Exception:
                pass
        if not dt_obj:
            continue
        dtstart = dt_obj.strftime("%Y%m%dT%H%M%S")
        dtend = (dt_obj + timedelta(hours=1)).strftime("%Y%m%dT%H%M%S")
        amount_fmt = f"{float(t.get('amount') or 0):,.2f} EUR"
        link = t.get("link") or "https://www.acquistinretepa.it"

        lines.extend([
            "BEGIN:VEVENT",
            f"UID:mepa-{cig}-{dtstart}@mepadesk.local",
            f"DTSTAMP:{now_str}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:[MePA Scadenza] {cig} - {title[:50]}",
            f"DESCRIPTION:CIG: {cig}\nEnte: {authority}\nImporto: {amount_fmt}\nPortale: {link}\nNote: Verificare firma digitale CAdES (.p7m) delle 3 buste.",
            "LOCATION:www.acquistinretepa.it",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:Promemoria Scadenza MePA CIG {cig}",
            "TRIGGER:-P1D",
            "END:VALARM",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:URGENTE Scadenza Offerta MePA CIG {cig}",
            "TRIGGER:-PT3H",
            "END:VALARM",
            "END:VEVENT"
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

def is_local_origin(origin):
    """True se l'header Origin proviene da localhost o da un IP privato di rete LAN (RFC 1918)."""
    if not origin:
        return True
    try:
        host = urlparse(origin).hostname
        if not host:
            return False
        if host in ("127.0.0.1", "localhost", "::1"):
            return True
        try:
            ip = ipaddress.ip_address(host)
            return ip.is_private or ip.is_loopback
        except ValueError:
            return False
    except Exception:
        return False

# ==============================================================================
# MOTORE STREAMING INGESTION AD ALTE PRESTAZIONI (Zero limiti memoria / 600MB+)
# ==============================================================================

def clean_amount(val):
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("€", "").replace(" ", "")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0

def clean_date(val):
    if not val:
        return "2026-12-31T12:00"
    s = str(val).strip()
    if "T" in s:
        return s[:16]
    parts = s.replace("/", "-").split("-")
    if len(parts) == 3:
        if len(parts[0]) == 4:
            return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}T12:00"
        elif len(parts[2]) == 4:
            return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}T12:00"
    return "2026-12-31T12:00"

def detect_category(txt):
    if not txt:
        return "ALTRO"
    t = str(txt).lower()
    if any(k in t for k in ["informatic", "software", "hardware", "server", "pc", "cloud", "telecomunicazion", "digitale", "ict", "rete"]):
        return "IT"
    if any(k in t for k in ["cancelleria", "carta", "toner", "cartucce", "consumabil", "stampant", "fogli"]):
        return "CANCELLERIA"
    if any(k in t for k in ["sanit", "medical", "ospedal", "farmac", "dispositiv", "reagent", "paramedic"]):
        return "SANITA"
    if any(k in t for k in ["arred", "mobil", "sedie", "scrivanie", "scaffal", "armadi"]):
        return "ARREDI"
    if any(k in t for k in ["energi", "luce", "gas", "elettric", "combustibil"]):
        return "ENERGIA"
    return "ALTRO"

REGIONS_ITALY = {
    'Abruzzo': ['abruzzo', 'pescara', 'chieti', 'teramo', "l'aquila"],
    'Basilicata': ['basilicata', 'potenza', 'matera'],
    'Calabria': ['calabria', 'catanzaro', 'cosenza', 'reggio calabria', 'crotone', 'vibo'],
    'Campania': ['campania', 'napoli', 'salerno', 'caserta', 'avellino', 'benevento'],
    'Emilia-Romagna': ['emilia', 'romagna', 'bologna', 'modena', 'parma', 'reggio emilia', 'ravenna', 'ferrara', 'rimini', 'forlì', 'forli', 'piacenza', 'cesena'],
    'Friuli-Venezia Giulia': ['friuli', 'venezia giulia', 'trieste', 'udine', 'pordenone', 'gorizia'],
    'Lazio': ['lazio', 'roma', 'latina', 'frosinone', 'viterbo', 'rieti'],
    'Liguria': ['liguria', 'genova', 'la spezia', 'savona', 'imperia'],
    'Lombardia': ['lombardia', 'milano', 'bergamo', 'brescia', 'monza', 'como', 'varese', 'pavia', 'cremona', 'mantova', 'lecco', 'lodi', 'sondrio'],
    'Marche': ['marche', 'ancona', 'pesaro', 'macerata', 'ascoli', 'fermo', 'urbino'],
    'Molise': ['molise', 'campobasso', 'isernia'],
    'Piemonte': ['piemonte', 'torino', 'novara', 'alessandria', 'cuneo', 'asti', 'vercelli', 'biella'],
    'Puglia': ['puglia', 'bari', 'taranto', 'lecce', 'foggia', 'brindisi', 'barletta', 'andria', 'trani'],
    'Sardegna': ['sardegna', 'cagliari', 'sassari', 'nuoro', 'oristano', 'olbia'],
    'Sicilia': ['sicilia', 'palermo', 'catania', 'messina', 'siracusa', 'trapani', 'agrigento', 'caltanissetta', 'enna', 'ragusa'],
    'Toscana': ['toscana', 'firenze', 'pisa', 'livorno', 'arezzo', 'siena', 'lucca', 'prato', 'pistoia', 'massa', 'carrara', 'grosseto'],
    'Trentino-Alto Adige': ['trentino', 'alto adige', 'sudtirol', 'südtirol', 'trento', 'bolzano'],
    'Umbria': ['umbria', 'perugia', 'terni'],
    "Valle d'Aosta": ["valle d'aosta", "val d'aosta", "aosta"],
    'Veneto': ['veneto', 'venezia', 'verona', 'padova', 'vicenza', 'treviso', 'rovigo', 'belluno']
}

def detect_region(txt):
    if not txt:
        return "Nazionale"
    t = str(txt).lower()
    matched = set()
    for reg, keywords in REGIONS_ITALY.items():
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw) + r'\b', t):
                matched.add(reg)
                break
    if not matched or len(matched) >= 15:
        return "Nazionale"
    return ", ".join(sorted(matched))

def stream_process_file_data(file_path, original_filename, target="gare", mode="dedup"):
    """Ingestion ad alte prestazioni riga per riga per file anche fino a 600MB+."""
    fn_lower = original_filename.lower()
    
    if target == "auto" or not target:
        if "catalog" in fn_lower:
            target = "cataloghi"
        elif "amministraz" in fn_lower:
            target = "amministrazioni"
        elif "operator" in fn_lower:
            target = "operatori"
        elif "acquist" in fn_lower or "contratt" in fn_lower or "stipulate" in fn_lower:
            target = "acquisti"
        else:
            target = "gare"

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS cataloghi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iniziativa TEXT,
        lotto_cig TEXT,
        lotto_nome TEXT,
        categoria TEXT,
        cpv TEXT,
        cpv_desc TEXT,
        prodotto TEXT,
        dettaglio TEXT,
        strumento TEXT,
        disponibile TEXT
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cat_cpv ON cataloghi(cpv);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cat_iniz ON cataloghi(iniziativa);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cat_prod ON cataloghi(prodotto);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cat_lotto ON cataloghi(lotto_cig);")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS amministrazioni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipa TEXT UNIQUE,
        codice_fiscale TEXT,
        denominazione TEXT,
        tipologia TEXT,
        regione TEXT,
        provincia TEXT,
        comune TEXT,
        po_attivi INTEGER
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_amm_ipa ON amministrazioni(ipa);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_amm_cf ON amministrazioni(codice_fiscale);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_amm_reg ON amministrazioni(regione);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_amm_den ON amministrazioni(denominazione);")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS operatori_economici (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partita_iva TEXT UNIQUE,
        ragione_sociale TEXT,
        forma_societaria TEXT,
        nazione TEXT DEFAULT 'ITALIA',
        regione TEXT,
        provincia TEXT,
        comune TEXT,
        indirizzo TEXT,
        numero_aggiudicazioni INTEGER DEFAULT 0,
        numero_abilitazioni INTEGER DEFAULT 0,
        numero_transazioni INTEGER DEFAULT 0,
        contratti_attivi INTEGER DEFAULT 0
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_oe_piva ON operatori_economici(partita_iva);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_oe_ragione ON operatori_economici(ragione_sociale);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_oe_regione ON operatori_economici(regione);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_oe_provincia ON operatori_economici(provincia);")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS contratti_stipulati (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anno INTEGER,
        tipologia_amministrazione TEXT,
        regione_fornitore TEXT,
        regione_pa TEXT,
        provincia_pa TEXT,
        tipo_negoziazione TEXT,
        n_negoziazioni INTEGER DEFAULT 0,
        n_contratti INTEGER DEFAULT 0,
        valore_base_asta REAL DEFAULT 0,
        valore_stipulato REAL DEFAULT 0,
        durata_media REAL DEFAULT 0
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cs_anno ON contratti_stipulati(anno);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cs_reg_pa ON contratti_stipulati(regione_pa);")

    processed = 0

    if fn_lower.endswith(".json"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        records = data if isinstance(data, list) else data.get("records", data.get("data", []))
        if target == "gare":
            if mode == "replace":
                cur.execute("DELETE FROM gare")
            cur.execute("BEGIN TRANSACTION;")
            for r in records:
                cig = (r.get("cig") or r.get("Identificativo_Lotto") or r.get("CIG") or "").strip().upper()
                if not cig:
                    continue
                title = r.get("title") or r.get("Denominazione_Lotto") or r.get("Oggetto") or "Gara Consip"
                auth = r.get("authority") or r.get("Amministrazione") or "Consip S.p.A."
                amount = clean_amount(r.get("amount") or r.get("Base_Asta") or r.get("Importo"))
                dl = clean_date(r.get("deadline") or r.get("Data_Termine") or r.get("Scadenza"))
                cat = r.get("category") or detect_category(title)
                reg = r.get("region") or detect_region(f"{title} {auth}")
                source = r.get("source") or "Bandi e Gare"
                gid = r.get("id") or f"IMP_{cig}"
                cur.execute("""
                INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cig) DO UPDATE SET
                    amount = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE gare.amount END,
                    title = CASE WHEN excluded.title != '' THEN excluded.title ELSE gare.title END,
                    authority = CASE WHEN excluded.authority != '' THEN excluded.authority ELSE gare.authority END,
                    deadline = CASE WHEN excluded.deadline != '' THEN excluded.deadline ELSE gare.deadline END
                """, (gid, cig, cat, reg, source, auth, title, amount, dl, "Da Valutare", "Ufficio Gare", "https://www.acquistinretepa.it"))
                processed += 1
            conn.commit()
        conn.close()
        return processed

    # CSV Streaming riga per riga
    encoding = "utf-8"
    delimiter = ";"
    with open(file_path, "rb") as f_test:
        sample = f_test.read(4096)
        if b";" in sample:
            delimiter = ";"
        elif b"," in sample:
            delimiter = ","
        try:
            sample.decode("utf-8")
        except UnicodeDecodeError:
            encoding = "latin-1"

    with open(file_path, "r", encoding=encoding, errors="replace", newline="") as f_csv:
        reader = csv.reader(f_csv, delimiter=delimiter)
        try:
            header = next(reader)
        except StopIteration:
            conn.close()
            return 0

        lower_header = [h.strip().lower().replace("#", "").replace(" ", "_") for h in header]

        if mode == "replace":
            if target == "gare":
                cur.execute("DELETE FROM gare")
            elif target == "cataloghi":
                cur.execute("DELETE FROM cataloghi")
            elif target == "amministrazioni":
                cur.execute("DELETE FROM amministrazioni")

        cur.execute("BEGIN TRANSACTION;")
        batch_count = 0
        BATCH_SIZE = 2000

        if target == "gare":
            idx_cig = -1
            idx_title = -1
            idx_auth = -1
            idx_amount = -1
            idx_dl = -1
            idx_cat = -1

            for i, col in enumerate(lower_header):
                if idx_cig == -1 and any(k in col for k in ["cig", "identificativo_lotto", "id_gara", "numero_rdo"]):
                    idx_cig = i
                if idx_title == -1 and any(k in col for k in ["oggetto", "denominazione_lotto", "titolo", "descrizione"]):
                    idx_title = i
                if idx_auth == -1 and any(k in col for k in ["amministrazione", "ente", "stazione", "acquirente"]):
                    idx_auth = i
                if idx_amount == -1 and any(k in col for k in ["base_asta", "importo", "valore", "prezzo", "massimale"]):
                    idx_amount = i
                if idx_dl == -1 and any(k in col for k in ["data_termine", "scadenza", "termine", "data_pubblicazione"]):
                    idx_dl = i
                if idx_cat == -1 and any(k in col for k in ["categoria", "settore", "merceolog"]):
                    idx_cat = i

            if idx_cig == -1: idx_cig = 0
            if idx_title == -1: idx_title = min(1, len(header)-1)

            for row in reader:
                if not row or len(row) <= idx_cig:
                    continue
                cig = row[idx_cig].strip().upper()
                if not cig:
                    continue
                title = row[idx_title].strip() if idx_title < len(row) else "Gara MePA Consip"
                auth = row[idx_auth].strip() if idx_auth != -1 and idx_auth < len(row) else "Consip S.p.A."
                raw_amount = row[idx_amount] if idx_amount != -1 and idx_amount < len(row) else "0"
                raw_dl = row[idx_dl] if idx_dl != -1 and idx_dl < len(row) else ""
                raw_cat = row[idx_cat] if idx_cat != -1 and idx_cat < len(row) else ""

                amount = clean_amount(raw_amount)
                dl = clean_date(raw_dl)
                cat = detect_category(raw_cat or title)
                reg = detect_region(f"{title} {auth}")
                gid = f"IMP_{cig}"

                source_val = "MePA" if ("rdo" in fn_lower or "negoziaz" in fn_lower or "mepa" in fn_lower) else "Bandi e Gare"

                cur.execute("""
                INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cig) DO UPDATE SET
                    amount = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE gare.amount END,
                    title = CASE WHEN excluded.title != '' THEN excluded.title ELSE gare.title END,
                    authority = CASE WHEN excluded.authority != '' THEN excluded.authority ELSE gare.authority END,
                    deadline = CASE WHEN excluded.deadline != '' THEN excluded.deadline ELSE gare.deadline END
                """, (gid, cig, cat, reg, source_val, auth, title, amount, dl, "Da Valutare", "Ufficio Gare", "https://www.acquistinretepa.it"))

                processed += 1
                batch_count += 1
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    cur.execute("BEGIN TRANSACTION;")
                    batch_count = 0

        elif target == "cataloghi":
            for row in reader:
                if not row:
                    continue
                iniz = row[0] if len(row) > 0 else ""
                lotto_cig = row[1] if len(row) > 1 else ""
                lotto_nome = row[2] if len(row) > 2 else ""
                categoria = row[3] if len(row) > 3 else ""
                cpv = row[4] if len(row) > 4 else ""
                cpv_desc = row[5] if len(row) > 5 else ""
                prodotto = row[6] if len(row) > 6 else ""
                dettaglio = row[7] if len(row) > 7 else ""
                strumento = row[8] if len(row) > 8 else "MePA"
                disponibile = row[9] if len(row) > 9 else "Sì"

                cur.execute("""
                INSERT INTO cataloghi (iniziativa, lotto_cig, lotto_nome, categoria, cpv, cpv_desc, prodotto, dettaglio, strumento, disponibile)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (iniz, lotto_cig, lotto_nome, categoria, cpv, cpv_desc, prodotto, dettaglio, strumento, disponibile))

                processed += 1
                batch_count += 1
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    cur.execute("BEGIN TRANSACTION;")
                    batch_count = 0

        elif target == "amministrazioni":
            for row in reader:
                if not row or len(row) < 2:
                    continue
                ipa = row[0].strip().upper()
                if not ipa:
                    continue
                cf = row[1].strip() if len(row) > 1 else ""
                den = row[2].strip() if len(row) > 2 else ""
                tip = row[3].strip() if len(row) > 3 else "Ente Pubblico"
                reg = row[4].strip() if len(row) > 4 else ""
                prov = row[5].strip() if len(row) > 5 else ""
                com = row[6].strip() if len(row) > 6 else ""
                po = int(clean_amount(row[7])) if len(row) > 7 else 1

                cur.execute("""
                INSERT INTO amministrazioni (ipa, codice_fiscale, denominazione, tipologia, regione, provincia, comune, po_attivi)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ipa) DO UPDATE SET
                    codice_fiscale = excluded.codice_fiscale,
                    denominazione = excluded.denominazione
                """, (ipa, cf, den, tip, reg, prov, com, po))

                processed += 1
                batch_count += 1
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    cur.execute("BEGIN TRANSACTION;")
                    batch_count = 0

        elif target == "operatori":
            for row in reader:
                if not row or len(row) < 2:
                    continue
                piva = row[0].strip().replace('"', '').replace("'", "")
                if not piva or piva.startswith("#"):
                    continue
                ragione = row[1].strip() if len(row) > 1 else ""
                forma = row[2].strip() if len(row) > 2 else ""
                nazione = row[3].strip() if len(row) > 3 else "ITALIA"
                regione = row[4].strip() if len(row) > 4 else ""
                provincia = row[5].strip() if len(row) > 5 else ""
                comune = row[6].strip() if len(row) > 6 else ""
                indirizzo = row[7].strip() if len(row) > 7 else ""
                n_aggiud = int(clean_amount(row[10])) if len(row) > 10 else 0
                n_abilit = int(clean_amount(row[11])) if len(row) > 11 else 0
                n_trans = int(clean_amount(row[12])) if len(row) > 12 else 0
                n_contr = int(clean_amount(row[13])) if len(row) > 13 else 0

                cur.execute("""
                INSERT INTO operatori_economici (partita_iva, ragione_sociale, forma_societaria, nazione, regione, provincia, comune, indirizzo, numero_aggiudicazioni, numero_abilitazioni, numero_transazioni, contratti_attivi)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(partita_iva) DO UPDATE SET
                    ragione_sociale = excluded.ragione_sociale,
                    regione = excluded.regione,
                    numero_abilitazioni = excluded.numero_abilitazioni,
                    contratti_attivi = excluded.contratti_attivi
                """, (piva, ragione, forma, nazione, regione, provincia, comune, indirizzo, n_aggiud, n_abilit, n_trans, n_contr))

                processed += 1
                batch_count += 1
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    cur.execute("BEGIN TRANSACTION;")
                    batch_count = 0

        elif target == "acquisti":
            for row in reader:
                if not row or len(row) < 3 or (row[0].startswith("#")):
                    continue
                anno = int(clean_amount(row[0])) if len(row) > 0 else 2026
                tipologia = row[1].strip() if len(row) > 1 else ""
                reg_forn = row[2].strip() if len(row) > 2 else ""
                reg_pa = row[3].strip() if len(row) > 3 else ""
                prov_pa = row[4].strip() if len(row) > 4 else ""
                tipo_neg = row[6].strip() if len(row) > 6 else "RdO"
                n_neg = int(clean_amount(row[7])) if len(row) > 7 else 0
                n_contr = int(clean_amount(row[8])) if len(row) > 8 else 0
                v_base = clean_amount(row[9]) if len(row) > 9 else 0.0
                v_stip = clean_amount(row[11]) if len(row) > 11 else 0.0
                durata = clean_amount(row[16]) if len(row) > 16 else 0.0

                cur.execute("""
                INSERT INTO contratti_stipulati (anno, tipologia_amministrazione, regione_fornitore, regione_pa, provincia_pa, tipo_negoziazione, n_negoziazioni, n_contratti, valore_base_asta, valore_stipulato, durata_media)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (anno, tipologia, reg_forn, reg_pa, prov_pa, tipo_neg, n_neg, n_contr, v_base, v_stip, durata))

                processed += 1
                batch_count += 1
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    cur.execute("BEGIN TRANSACTION;")
                    batch_count = 0

        conn.commit()

    conn.close()
    return processed

class MePAHandler(SimpleHTTPRequestHandler):
    """Gestore HTTP con supporto per servire l'app web e le API REST SQLite 3."""

    def end_headers(self):
        # CORS: riflette solo origini locali (mai '*'), cosi' un sito esterno
        # aperto nel browser non puo' leggere/scrivere sul database locale.
        origin = self.headers.get('Origin')
        if is_local_origin(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Confirm-Reset')
        # Disabilita caching HTTP aggressivo per file statici e API
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def write_forbidden(self):
        """Blocca scritture (POST/DELETE) provenienti da origini non locali."""
        origin = self.headers.get('Origin')
        if origin and not is_local_origin(origin):
            self.send_json_response({"status": "error", "message": "Origine non consentita"}, 403)
            return True
        return False

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json_response(self, data, status_code=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Routing della home page all'interfaccia MePA
        if path == "/" or path == "":
            if os.path.exists(HTML_FILE):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                with open(HTML_FILE, 'rb') as f:
                    content = f.read()
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        # API: Stato del backend e del database SQLite
        if path == "/api/status":
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM gare")
                total_gare = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM gare WHERE source IN ('MePA', 'RdO', 'Trattativa Diretta', 'RdO MePA') OR source LIKE 'RdO %' OR source LIKE 'MePA %' OR source LIKE '%Trattativa%'")
                total_neg = cur.fetchone()[0]
                total_bandi = max(0, total_gare - total_neg)

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cataloghi'")
                total_cat = 0
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM cataloghi")
                    total_cat = cur.fetchone()[0]

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='amministrazioni'")
                total_amm = 0
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM amministrazioni")
                    total_amm = cur.fetchone()[0]

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='operatori_economici'")
                total_oe = 0
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM operatori_economici")
                    total_oe = cur.fetchone()[0]

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='contratti_stipulati'")
                total_cs = 0
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM contratti_stipulati")
                    total_cs = cur.fetchone()[0]

                conn.close()
                self.send_json_response({
                    "status": "connected",
                    "database": DB_NAME,
                    "engine": "SQLite 3",
                    "total_tenders": total_gare,
                    "total_negoziazioni": total_neg,
                    "total_bandiegare": total_bandi,
                    "total_cataloghi": total_cat,
                    "total_amministrazioni": total_amm,
                    "total_operatori": total_oe,
                    "total_contratti": total_cs,
                    "backend_version": "1.1.0"
                })
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # API: Lettura gare con supporto filtri e paginazione
        if path == "/api/gare":
            try:
                qs = parse_qs(parsed.query)
                conn = get_db_connection()
                cur = conn.cursor()

                # Se richiesto con paginazione server-side
                if "page" in qs or "pageSize" in qs:
                    page = max(1, int(qs.get("page", ["1"])[0]))
                    page_size = max(5, min(200, int(qs.get("pageSize", ["30"])[0])))
                    offset = (page - 1) * page_size

                    cur.execute("SELECT COUNT(*) FROM gare")
                    total_count = cur.fetchone()[0]

                    cur.execute("SELECT * FROM gare ORDER BY deadline ASC LIMIT ? OFFSET ?", (page_size, offset))
                    rows = [dict(row) for row in cur.fetchall()]
                    conn.close()

                    self.send_json_response({
                        "items": rows,
                        "page": page,
                        "pageSize": page_size,
                        "total": total_count,
                        "totalPages": max(1, (total_count + page_size - 1) // page_size)
                    })
                    return

                # Modalità predefinita: restituisce tutte le gare
                cur.execute("SELECT * FROM gare ORDER BY deadline ASC")
                rows = [dict(row) for row in cur.fetchall()]
                conn.close()
                self.send_json_response(rows)
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Note e diario di bordo gara (Milestone 4)
        if path.startswith("/api/note"):
            try:
                qs = parse_qs(parsed.query)
                gara_id = qs.get("gara_id", [None])[0]
                conn = get_db_connection()
                cur = conn.cursor()
                if gara_id:
                    cur.execute("SELECT * FROM note_gare WHERE gara_id = ? ORDER BY created_at DESC", (gara_id,))
                else:
                    cur.execute("SELECT * FROM note_gare ORDER BY created_at DESC LIMIT 100")
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()
                self.send_json_response(rows)
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Allegati e tracciamento file firmati CAdES (.p7m) (Milestone 4)
        if path.startswith("/api/allegati"):
            try:
                qs = parse_qs(parsed.query)
                gara_id = qs.get("gara_id", [None])[0]
                conn = get_db_connection()
                cur = conn.cursor()
                if gara_id:
                    cur.execute("SELECT * FROM allegati_gare WHERE gara_id = ? ORDER BY busta ASC, filename ASC", (gara_id,))
                else:
                    cur.execute("SELECT * FROM allegati_gare ORDER BY created_at DESC LIMIT 100")
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()
                self.send_json_response(rows)
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Esportazione calendario iCalendar (.ics) per scadenze gare (Milestone 4)
        if path.startswith("/api/export/ics"):
            try:
                qs = parse_qs(parsed.query)
                gara_id = qs.get("gara_id", [None])[0]
                conn = get_db_connection()
                cur = conn.cursor()
                if gara_id:
                    cur.execute("SELECT * FROM gare WHERE id = ? OR cig = ?", (gara_id, gara_id))
                else:
                    # Tutte le gare attive con scadenza futura o non concluse
                    cur.execute("SELECT * FROM gare WHERE status NOT IN ('Vinta', 'Persa', 'Scartata') ORDER BY deadline ASC")
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()

                ics_body = generate_ics_content(rows).encode("utf-8")
                filename = f"scadenza_{gara_id}.ics" if gara_id else "calendario_gare_mepa.ics"
                self.send_response(200)
                self.send_header('Content-Type', 'text/calendar; charset=utf-8')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Length', str(len(ics_body)))
                self.end_headers()
                self.wfile.write(ics_body)
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Lettura stato workflow / wizard di una specifica gara
        if path.startswith("/api/workflow"):
            try:
                qs = parse_qs(parsed.query)
                gara_id = None
                if path.startswith("/api/workflow/"):
                    gara_id = path[len("/api/workflow/"):]
                elif "gara_id" in qs:
                    gara_id = qs["gara_id"][0]

                if not gara_id:
                    self.send_json_response({"error": "Parametro gara_id obbligatorio"}, 400)
                    return

                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT * FROM gare_workflow WHERE gara_id = ?", (gara_id,))
                row = cur.fetchone()
                conn.close()

                if row:
                    res = dict(row)
                    for k in ["step1_data", "step2_data", "step3_data", "step4_data"]:
                        if res.get(k) and isinstance(res[k], str):
                            try:
                                res[k] = json.loads(res[k])
                            except Exception:
                                pass
                    self.send_json_response(res)
                else:
                    self.send_json_response({
                        "gara_id": gara_id,
                        "current_step": 1,
                        "step1_data": {},
                        "step2_data": {},
                        "step3_data": {},
                        "step4_data": {},
                        "updated_at": None
                    })
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Ricerca nel Catalogo Prodotti (287.000+ articoli MePA)
        if path == "/api/cataloghi":
            try:
                qs = parse_qs(parsed.query)
                q = qs.get("q", [""])[0].strip()
                cat = qs.get("categoria", [""])[0].strip()
                strumento = qs.get("strumento", [""])[0].strip()
                disponibile = qs.get("disponibile", [""])[0].strip()
                page = max(1, int(qs.get("page", ["1"])[0]))
                page_size = max(5, min(100, int(qs.get("pageSize", ["25"])[0])))
                offset = (page - 1) * page_size

                conn = get_db_connection()
                cur = conn.cursor()

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cataloghi'")
                if not cur.fetchone():
                    conn.close()
                    self.send_json_response({"items": [], "total": 0, "categories": [], "strumenti": [], "message": "Tabella cataloghi non presente"})
                    return

                conditions = []
                params = []
                if q:
                    like_term = f"%{q}%"
                    conditions.append("(prodotto LIKE ? OR cpv_desc LIKE ? OR cpv LIKE ? OR iniziativa LIKE ? OR dettaglio LIKE ? OR lotto_cig LIKE ? OR lotto_nome LIKE ?)")
                    params.extend([like_term, like_term, like_term, like_term, like_term, like_term, like_term])
                if cat:
                    conditions.append("categoria = ?")
                    params.append(cat)
                if strumento:
                    conditions.append("strumento = ?")
                    params.append(strumento)
                if disponibile:
                    conditions.append("disponibile = ?")
                    params.append(disponibile)

                where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

                cur.execute(f"SELECT COUNT(*) FROM cataloghi{where_clause}", params)
                total = cur.fetchone()[0]

                cur.execute(f"SELECT * FROM cataloghi{where_clause} ORDER BY id ASC LIMIT ? OFFSET ?", params + [page_size, offset])
                rows = [dict(row) for row in cur.fetchall()]

                # Ottieni le categorie e gli strumenti unici
                cur.execute("SELECT DISTINCT categoria FROM cataloghi WHERE categoria != '' AND categoria != 'ND' ORDER BY categoria ASC")
                categories = [r[0] for r in cur.fetchall()]

                cur.execute("SELECT DISTINCT strumento FROM cataloghi WHERE strumento != '' ORDER BY strumento ASC")
                strumenti = [r[0] for r in cur.fetchall()]

                conn.close()
                self.send_json_response({
                    "items": rows,
                    "page": page,
                    "pageSize": page_size,
                    "total": total,
                    "totalPages": max(1, (total + page_size - 1) // page_size),
                    "categories": categories,
                    "strumenti": strumenti
                })
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Export Catalogo Prodotti (CSV Excel con BOM UTF-8 o JSON)
        if path == "/api/cataloghi/export":
            try:
                qs = parse_qs(parsed.query)
                q = qs.get("q", [""])[0].strip()
                cat = qs.get("categoria", [""])[0].strip()
                strumento = qs.get("strumento", [""])[0].strip()
                disponibile = qs.get("disponibile", [""])[0].strip()
                fmt = qs.get("format", ["csv"])[0].strip().lower()
                limit = min(5000, max(1, int(qs.get("limit", ["1000"])[0])))

                conn = get_db_connection()
                cur = conn.cursor()

                conditions = []
                params = []
                if q:
                    like_term = f"%{q}%"
                    conditions.append("(prodotto LIKE ? OR cpv_desc LIKE ? OR cpv LIKE ? OR iniziativa LIKE ? OR dettaglio LIKE ? OR lotto_cig LIKE ? OR lotto_nome LIKE ?)")
                    params.extend([like_term, like_term, like_term, like_term, like_term, like_term, like_term])
                if cat:
                    conditions.append("categoria = ?")
                    params.append(cat)
                if strumento:
                    conditions.append("strumento = ?")
                    params.append(strumento)
                if disponibile:
                    conditions.append("disponibile = ?")
                    params.append(disponibile)

                where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
                cur.execute(f"SELECT id, iniziativa, lotto_cig, lotto_nome, categoria, cpv, cpv_desc, prodotto, dettaglio, strumento, disponibile FROM cataloghi{where_clause} ORDER BY id ASC LIMIT ?", params + [limit])
                rows = [dict(row) for row in cur.fetchall()]
                conn.close()

                if fmt == "json":
                    self.send_json_response({"items": rows, "count": len(rows)})
                    return

                import io, csv
                output = io.StringIO()
                output.write('\ufeff')  # UTF-8 BOM per Excel
                writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
                writer.writerow(["ID", "INIZIATIVA", "CIG_LOTTO", "NOME_LOTTO", "CATEGORIA", "CPV", "DESC_CPV", "PRODOTTO", "DETTAGLIO_ARTICOLO", "STRUMENTO", "DISPONIBILE"])
                for r in rows:
                    writer.writerow([r["id"], r["iniziativa"], r["lotto_cig"], r["lotto_nome"], r["categoria"], r["cpv"], r["cpv_desc"], r["prodotto"], r["dettaglio"], r["strumento"], r["disponibile"]])

                csv_bytes = output.getvalue().encode('utf-8')
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="export_cataloghi_consip.csv"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
                return
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Anagrafica Amministrazioni Pubbliche (20.000+ Enti PA)
        if path == "/api/amministrazioni":
            try:
                qs = parse_qs(parsed.query)
                q = qs.get("q", [""])[0].strip()
                regione = qs.get("regione", [""])[0].strip().upper()
                tipologia = qs.get("tipologia", [""])[0].strip()
                min_po = int(qs.get("min_po", ["0"])[0].strip() or 0)
                page = max(1, int(qs.get("page", ["1"])[0]))
                page_size = max(5, min(100, int(qs.get("pageSize", ["25"])[0])))
                offset = (page - 1) * page_size

                conn = get_db_connection()
                cur = conn.cursor()

                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='amministrazioni'")
                if not cur.fetchone():
                    conn.close()
                    self.send_json_response({"items": [], "total": 0, "regions": [], "tipologie": [], "message": "Tabella amministrazioni non presente"})
                    return

                conditions = []
                params = []
                if q:
                    like_term = f"%{q}%"
                    conditions.append("(denominazione LIKE ? OR codice_fiscale LIKE ? OR ipa LIKE ? OR comune LIKE ? OR provincia LIKE ? OR regione LIKE ?)")
                    params.extend([like_term, like_term, like_term, like_term, like_term, like_term])
                if regione:
                    conditions.append("regione = ?")
                    params.append(regione)
                if tipologia:
                    conditions.append("tipologia LIKE ?")
                    params.append(f"%{tipologia}%")
                if min_po > 0:
                    conditions.append("po_attivi >= ?")
                    params.append(min_po)

                where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

                cur.execute(f"SELECT COUNT(*) FROM amministrazioni{where_clause}", params)
                total = cur.fetchone()[0]

                cur.execute(f"SELECT * FROM amministrazioni{where_clause} ORDER BY po_attivi DESC, denominazione ASC LIMIT ? OFFSET ?", params + [page_size, offset])
                rows = [dict(row) for row in cur.fetchall()]

                # Ottieni le regioni uniche per il filtro
                cur.execute("SELECT DISTINCT regione FROM amministrazioni WHERE regione != '' ORDER BY regione ASC")
                regions = [r[0] for r in cur.fetchall()]

                # Ottieni tipologie principali
                cur.execute("SELECT DISTINCT tipologia FROM amministrazioni WHERE tipologia != '' ORDER BY tipologia ASC")
                tipologie = [r[0] for r in cur.fetchall()]

                conn.close()
                self.send_json_response({
                    "items": rows,
                    "page": page,
                    "pageSize": page_size,
                    "total": total,
                    "totalPages": max(1, (total + page_size - 1) // page_size),
                    "regions": regions,
                    "tipologie": tipologie
                })
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Export Anagrafica Amministrazioni Pubbliche (CSV Excel con BOM UTF-8 o JSON)
        if path == "/api/amministrazioni/export":
            try:
                qs = parse_qs(parsed.query)
                q = qs.get("q", [""])[0].strip()
                regione = qs.get("regione", [""])[0].strip().upper()
                tipologia = qs.get("tipologia", [""])[0].strip()
                min_po = int(qs.get("min_po", ["0"])[0].strip() or 0)
                fmt = qs.get("format", ["csv"])[0].strip().lower()
                limit = min(5000, max(1, int(qs.get("limit", ["1000"])[0])))

                conn = get_db_connection()
                cur = conn.cursor()

                conditions = []
                params = []
                if q:
                    like_term = f"%{q}%"
                    conditions.append("(denominazione LIKE ? OR codice_fiscale LIKE ? OR ipa LIKE ? OR comune LIKE ? OR provincia LIKE ? OR regione LIKE ?)")
                    params.extend([like_term, like_term, like_term, like_term, like_term, like_term])
                if regione:
                    conditions.append("regione = ?")
                    params.append(regione)
                if tipologia:
                    conditions.append("tipologia LIKE ?")
                    params.append(f"%{tipologia}%")
                if min_po > 0:
                    conditions.append("po_attivi >= ?")
                    params.append(min_po)

                where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
                cur.execute(f"SELECT id, ipa, codice_fiscale, denominazione, tipologia, regione, provincia, comune, po_attivi FROM amministrazioni{where_clause} ORDER BY po_attivi DESC, denominazione ASC LIMIT ?", params + [limit])
                rows = [dict(row) for row in cur.fetchall()]
                conn.close()

                if fmt == "json":
                    self.send_json_response({"items": rows, "count": len(rows)})
                    return

                import io, csv
                output = io.StringIO()
                output.write('\ufeff')  # UTF-8 BOM per Excel
                writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
                writer.writerow(["ID", "CODICE_IPA", "CODICE_FISCALE", "DENOMINAZIONE_ENTE", "TIPOLOGIA", "REGIONE", "PROVINCIA", "COMUNE", "PUNTI_ORDINANTI_ATTIVI"])
                for r in rows:
                    writer.writerow([r["id"], r["ipa"], r["codice_fiscale"], r["denominazione"], r["tipologia"], r["regione"], r["provincia"], r["comune"], r["po_attivi"]])

                csv_bytes = output.getvalue().encode('utf-8')
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="export_amministrazioni_consip.csv"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
                return
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Analisi e Statistiche di Mercato MePA & Consip
        if path == "/api/analytics":
            try:
                conn = get_db_connection()
                cur = conn.cursor()

                now_iso = dt.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
                now_date = dt.now(timezone.utc).strftime("%Y-%m-%d")

                # Statistiche Totali
                cur.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM gare")
                tenders_count, total_amount = cur.fetchone()

                # Gare Attive (aperte, con termine futuro o in attesa esito)
                cur.execute("""
                    SELECT 
                        COUNT(*), 
                        COALESCE(SUM(amount), 0), 
                        COALESCE(AVG(CASE WHEN amount > 0 THEN amount END), 0)
                    FROM gare 
                    WHERE status NOT IN ('Vinta', 'Persa', 'Scartata', 'AGGIUDICATA', 'DESERTA', 'REVOCATA', 'ANNULLATA')
                      AND (status = 'Inviata' OR deadline >= ? OR deadline >= ? OR deadline IS NULL OR deadline = '')
                """, (now_iso, now_date))
                active_count, active_amount, active_avg_ticket = cur.fetchone()

                # Scadenzario Temporale (Finestre di Urgenza Partecipazione)
                plus_7d = (dt.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
                plus_15d = (dt.now(timezone.utc) + timedelta(days=15)).strftime("%Y-%m-%dT%H:%M:%S")
                plus_30d = (dt.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")

                cur.execute("""
                    SELECT 
                        COUNT(CASE WHEN deadline >= ? AND deadline <= ? THEN 1 END) as urgent_7d,
                        COALESCE(SUM(CASE WHEN deadline >= ? AND deadline <= ? THEN amount ELSE 0 END), 0) as urgent_7d_amount,
                        COUNT(CASE WHEN deadline > ? AND deadline <= ? THEN 1 END) as medium_15d,
                        COALESCE(SUM(CASE WHEN deadline > ? AND deadline <= ? THEN amount ELSE 0 END), 0) as medium_15d_amount,
                        COUNT(CASE WHEN deadline > ? AND deadline <= ? THEN 1 END) as plan_30d,
                        COALESCE(SUM(CASE WHEN deadline > ? AND deadline <= ? THEN amount ELSE 0 END), 0) as plan_30d_amount,
                        COUNT(CASE WHEN deadline > ? THEN 1 END) as future_30d,
                        COALESCE(SUM(CASE WHEN deadline > ? THEN amount ELSE 0 END), 0) as future_30d_amount,
                        COUNT(CASE WHEN deadline < ? AND status NOT IN ('Vinta', 'Inviata') THEN 1 END) as expired_count
                    FROM gare
                    WHERE status NOT IN ('Vinta', 'Persa', 'Scartata', 'AGGIUDICATA', 'DESERTA', 'REVOCATA', 'ANNULLATA')
                """, (now_iso, plus_7d, now_iso, plus_7d, plus_7d, plus_15d, plus_7d, plus_15d, plus_15d, plus_30d, plus_15d, plus_30d, plus_30d, plus_30d, now_iso))
                dl_row = cur.fetchone()
                deadline_breakdown = {
                    "urgent_7d": dl_row[0] or 0, "urgent_7d_amount": dl_row[1] or 0,
                    "medium_15d": dl_row[2] or 0, "medium_15d_amount": dl_row[3] or 0,
                    "plan_30d": dl_row[4] or 0, "plan_30d_amount": dl_row[5] or 0,
                    "future_30d": dl_row[6] or 0, "future_30d_amount": dl_row[7] or 0,
                    "expired_count": dl_row[8] or 0
                }

                # Soglie Economiche (D.Lgs. 36/2023 Nuovo Codice Appalti)
                cur.execute("""
                    SELECT
                        COUNT(CASE WHEN amount > 0 AND amount < 40000 THEN 1 END) as micro_count,
                        COALESCE(SUM(CASE WHEN amount > 0 AND amount < 40000 THEN amount ELSE 0 END), 0) as micro_amount,
                        COUNT(CASE WHEN amount >= 40000 AND amount < 143000 THEN 1 END) as sotto_count,
                        COALESCE(SUM(CASE WHEN amount >= 40000 AND amount < 143000 THEN amount ELSE 0 END), 0) as sotto_amount,
                        COUNT(CASE WHEN amount >= 143000 AND amount < 500000 THEN 1 END) as media_count,
                        COALESCE(SUM(CASE WHEN amount >= 143000 AND amount < 500000 THEN amount ELSE 0 END), 0) as media_amount,
                        COUNT(CASE WHEN amount >= 500000 THEN 1 END) as sopra_count,
                        COALESCE(SUM(CASE WHEN amount >= 500000 THEN amount ELSE 0 END), 0) as sopra_amount
                    FROM gare
                """)
                soglie_row = cur.fetchone()
                soglie_breakdown = [
                    {"key": "micro", "label": "Micro-Affidamenti (< €40k)", "count": soglie_row[0] or 0, "amount": soglie_row[1] or 0, "desc": "Affidamento diretto senza gara ex D.Lgs. 36/2023"},
                    {"key": "sotto_soglia", "label": "Sotto-Soglia MePA (€40k - €143k)", "count": soglie_row[2] or 0, "amount": soglie_row[3] or 0, "desc": "RdO e affidamenti negoziati semplificati"},
                    {"key": "media_soglia", "label": "Fascia Media (€143k - €500k)", "count": soglie_row[4] or 0, "amount": soglie_row[5] or 0, "desc": "Procedure negoziate o aperte ordinarie"},
                    {"key": "sopra_soglia", "label": "Grandi Appalti / AQ (>= €500k)", "count": soglie_row[6] or 0, "amount": soglie_row[7] or 0, "desc": "Convenzioni nazionali e Accordi Quadro"}
                ]

                # Strumenti Negoziali MePA & Consip
                cur.execute("""
                    SELECT 
                        CASE 
                            WHEN source LIKE '%Convenzione%' THEN 'Convenzioni Consip'
                            WHEN source LIKE '%Accordo%' THEN 'Accordi Quadro'
                            WHEN source LIKE '%MePA%' OR source LIKE '%RdO%' THEN 'RdO MePA'
                            WHEN source LIKE '%ASP%' THEN 'Gare ASP'
                            ELSE 'Bandi Consip'
                        END as strumento,
                        COUNT(*),
                        COALESCE(SUM(amount), 0)
                    FROM gare
                    GROUP BY 1
                    ORDER BY 2 DESC
                """)
                instruments_breakdown = [{"instrument": r[0], "count": r[1], "amount": r[2]} for r in cur.fetchall()]

                # Categorie Merceologiche
                cur.execute("SELECT category, COUNT(*), COALESCE(SUM(amount), 0) FROM gare GROUP BY category ORDER BY COUNT(*) DESC")
                categories_breakdown = [{"category": r[0], "count": r[1], "amount": r[2]} for r in cur.fetchall()]

                # Pipeline & Funnel 4 Fasi del Dossier
                cur.execute("SELECT status, COUNT(*), COALESCE(SUM(amount), 0) FROM gare GROUP BY status")
                status_raw = {r[0] or "Da Valutare": {"count": r[1], "amount": r[2]} for r in cur.fetchall()}
                pipeline_funnel = [
                    {"phase": "1. Identificazione", "status": "Da Valutare", "count": status_raw.get("Da Valutare", {}).get("count", 0), "amount": status_raw.get("Da Valutare", {}).get("amount", 0), "color": "sky"},
                    {"phase": "2. In Lavorazione", "status": "In Lavorazione", "count": status_raw.get("In Lavorazione", {}).get("count", 0), "amount": status_raw.get("In Lavorazione", {}).get("amount", 0), "color": "amber"},
                    {"phase": "3. Offerte Inviate", "status": "Inviata", "count": status_raw.get("Inviata", {}).get("count", 0), "amount": status_raw.get("Inviata", {}).get("amount", 0), "color": "purple"},
                    {"phase": "4. Gare Vinte", "status": "Vinta", "count": status_raw.get("Vinta", {}).get("count", 0), "amount": status_raw.get("Vinta", {}).get("amount", 0), "color": "emerald"},
                    {"phase": "5. Concluse / Perse", "status": "Concluse", "count": status_raw.get("Persa", {}).get("count", 0) + status_raw.get("Scartata", {}).get("count", 0), "amount": status_raw.get("Persa", {}).get("amount", 0) + status_raw.get("Scartata", {}).get("amount", 0), "color": "slate"}
                ]

                # Top Regioni Gare
                cur.execute("SELECT region, COUNT(*), COALESCE(SUM(amount), 0) FROM gare WHERE region != '' AND region != 'ND' GROUP BY region ORDER BY COUNT(*) DESC LIMIT 5")
                top_regions_gare = [{"region": r[0] or "Nazionale", "count": r[1], "amount": r[2]} for r in cur.fetchall()]

                # Statistiche Cataloghi
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cataloghi'")
                cat_count = 0
                top_cat_products = []
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM cataloghi")
                    cat_count = cur.fetchone()[0]
                    cur.execute("SELECT categoria, COUNT(*) FROM cataloghi WHERE categoria != '' GROUP BY categoria ORDER BY COUNT(*) DESC LIMIT 5")
                    top_cat_products = [{"categoria": r[0], "count": r[1]} for r in cur.fetchall()]

                # Statistiche Amministrazioni
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='amministrazioni'")
                amm_count = 0
                top_regions_amm = []
                if cur.fetchone():
                    cur.execute("SELECT COUNT(*) FROM amministrazioni")
                    amm_count = cur.fetchone()[0]
                    cur.execute("SELECT regione, COUNT(*) FROM amministrazioni WHERE regione != '' GROUP BY regione ORDER BY COUNT(*) DESC LIMIT 5")
                    top_regions_amm = [{"regione": r[0], "count": r[1]} for r in cur.fetchall()]

                conn.close()
                self.send_json_response({
                    "total_tenders": tenders_count,
                    "total_amount": total_amount,
                    "active_tenders": active_count,
                    "active_amount": active_amount,
                    "average_ticket": active_avg_ticket,
                    "deadline_breakdown": deadline_breakdown,
                    "soglie_breakdown": soglie_breakdown,
                    "instruments_breakdown": instruments_breakdown,
                    "categories_breakdown": categories_breakdown,
                    "pipeline_funnel": pipeline_funnel,
                    "top_regions_gare": top_regions_gare,
                    "total_cataloghi": cat_count,
                    "top_cat_products": top_cat_products,
                    "total_amministrazioni": amm_count,
                    "top_regions_amm": top_regions_amm
                })
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Esportazione Report Esecutivo di Mercato (CSV con UTF-8 BOM o JSON)
        if path == "/api/analytics/export":
            try:
                qs = parse_qs(parsed.query)
                fmt = qs.get("format", ["csv"])[0].strip().lower()

                conn = get_db_connection()
                cur = conn.cursor()

                now_iso = dt.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

                cur.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM gare")
                tenders_count, total_amount = cur.fetchone()

                cur.execute("""
                    SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(AVG(CASE WHEN amount > 0 THEN amount END), 0)
                    FROM gare 
                    WHERE status NOT IN ('Vinta', 'Persa', 'Scartata', 'AGGIUDICATA', 'DESERTA', 'REVOCATA', 'ANNULLATA')
                      AND (status = 'Inviata' OR deadline >= ? OR deadline IS NULL OR deadline = '')
                """, (now_iso,))
                active_count, active_amount, active_avg_ticket = cur.fetchone()

                cur.execute("SELECT category, COUNT(*), COALESCE(SUM(amount), 0) FROM gare GROUP BY category ORDER BY COUNT(*) DESC")
                cats = cur.fetchall()

                conn.close()

                if fmt == "json":
                    self.send_json_response({
                        "generated_at": dt.now(timezone.utc).isoformat(),
                        "total_tenders": tenders_count,
                        "total_amount": total_amount,
                        "active_tenders": active_count,
                        "active_amount": active_amount,
                        "average_ticket": active_avg_ticket,
                        "categories": [{"category": r[0], "count": r[1], "amount": r[2]} for r in cats]
                    })
                    return

                import io, csv
                output = io.StringIO()
                output.write('\ufeff')  # UTF-8 BOM per Excel
                writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
                writer.writerow(["REPORT ESECUTIVO DI MERCATO - MEPA & CONSIP DESK PRO"])
                writer.writerow(["Data Generazione", dt.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S")])
                writer.writerow([])
                writer.writerow(["INDICATORE KPI", "VALORE", "NOTE"])
                writer.writerow(["Gare Totali a Sistema", tenders_count, "Bandi, Convenzioni, RdO, Accordi Quadro"])
                writer.writerow(["Gare Attive e Aperte", active_count, "Procedure con termine partecipazione attivo"])
                writer.writerow(["Massa Economica Attiva", f"{active_amount:.2f} EUR", "Basi d'asta aperte alla concorrenza"])
                writer.writerow(["Ticket Medio di Gara", f"{active_avg_ticket:.2f} EUR", "Importo medio a base d'asta"])
                writer.writerow([])
                writer.writerow(["RIPARTIZIONE PER CATEGORIA MERCEOLOGICA"])
                writer.writerow(["Categoria", "Numero Gare", "Importo Complessivo (EUR)"])
                for r in cats:
                    writer.writerow([r[0], r[1], f"{r[2]:.2f}"])

                csv_bytes = output.getvalue().encode('utf-8')
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="report_mercato_consip.csv"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
                return
            except Exception as e:
                self.send_json_response({"error": str(e)}, 500)
            return

        # API: Download diretto del file binario gare_consip.db
        if path == "/api/export/db":
            if os.path.exists(DB_NAME):
                with open(DB_NAME, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/x-sqlite3')
                self.send_header('Content-Disposition', f'attachment; filename="{DB_NAME}"')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_json_response({"error": "Database file non trovato"}, 404)
            return

        # API: Ispezione versioni Open Data CKAN dati.consip.it (senza download pesanti)
        if path == "/api/ckan/check":
            try:
                import check_consip_ckan
                report = check_consip_ckan.inspect_all_ckan_datasets()
                if "status" not in report:
                    report["status"] = "success"
                self.send_json_response(report)
            except Exception as e:
                self.send_json_response({"status": "error", "error": str(e)}, 500)
            return

        # Altri file statici
        super().do_GET()

    def do_POST(self):
        if self.write_forbidden():
            return
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_length)

        # API: Inserimento o modifica singola gara (UPSERT)
        if path == "/api/gare":
            try:
                data = json.loads(post_body.decode('utf-8'))
                conn = get_db_connection()
                cur = conn.cursor()

                gara_id = data.get("id") or f"T_{os.urandom(4).hex()}"
                cig = (data.get("cig") or "").strip().upper()
                category = data.get("category") or "ALTRO"
                region = data.get("region") or "Nazionale"
                source = data.get("source") or "Manuale"
                authority = data.get("authority") or ""
                title = data.get("title") or ""
                amount = float(data.get("amount") or 0)
                deadline = data.get("deadline") or ""
                status = data.get("status") or "Da Valutare"
                owner = data.get("owner") or ""
                link = data.get("link") or ""

                cur.execute("""
                INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cig) DO UPDATE SET
                    category = excluded.category,
                    region = excluded.region,
                    source = excluded.source,
                    authority = excluded.authority,
                    title = excluded.title,
                    amount = excluded.amount,
                    deadline = excluded.deadline,
                    status = excluded.status,
                    owner = excluded.owner,
                    link = excluded.link
                """, (gara_id, cig, category, region, source, authority, title, amount, deadline, status, owner, link))

                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "id": gara_id, "cig": cig})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 400)
            return

        # API: Inserimento nuova Nota / Decisione interna (Milestone 4)
        if path == "/api/note":
            try:
                data = json.loads(post_body.decode('utf-8'))
                gara_id = data.get("gara_id")
                content = (data.get("content") or data.get("testo") or "").strip()
                if not gara_id or not content:
                    self.send_json_response({"status": "error", "message": "Campi gara_id e content obbligatori"}, 400)
                    return
                author = data.get("author") or data.get("autore") or "Operatore Gare"
                category = data.get("category") or data.get("fase") or "GENERALE"
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO note_gare (gara_id, author, category, content, created_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                """, (gara_id, author, category, content))
                note_id = cur.lastrowid
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "id": note_id, "gara_id": gara_id})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # API: Registrazione / Tracciamento Allegato di Gara (Milestone 4)
        if path == "/api/allegati":
            try:
                data = json.loads(post_body.decode('utf-8'))
                gara_id = data.get("gara_id")
                filename = (data.get("filename") or data.get("nome_file") or "").strip()
                raw_busta = (data.get("busta") or "A").upper().replace("BUSTA", "").strip()
                busta = raw_busta if raw_busta in ("A", "B", "C") else "A"
                if not gara_id or not filename:
                    self.send_json_response({"status": "error", "message": "Campi gara_id e filename obbligatori"}, 400)
                    return
                file_type = data.get("file_type") or data.get("tipo_documento") or ("PDF_P7M" if filename.endswith(".p7m") else "PDF")
                signed_val = data.get("signed_cades") if data.get("signed_cades") is not None else data.get("cades_firmato", True)
                signed_cades = 1 if signed_val else 0
                timestamp_val = data.get("timestamp_verified") if data.get("timestamp_verified") is not None else data.get("marca_temporale", False)
                timestamp_verified = 1 if timestamp_val else 0
                note = data.get("note") or ""
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO allegati_gare (gara_id, busta, filename, file_type, signed_cades, timestamp_verified, note, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (gara_id, busta, filename, file_type, signed_cades, timestamp_verified, note))
                att_id = cur.lastrowid
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "id": att_id, "gara_id": gara_id})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # API: Aggiornamento stato workflow / wizard di una gara
        if path == "/api/workflow":
            try:
                data = json.loads(post_body.decode('utf-8'))
                gara_id = data.get("gara_id")
                if not gara_id:
                    self.send_json_response({"status": "error", "message": "gara_id obbligatorio"}, 400)
                    return

                current_step = int(data.get("current_step", 1))
                step1_data = json.dumps(data.get("step1_data", {}), ensure_ascii=False)
                step2_data = json.dumps(data.get("step2_data", {}), ensure_ascii=False)
                step3_data = json.dumps(data.get("step3_data", {}), ensure_ascii=False)
                step4_data = json.dumps(data.get("step4_data", {}), ensure_ascii=False)
                now_iso = datetime.datetime.now().isoformat()

                conn = get_db_connection()
                cur = conn.cursor()

                cur.execute("""
                INSERT INTO gare_workflow (gara_id, current_step, step1_data, step2_data, step3_data, step4_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(gara_id) DO UPDATE SET
                    current_step = excluded.current_step,
                    step1_data = excluded.step1_data,
                    step2_data = excluded.step2_data,
                    step3_data = excluded.step3_data,
                    step4_data = excluded.step4_data,
                    updated_at = excluded.updated_at
                """, (gara_id, current_step, step1_data, step2_data, step3_data, step4_data, now_iso))

                # Lo stato della gara cambia SOLO se il client lo chiede esplicitamente
                # (calcolato dalle regole deterministiche del Wizard) e se e' un valore valido.
                gara_status = data.get("gara_status")
                if gara_status:
                    if gara_status not in VALID_STATUSES:
                        conn.close()
                        self.send_json_response({"status": "error", "message": "gara_status non valido"}, 400)
                        return
                    cur.execute("UPDATE gare SET status = ? WHERE id = ?", (gara_status, gara_id))

                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "gara_id": gara_id, "current_step": current_step, "gara_status": gara_status})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 400)
            return

        # API: Inserimento massivo (Batch Import da CSV o JSON)
        if path == "/api/batch":
            try:
                payload = json.loads(post_body.decode('utf-8'))
                items = payload if isinstance(payload, list) else payload.get("records", [])
                mode = payload.get("mode", "dedup") if isinstance(payload, dict) else "dedup"

                conn = get_db_connection()
                cur = conn.cursor()

                saved_workflows = []
                if mode == "replace":
                    # Con le FK attive il DELETE cancellerebbe a cascata anche i workflow:
                    # li salvo e li ripristino per le gare che compaiono ancora nel nuovo import.
                    saved_workflows = [tuple(r) for r in cur.execute(
                        "SELECT gara_id, current_step, step1_data, step2_data, step3_data, step4_data, updated_at FROM gare_workflow")]
                    cur.execute("DELETE FROM gare")

                cur.execute("BEGIN TRANSACTION;")
                inserted = 0
                for item in items:
                    gara_id = item.get("id") or f"IMP_{os.urandom(4).hex()}"
                    cig = (item.get("cig") or "").strip().upper()
                    if not cig:
                        continue
                    cur.execute("""
                    INSERT INTO gare (id, cig, category, region, source, authority, title, amount, deadline, status, owner, link)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(cig) DO UPDATE SET
                        amount = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE gare.amount END,
                        title = CASE WHEN excluded.title != '' THEN excluded.title ELSE gare.title END,
                        authority = CASE WHEN excluded.authority != '' THEN excluded.authority ELSE gare.authority END,
                        deadline = CASE WHEN excluded.deadline != '' THEN excluded.deadline ELSE gare.deadline END,
                        category = CASE WHEN excluded.category != 'ALTRO' THEN excluded.category ELSE gare.category END,
                        region = CASE WHEN excluded.region != 'Nazionale' THEN excluded.region ELSE gare.region END
                    """, (
                        gara_id,
                        cig,
                        item.get("category") or "ALTRO",
                        item.get("region") or "Nazionale",
                        item.get("source") or "Bandi e Gare",
                        item.get("authority") or "",
                        item.get("title") or "",
                        float(item.get("amount") or 0),
                        item.get("deadline") or "",
                        item.get("status") or "Da Valutare",
                        item.get("owner") or "",
                        item.get("link") or ""
                    ))
                    inserted += 1

                conn.commit()
                restored = 0
                for wf in saved_workflows:
                    cur.execute("SELECT 1 FROM gare WHERE id = ?", (wf[0],))
                    if cur.fetchone():
                        cur.execute("INSERT OR REPLACE INTO gare_workflow (gara_id, current_step, step1_data, step2_data, step3_data, step4_data, updated_at) VALUES (?,?,?,?,?,?,?)", wf)
                        restored += 1
                conn.commit()
                cur.execute("SELECT COUNT(*) FROM gare")
                total = cur.fetchone()[0]
                conn.close()

                self.send_json_response({"status": "success", "processed": inserted, "total": total})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 400)
            return

        # API: Reset completo del database
        if path == "/api/reset":
            if self.headers.get("X-Confirm-Reset") != "yes":
                self.send_json_response({"status": "error", "message": "Conferma esplicita richiesta (header X-Confirm-Reset: yes)"}, 403)
                return
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM gare")
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "message": "Database svuotato"})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # API: Sincronizzazione 1-Click Diretta da URL Consip (Zero download locale)
        if path == "/api/ingest/url":
            try:
                payload = json.loads(post_body.decode('utf-8'))
                url = payload.get("url")
                if not url:
                    self.send_json_response({"status": "error", "message": "Parametro url obbligatorio"}, 400)
                    return
                target = payload.get("target", "auto")
                mode = payload.get("mode", "dedup")

                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})

                with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
                    tmp_path = tmp.name
                    with urllib.request.urlopen(req, timeout=300, context=ctx) as resp:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            tmp.write(chunk)

                try:
                    filename = os.path.basename(urlparse(url).path) or "consip_dataset.csv"
                    count = stream_process_file_data(tmp_path, filename, target=target, mode=mode)
                    self.send_json_response({
                        "status": "success",
                        "processed": count,
                        "target": target,
                        "message": f"Sincronizzazione completata con successo: {count} record elaborati."
                    })
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # API: Upload ad alte prestazioni via Streaming per Grandi File (senza limiti di MB)
        if path == "/api/upload/stream":
            try:
                qs = parse_qs(parsed.query)
                filename = qs.get("filename", ["dataset.csv"])[0]
                target = qs.get("target", ["auto"])[0]
                mode = qs.get("mode", ["dedup"])[0]

                with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
                    tmp_path = tmp.name
                    tmp.write(post_body)

                try:
                    count = stream_process_file_data(tmp_path, filename, target=target, mode=mode)
                    self.send_json_response({
                        "status": "success",
                        "processed": count,
                        "filename": filename,
                        "message": f"Importazione completata: {count} record memorizzati in SQLite."
                    })
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        self.send_json_response({"error": "Endpoint POST sconosciuto"}, 404)

    def do_DELETE(self):
        if self.write_forbidden():
            return
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # Estrae l'ID o dal path /api/gare/<id> o da query parameter ?id=<id>
        gara_id = None
        if path.startswith("/api/gare/"):
            gara_id = path[len("/api/gare/"):]
        elif "id" in qs:
            gara_id = qs["id"][0]

        # Cancellazione singola nota (Milestone 4)
        if path.startswith("/api/note/"):
            note_id = path[len("/api/note/"):]
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM note_gare WHERE id = ?", (note_id,))
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "deleted_note_id": note_id})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        # Cancellazione singolo allegato tracciato (Milestone 4)
        if path.startswith("/api/allegati/"):
            att_id = path[len("/api/allegati/"):]
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM allegati_gare WHERE id = ?", (att_id,))
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "deleted_allegato_id": att_id})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        if gara_id:
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM gare WHERE id = ? OR cig = ?", (gara_id, gara_id))
                conn.commit()
                conn.close()
                self.send_json_response({"status": "success", "deleted_id": gara_id})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, 500)
            return

        self.send_json_response({"error": "ID gara non fornito per la cancellazione"}, 400)

def get_lan_ip():
    """Tenta di rilevare l'indirizzo IP locale della scheda di rete per la LAN."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Non invia traffico reale: individua l'interfaccia usata verso il gateway
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def run_server(port=DEFAULT_PORT, host=DEFAULT_HOST):
    server_address = (host, port)
    httpd = HTTPServer(server_address, MePAHandler)
    lan_ip = get_lan_ip()
    print("================================================================")
    print("   MEPA & CONSIP DESK PRO - BACKEND SQLITE 3 SERVER ATTIVO      ")
    print(f"   Accesso Locale:   http://127.0.0.1:{port}/                   ")
    if lan_ip != "127.0.0.1":
        print(f"   Accesso Rete LAN: http://{lan_ip}:{port}/                    ")
    print(f"   Binding Host:     {host}:{port}                              ")
    print(f"   Database File:    {os.path.abspath(DB_NAME)}                 ")
    print("   Premi Ctrl + C per arrestare il server                       ")
    print("================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] Chiusura server in corso...")
        httpd.server_close()
        print("[Server] Chiuso correttamente.")

if __name__ == "__main__":
    if "--build-only" in sys.argv or "--init" in sys.argv:
        print("[Build] Ricreazione forzata del database SQLite 3...")
        init_database(force_recreate=True)
    else:
        init_database(force_recreate=False)
        port = DEFAULT_PORT
        host = DEFAULT_HOST
        args = sys.argv[1:]
        if "--host" in args:
            host = args[args.index("--host") + 1]
            if host not in ("127.0.0.1", "localhost"):
                print("[ATTENZIONE] Server esposto sulla rete: le API non hanno autenticazione.")
        for a in args:
            if a.isdigit():
                port = int(a)
        run_server(port=port, host=host)