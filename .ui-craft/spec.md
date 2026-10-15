# Spec & Shape: Surface "wizard-gara"
# Framework: Spec-Driven Design (sddesign)

## Surface: wizard-gara
**Target Audience**: Operatori ufficio gare, PMI fornitrici MePA/Consip, agenti autonomi di automazione web (browser-use).  
**Primary Goal**: Guidare la preparazione e sottomissione di un'offerta su acquistinretepa.it in 4 step sequenziali con output copiabili/esportabili.

---

### 1. Content Inventory by Priority

#### P0 (Visible & Mandatory per Step)
- **Top Stepper Bar**: 4 step numerati (1. Identificazione, 2. Valutazione Go/No-Go, 3. Le 3 Buste, 4. Esito & Svincolo) con indicatore di progresso % e badge CIG attivo.
- **Header Gara Attiva**: CIG, Oggetto sintetico, Ente Appaltante, Scadenza conto alla rovescia, Importo base d'asta.
- **Active Step Work Area**:
  - *Step 1*: Dati bando, RUP, link diretto portale, termine decadenziale per invio quesiti/chiarimenti (Q&A).
  - *Step 2*: Checklist Go/No-Go (Requisiti fatturato specifico, Certificazioni ISO, Obbligo sopralluogo, Margine % stimato), decisione formale (GO / NO-GO).
  - *Step 3 (Le 3 Buste)*:
    - *Tab Busta A (Amministrativa)*: DGUE elettronico, Garanzia provvisoria fideiussoria, FVOE 2.0 / PassOE, Patto d'integrità.
    - *Tab Busta B (Tecnica)*: Relazione tecnica, schede prodotto, criteri premiali CAM.
    - *Tab Busta C (Economica)*: Ribasso %, Prezzo netto offerto, Costi manodopera scorporati, Oneri sicurezza aziendali.
  - *Step 4*: Esito (Vinta/Persa), Graduatoria, Richiesta svincolo polizza cauzione provvisoria, note di chiusura.
- **Action Dock (In basso)**:
  - Tasto `[ Copia Valori per Portale MePA ]` (Copia rapida negli appunti del blocco corrente).
  - Tasto `[ Esporta Payload per Agente JSON ]` (Scarica o visualizza l'oggetto strutturato per browser-use).
  - Tasto `[ Salva & Avanza ]` / `[ Indietro ]`.

#### P1 (One-click away / Collapsible)
- **Document Manifest Modal / Drawer**: elenco file da caricare con estensione `.p7m` richiesta e naming standard (es. `CIG_BustaA_DGUE.pdf.p7m`).
- **Live Json Inspector**: anteprima in tempo reale del JSON payload per l'agente.
- **Log Chiarimenti / Q&A**: diario delle domande inviate alla stazione appaltante e risposte ricevute.

#### P2 (Settings & Archives)
- Template predefiniti dichiarazioni integrative.
- Sincronizzazione con tabella `gare` SQLite.

---

### 2. ASCII Layout Sketch

```
+---------------------------------------------------------------------------------------------------+
| [← Torna a Elenco Gare]   GARA: CIG [ 9845123A45 ] - Fornitura Server e TLC         [ Salva DB ]  |
+---------------------------------------------------------------------------------------------------+
|  STEPPER: (1) Identificazione ─── (2) Go/No-Go ─── [3] Le 3 Buste ─── (4) Esito & Chiusura        |
+---------------------------------------------------------------------------------------------------+
| GARA SUMMARY BAR: Ente: Comune di Milano | Base Asta: € 145.000,00 | Scadenza: 24/11/2026 (12gg)  |
+---------------------------------------------------------------------------------------------------+
| CONTENUTO STEP ATTIVO (Esempio: STEP 3 - LE 3 BUSTE):                                             |
|                                                                                                   |
|  [ Busta A: Amministrativa ]    [ Busta B: Tecnica ]    [ Busta C: Economica ]                    |
|  -----------------------------------------------------------------------------                    |
|  DOCUMENTAZIONE OBBLIGATORIA:                                                                     |
|  [✓] DGUE Elettronico (Compilato e firmato digitalmente)           [ Copia Dati DGUE ]            |
|  [✓] Fideiussione Provvisoria (Importo ridotto: € 1.450,00)         [ Calcola Riduzione ]          |
|  [✓] PassOE / FVOE 2.0 (Fascicolo Virtuale Operatore Economico)     [ Verifica FVOE ]              |
|  [✓] Dichiarazioni Integrative & Modulistica Consip                [ Copia Note ]                 |
|                                                                                                   |
|  NAMING FILE RICHIESTO PER IL PORTALE:                                                            |
|  • File 1: CIG_9845123A45_DGUE.pdf.p7m                               [ Copia Nome File ]          |
|  • File 2: CIG_9845123A45_GaranziaProvvisoria.pdf.p7m               [ Copia Nome File ]          |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
| DOCK AZIONI RAPIDE:                                                                               |
| [ ← Precedente ]   | [ 📋 Copia Tutto per MePA ] [ 🤖 Esporta JSON Agente ] | [ Salva e Avanza → ] |
+---------------------------------------------------------------------------------------------------+
```

---

### 3. Agent Payload Schema (Contratto per Browser-Use / Automazione)

```json
{
  "contract_type": "mepa_consip_tender_payload",
  "version": "1.0",
  "cig": "9845123A45",
  "authority": "Comune di Milano",
  "deadline": "2026-11-24T18:00:00",
  "step": 3,
  "busta_a": {
    "dgue_ready": true,
    "fideiussione_importo": 1450.00,
    "fideiussione_garante": "Generali Assicurazioni S.p.A.",
    "fvoe_passoe_code": "PASSOE-8839210",
    "files": [
      { "field_name": "DGUE", "file_name": "CIG_9845123A45_DGUE.pdf.p7m" },
      { "field_name": "Garanzia", "file_name": "CIG_9845123A45_Garanzia.pdf.p7m" }
    ]
  },
  "busta_b": {
    "technical_specs_ready": true,
    "files": [
      { "field_name": "OffertaTecnica", "file_name": "CIG_9845123A45_OffertaTecnica.pdf.p7m" }
    ]
  },
  "busta_c": {
    "base_amount": 145000.00,
    "discount_percentage": 7.45,
    "offered_price": 134197.50,
    "manodopera_costs": 32000.00,
    "security_costs": 2500.00,
    "files": [
      { "field_name": "OffertaEconomica", "file_name": "CIG_9845123A45_OffertaEconomica.pdf.p7m" }
    ]
  }
}
```

---

### 4. Matrice degli Stati (State Lattice)
- **idle**: Gara selezionata, caricati i dati da SQLite, visualizzazione dello step corrente.
- **empty**: Nessuna gara selezionata per il wizard $\rightarrow$ mostra pulsante per selezionare una gara dal cruscotto o inserirne una nuova.
- **saving**: Salvataggio dei campi e delle spunte nel database locale.
- **copied**: Feedback visivo sul pulsante di copia (diventa verde *"Copiato!"* per 2 secondi).
- **agent_exported**: Apertura modal con JSON formattato e download del file `.json` per il runner di browser-use.
