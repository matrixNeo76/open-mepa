# Cartella Dataset Consip Open Data (`/json`)

Questa cartella è destinata all'archiviazione locale dei dump completi scaricati dal portale Open Data Consip ([dati.consip.it](https://dati.consip.it/)).

> **Nota**: I file JSON di grandi dimensioni (`*.json`) sono esclusi dal tracciamento git (`.gitignore`) per evitare di superare i limiti di dimensione di GitHub (100 MB).

## Dataset supportati e mappatura

1. **Bandi e Gare MePA / Consip** (`bandiegare2026.json` / `rdo-td-bandite-mepa-2026.json`):
   - Flusso bandi attivi, scadenze, importi e stazioni appaltanti.
2. **Cataloghi e Metaprodotto MePA** (`cataloghi2026.json`):
   - Oltre 280.000 articoli, codici CPV e prezzi di riferimento.
3. **Anagrafica Amministrazioni** (`amministrazioni2026.json`):
   - Oltre 20.000 enti pubblici, comuni, province, ASL e ministeri.
4. **Partecipazioni e Aggiudicazioni** (`partecipazioni2026.json`):
   - Storico gare, ribassi e operatori economici aggiudicatari.

## Ingestion automatica

Per processare e caricare i file JSON nel database relazionale SQLite 3 locale (`gare_consip.db`), eseguire lo script di streaming:

```bash
python consip_stream_ingestion.py
```
