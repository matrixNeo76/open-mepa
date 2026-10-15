# Design Brief: MePA & Consip Desk Pro - Wizard & Workflow Deterministico Gara

## 1. Visione del Prodotto & Obiettivo Operativo
Fornire alle PMI e agli operatori dell'ufficio gare uno strumento deterministico step-by-step (Wizard) che guidi l'utente attraverso le 4 fasi canoniche del ciclo di vita di un appalto pubblico su **acquistinretepa.it** (MePA / Consip / ASP):
1. **Fase 1: Identificazione & Presa in Carico** (CIG, RUP, termini Q&A).
2. **Fase 2: Valutazione & Qualificazione Go/No-Go** (Requisiti speciali, fatturato, sopralluogo, certificazioni).
3. **Fase 3: Predisposizione Buste Telematiche** (Busta A Amministrativa con DGUE/Fideiussione/FVOE 2.0; Busta B Tecnica; Busta C Economica con ribasso e costi manodopera ex art. 108 D.Lgs. 36/2023).
4. **Fase 4: Esito, Aggiudicazione & Svincolo Garanzie** (Aggiudicazione, svincolo cauzione provvisoria, archiviazione).

## 2. Requisito Chiave: Dual Hand-Off (Manuale o Agentico Browser-Use)
Ogni singolo step e ciascuna busta generano:
- **Tasti di Copia Rapida (`Copy to Clipboard` con feedback visivo)** per incollare istantaneamente testi, CIG, importi e codici direttamente nei campi del portale `acquistinretepa.it`.
- **Manifest Documentale**: checklist di file richiesti con naming convention standard e verifica firma digitale `.p7m`.
- **Export JSON Deterministico ("Agent Payload")**: schema formale consumabile da agenti basati su *browser-use* / Playwright / Puppeteer per eseguire l'automazione autonoma delle submission sul portale.

## 3. Vincoli Legali & Normativi (D.Lgs. 36/2023)
- Divieto assoluto di commistione tra offerta tecnica ed economica (la Busta C deve rimanere sigillata e separata).
- Tracciamento obbligatorio di costi manodopera e oneri aziendali per la sicurezza.
- Verifica data limite per la richiesta di chiarimenti (termini decadenziali Q&A).

## 4. Filosofia Visiva & Interaction Design
- Aderenza ai principi `ui-craft-dense-dashboard` e `ui-ux-pro-max` (Enterprise B2B / Gov):
  - Palette scura professionale ad alto contrasto (sfondo `#0b1120`, navy `#0f172a`, accenti ciano/sky `#38bdf8`, ambra per alert, smeraldo per conferme).
  - Nessuna emoji nei controlli critici: solo icone SVG vettoriali (Heroicons/Lucide).
  - Stepper visivo chiaro orizzontale con avanzamento di stato vincolato (non si salta la Busta A se mancano dati obbligatori).
  - Zero librerie esterne: Vanilla JS modulare ad alte prestazioni, CSS con Tailwind e persistenza SQLite 3 sia via backend locale che Wasm.
