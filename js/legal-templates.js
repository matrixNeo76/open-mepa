/**
 * MePA & Consip Desk Pro - Legal Templates & Document Generator
 * Modulo puro conforme al D.Lgs. 36/2023 (Nuovo Codice degli Appalti) e standard RFC 5545 (iCalendar).
 * Funziona sia nel browser (window.LegalTemplates) sia in Node (require) per la CI.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LegalTemplates = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Formatta data ISO in formato italiano leggibile (GG/MM/AAAA HH:mm)
   */
  function formatDateIt(isoStr) {
    if (!isoStr) return "N/D";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const pad = n => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
      return isoStr;
    }
  }

  /**
   * Genera fac-simile formale per la Richiesta di Chiarimenti (Q&A) ex art. 92 c.2 D.Lgs. 36/2023
   */
  function generateQaRequestText(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const authority = (p.authority || "Spett.le Stazione Appaltante").trim();
    const rup = (p.rup || "Responsabile Unico del Progetto").trim();
    const title = (p.title || "Procedura di gara").trim();
    const question = (p.question || "Si richiede chiarimento in merito alla clausola del Disciplinare di gara...").trim();
    const deadline = p.deadline ? formatDateIt(p.deadline) : "termine fissato nel bando";
    const qaDeadline = p.qa_deadline ? formatDateIt(p.qa_deadline) : "termine stabilito per i chiarimenti";
    const company = (p.companyName || "La scrivente Impresa").trim();
    const piva = (p.piva || "").trim();
    const rep = (p.legalRep || "Il Legale Rappresentante").trim();
    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    return `Spett.le
${authority}
All'attenzione del RUP: ${rup}
Trasmissione a mezzo Portale AcquistinretePA / Sezione Chiarimenti

Data: ${todayStr}

OGGETTO: PROCEDURA DI GARA: "${title}"
CIG: ${cig}
ISTANZA DI CHIARIMENTO EX ART. 92, COMMA 2, D.LGS. 36/2023

La sottoscritta impresa ${company}${piva ? ` (P.IVA/C.F. ${piva})` : ""}, in persona del legale rappresentante pro tempore, interessata a formulare regolare offerta per la procedura in oggetto, con termine perentorio di scadenza fissato per il ${deadline};

PREMESSO CHE:
- ai sensi dell'art. 92, comma 2, lett. a) del D.Lgs. 36/2023, le stazioni appaltanti devono fornire risposte e chiarimenti a tutti gli operatori economici almeno sei giorni prima della scadenza del termine fissato per la presentazione delle offerte (quattro giorni in caso di termini ridotti);
- la presente richiesta viene formulata tempestivamente entro il termine per la presentazione dei quesiti fissato per il ${qaDeadline};

CHIEDE RISPETTOSAMENTE A CODESTA STAZIONE APPALTANTE
di voler chiarire formalmente quanto segue:

${question}

---

Rimanendo in attesa del riscontro che verra' reso pubblico sul portale a beneficio di tutti i concorrenti, si porgono distinti saluti.

${company}
Firma digitale CAdES (.p7m):
${rep}
`;
  }

  /**
   * Formatta importo in valuta italiana (es. 12.345,67) in modo deterministico
   */
  function formatMoney(v) {
    if (v === undefined || v === null || v === "") return "[Importo in Euro]";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) return String(v);
    const parts = n.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${intPart},${parts[1]}`;
  }

  /**
   * Genera fac-simile formale per PEC di Richiesta Svincolo Cauzione Provvisoria ex art. 106 c.10 D.Lgs. 36/2023
   */
  function generateGuaranteeReleaseRequestText(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const authority = (p.authority || "Spett.le Stazione Appaltante").trim();
    const rup = (p.rup || "Responsabile Unico del Progetto").trim();
    const title = (p.title || "Procedura di gara").trim();
    const policyNumber = (p.policyNumber || "[Numero Polizza Fideiussoria]").trim();
    const guarantor = (p.guarantor || "[Istituto Bancario / Compagnia Assicurativa]").trim();
    const amount = formatMoney(p.amount);
    const outcome = (p.outcome || "conclusa").trim();
    const company = (p.companyName || "La scrivente Impresa").trim();
    const piva = (p.piva || "").trim();
    const rep = (p.legalRep || "Il Legale Rappresentante").trim();
    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    return `Spett.le
${authority}
All'attenzione del RUP: ${rup}
Trasmissione a mezzo Posta Elettronica Certificata (PEC)

Data: ${todayStr}

OGGETTO: RICHIESTA ATTESTAZIONE LIBERATORIA PER SVINCOLO GARANZIA PROVVISORIA (ART. 106, COMMA 10, D.LGS. 36/2023)
Gara: "${title}"
CIG: ${cig}
Polizza Fideiussoria n.: ${policyNumber} emessa da: ${guarantor}
Importo garantito: € ${amount}

La sottoscritta impresa ${company}${piva ? ` (P.IVA/C.F. ${piva})` : ""}, in persona del legale rappresentante pro tempore ${rep};

PREMESSO CHE:
1. Ha partecipato alla procedura concorsuale sopra individuata identificata con CIG ${cig};
2. A corredo dell'offerta ha costituito, ai sensi dell'art. 106 del D.Lgs. 36/2023, regolare garanzia provvisoria mediante polizza fideiussoria n. ${policyNumber} rilasciata da ${guarantor} per l'importo di € ${amount};
3. La procedura di gara risulta allo stato attuale ${outcome.toLowerCase()};

CONSIDERATO CHE:
- L'art. 106, comma 10 del D.Lgs. 36/2023 sancisce espressamente che:
  "La garanzia copre la mancata sottoscrizione del contratto dopo l'aggiudicazione dovuta ad ogni fatto riconducibile all'affidatario o all'adozione di un'informazione antimafia interdittiva... La garanzia cessa di avere effetto contestualmente alla stipula del contratto... Nei confronti degli altri concorrenti la garanzia cessa automaticamente con l'aggiudicazione definitiva";
- Ai fini della materiale cancellazione del vincolo fideiussorio e del ripristino del relativo fido assicurativo/bancario, l'Istituto Garante richiede formale attestazione liberatoria o comunicazione di avvenuta conclusione della procedura da parte della Stazione Appaltante;

TUTTO CIO' PREMESSO E CONSIDERATO,
SI CHIEDE CORTESEMENTE

a codesta Spett.le Amministrazione e al RUP in indirizzo di voler trasmettere a mezzo PEC formale comunicazione liberatoria di svincolo della garanzia fideiussoria sopra citata, ovvero copia del provvedimento di efficacia dell'aggiudicazione.

Ringraziando per la consueta collaborazione, si porgono cordiali saluti.

${company}
Firma digitale CAdES (.p7m):
${rep}
`;
  }

  /**
   * Genera calendario iCalendar RFC 5545 per importazione in Outlook, Google Calendar e Apple Calendar
   */
  function generateIcsCalendar(tenders) {
    const list = Array.isArray(tenders) ? tenders : [tenders];
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MePA and Consip Desk Pro//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const nowUtc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

    list.forEach(t => {
      if (!t) return;
      const cig = (t.cig || t.id || "GARA").trim().toUpperCase();
      const title = String(t.title || "Procedura MePA").replace(/\r?\n/g, " ").replace(/[;,]/g, " ");
      const authority = String(t.authority || "Stazione Appaltante").replace(/\r?\n/g, " ").replace(/[;,]/g, " ");
      const deadlineStr = t.deadline || "";

      let dObj = null;
      if (deadlineStr) {
        const d = new Date(deadlineStr);
        if (!isNaN(d.getTime())) dObj = d;
      }
      if (!dObj) return;

      const dtStart = `${dObj.getUTCFullYear()}${pad(dObj.getUTCMonth() + 1)}${pad(dObj.getUTCDate())}T${pad(dObj.getUTCHours())}${pad(dObj.getUTCMinutes())}00Z`;
      const dEndObj = new Date(dObj.getTime() + 3600000);
      const dtEnd = `${dEndObj.getUTCFullYear()}${pad(dEndObj.getUTCMonth() + 1)}${pad(dEndObj.getUTCDate())}T${pad(dEndObj.getUTCHours())}${pad(dEndObj.getUTCMinutes())}00Z`;
      const amountFmt = typeof t.amount === "number" ? `€ ${t.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : "N/D";
      const link = t.link || "https://www.acquistinretepa.it";

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:mepa-${cig}-${dtStart}@mepadesk.local`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      lines.push(`SUMMARY:[Scadenza MePA] ${cig} - ${title.slice(0, 50)}`);
      lines.push(`DESCRIPTION:CIG: ${cig}\\nStazione Appaltante: ${authority}\\nImporto a base di gara: ${amountFmt}\\nLink Portale: ${link}\\nPromemoria operativo: Verificare firma digitale CAdES (.p7m) delle 3 Buste prima della scadenza.`);
      lines.push("LOCATION:www.acquistinretepa.it");
      
      // Allarme a 24 ore dalla scadenza
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:Promemoria: 24h alla scadenza MePA CIG ${cig}`);
      lines.push("TRIGGER:-P1D");
      lines.push("END:VALARM");

      // Allarme urgente a 3 ore dalla scadenza
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:URGENTE: Ultime 3 ore per presentazione offerta MePA CIG ${cig}`);
      lines.push("TRIGGER:-PT3H");
      lines.push("END:VALARM");

      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  /**
   * Avvia il download nel browser di un file iCalendar .ics generato al volo
   */
  function downloadIcsFile(tenders, filename = "scadenza_mepa.ics") {
    const icsContent = generateIcsCalendar(tenders);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Escape sicuro per HTML
   */
  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Genera documento HTML formattato compatibile Microsoft Word (.doc / .docx) per la Scheda Bando (Fase 1)
   */
  function generateFase1SchedaHtml(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const title = (p.title || "Procedura di Gara").trim();
    const authority = (p.authority || "Stazione Appaltante").trim();
    const rup = (p.rup || "Da nominare / Disciplinare").trim();
    const amount = p.amount ? `€ ${formatMoney(p.amount)}` : "N/D";
    const deadline = p.deadline ? formatDateIt(p.deadline) : "N/D";
    const qaDeadline = p.qa_deadline ? formatDateIt(p.qa_deadline) : "N/D";
    const link = p.link || "https://www.acquistinretepa.it";
    const notes = p.notes || "";
    const company = (p.companyName || "MePA & Consip Desk Pro").trim();
    const now = new Date();
    const printDate = formatDateIt(now.toISOString());

    return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Scheda Bando MePA - CIG ${escapeHtml(cig)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; margin: 30px; }
    h1 { font-size: 18pt; color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 12px; }
    h2 { font-size: 13pt; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .badge { display: inline-block; padding: 4px 10px; background-color: #e0f2fe; color: #0369a1; font-weight: bold; font-family: Consolas, monospace; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 18px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-size: 10.5pt; }
    th { background-color: #f8fafc; font-weight: bold; color: #334155; width: 30%; }
    .highlight { background-color: #fef3c7; color: #92400e; font-weight: bold; }
    .footer { font-size: 9pt; color: #64748b; margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div style="text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 15px;">
    Documento generato da <strong>${escapeHtml(company)}</strong> &bull; Data: ${escapeHtml(printDate)}
  </div>

  <h1>SCHEDA SINTETICA PROCEDURA DI GARA</h1>
  <p><strong>CIG BDNCP ANAC:</strong> <span class="badge">${escapeHtml(cig)}</span></p>

  <h2>1. Dati Generali della Procedura</h2>
  <table>
    <tr><th>Oggetto della Procedura</th><td><strong>${escapeHtml(title)}</strong></td></tr>
    <tr><th>Stazione Appaltante</th><td>${escapeHtml(authority)}</td></tr>
    <tr><th>RUP (Responsabile Unico del Progetto)</th><td>${escapeHtml(rup)}</td></tr>
    <tr><th>Importo a Base di Gara</th><td><strong style="color: #0369a1;">${escapeHtml(amount)}</strong> (IVA esclusa)</td></tr>
    <tr><th>Piattaforma Telematica</th><td>Acquisti in Rete PA (Consip / MePA)</td></tr>
    <tr><th>Link Diretto alla Procedura</th><td><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></td></tr>
  </table>

  <h2>2. Scadenze e Cronoprogramma Perentorio</h2>
  <table>
    <tr><th>Termine Scadenza Chiarimenti (Q&A)</th><td class="highlight">${escapeHtml(qaDeadline)} (Art. 92 c.2 D.Lgs. 36/2023)</td></tr>
    <tr><th>Termine Presentazione Offerte (Perentorio)</th><td class="highlight" style="background-color: #fee2e2; color: #991b1b;">${escapeHtml(deadline)}</td></tr>
  </table>

  ${notes ? `
  <h2>3. Note Operative & Chiarimenti</h2>
  <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px; margin-top: 8px; font-size: 10.5pt;">
    ${escapeHtml(notes).replace(/\n/g, "<br>")}
  </div>
  ` : ""}

  <div class="footer">
    <p>Conforme al D.Lgs. 36/2023 (Nuovo Codice dei Contratti Pubblici). Il presente documento costituisce fascicolo interno aziendale di sintesi gara.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Genera documento Markdown per la Scheda Bando (Fase 1)
   */
  function generateFase1SchedaMd(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const title = (p.title || "Procedura di Gara").trim();
    const authority = (p.authority || "Stazione Appaltante").trim();
    const rup = (p.rup || "Da nominare / Disciplinare").trim();
    const amount = p.amount ? `€ ${formatMoney(p.amount)}` : "N/D";
    const deadline = p.deadline ? formatDateIt(p.deadline) : "N/D";
    const qaDeadline = p.qa_deadline ? formatDateIt(p.qa_deadline) : "N/D";
    const link = p.link || "https://www.acquistinretepa.it";
    const notes = p.notes || "";
    const now = new Date();
    const printDate = formatDateIt(now.toISOString());

    return `# SCHEDA SINTETICA PROCEDURA DI GARA
**CIG ANAC:** \`${cig}\`  
**Data Generazione:** ${printDate}  

---

## 1. Dati Generali dell'Appalto
- **Oggetto della Gara:** ${title}
- **Stazione Appaltante:** ${authority}
- **Responsabile Unico del Progetto (RUP):** ${rup}
- **Importo a Base di Gara:** **${amount}** (IVA esclusa)
- **Piattaforma:** Acquisti in Rete PA / MePA
- **Link Portale:** [Apri Procedura su MePA](${link})

## 2. Cronoprogramma e Scadenze Perentorie
| Tipologia Scadenza | Termine Perentorio | Norma di Riferimento |
| :--- | :--- | :--- |
| **Richiesta Chiarimenti (Q&A)** | \`${qaDeadline}\` | Art. 92, comma 2, D.Lgs. 36/2023 |
| **Presentazione Offerte** | \`${deadline}\` | Termine improrogabile di sistema |

${notes ? `## 3. Note Operative\n${notes}\n` : ""}
---
*Fascicolo interno generato da MePA & Consip Desk Pro in conformità al D.Lgs. 36/2023.*
`;
  }

  /**
   * Genera documento HTML formattato compatibile Microsoft Word (.doc / .docx) per il Verbale di Delibera Go/No-Go (Fase 2)
   */
  function generateFase2VerbaleHtml(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const title = (p.title || "Procedura di Gara").trim();
    const authority = (p.authority || "Stazione Appaltante").trim();
    const rup = (p.rup || "N/D").trim();
    const amount = p.amount ? `€ ${formatMoney(p.amount)}` : "N/D";
    const deadline = p.deadline ? formatDateIt(p.deadline) : "N/D";
    const go = (p.go_decision || "GO").toUpperCase();
    const isGo = go === "GO";
    const margin = p.margin_estimated_pct !== undefined ? `${p.margin_estimated_pct}%` : "12.5%";
    const checkFatturato = p.check_fatturato ? "CONFORME (Soglia art. 100 superata)" : "NON VERIFICATO / INSUFFICIENTE";
    const checkIso = p.check_iso ? "VERIFICATE (ISO 9001 / Certificazioni riduz. cauzione art. 106 c.8)" : "NON DISPONIBILI (Nessun abbattimento 30%)";
    const checkSopralluogo = p.check_sopralluogo ? "EFFETTUATO / NON RICHIESTO DAL DISCIPLINARE" : "DA SVOLGERE (A pena di esclusione ove prescritto)";
    const checkGaranzie = p.check_garanzie ? "CAPIENTE (Castelletto fideiussorio verificato con broker)" : "IN FASE DI VERIFICA CAPIENZA";
    const notes = p.notes || "";
    const company = (p.companyName || "La Direzione Aziendale").trim();
    const now = new Date();
    const printDate = formatDateIt(now.toISOString());

    return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Verbale Delibera Go/No-Go - CIG ${escapeHtml(cig)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; margin: 30px; }
    h1 { font-size: 17pt; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    h2 { font-size: 12pt; color: #334155; margin-top: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; font-size: 10pt; }
    th { background-color: #f8fafc; font-weight: bold; color: #334155; width: 35%; }
    .badge-go { display: inline-block; padding: 8px 16px; background-color: #dcfce7; color: #166534; font-weight: bold; font-size: 14pt; border: 2px solid #22c55e; border-radius: 6px; }
    .badge-nogo { display: inline-block; padding: 8px 16px; background-color: #fee2e2; color: #991b1b; font-weight: bold; font-size: 14pt; border: 2px solid #ef4444; border-radius: 6px; }
    .sign-box { margin-top: 40px; width: 100%; border: none; }
    .sign-box td { border: none; padding: 20px 10px; width: 50%; vertical-align: top; }
    .sign-line { border-top: 1px solid #64748b; margin-top: 40px; padding-top: 5px; font-size: 9.5pt; color: #475569; }
    .footer { font-size: 9pt; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div style="text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 15px;">
    Documento Interno di Qualificazione Gara &bull; Verbale N. DEL-${escapeHtml(cig)}-${now.getFullYear()}
  </div>

  <h1>VERBALE DI QUALIFICAZIONE E DELIBERA PARTECIPAZIONE (GO / NO-GO)</h1>
  <p><strong>Procedura CIG ANAC:</strong> <span style="font-family: Consolas, monospace; font-weight: bold;">${escapeHtml(cig)}</span></p>

  <h2>1. Dati Essenziali Procedura di Gara</h2>
  <table>
    <tr><th>Oggetto della Fornitura/Servizio</th><td><strong>${escapeHtml(title)}</strong></td></tr>
    <tr><th>Stazione Appaltante / Ente</th><td>${escapeHtml(authority)}</td></tr>
    <tr><th>RUP</th><td>${escapeHtml(rup)}</td></tr>
    <tr><th>Base d'Asta Complessiva</th><td><strong>${escapeHtml(amount)}</strong> (IVA esclusa)</td></tr>
    <tr><th>Scadenza Presentazione Offerte</th><td>${escapeHtml(deadline)}</td></tr>
  </table>

  <h2>2. Checklist Requisiti di Ammissibilità (D.Lgs. 36/2023)</h2>
  <table>
    <tr><th>Fatturato Triennale Specifico (Art. 100 c.11)</th><td>${escapeHtml(checkFatturato)}</td></tr>
    <tr><th>Certificazioni ISO &amp; Riduzioni Fideiussorie (Art. 106 c.8)</th><td>${escapeHtml(checkIso)}</td></tr>
    <tr><th>Attestato di Sopralluogo Obbligatorio (Ove prescritto)</th><td>${escapeHtml(checkSopralluogo)}</td></tr>
    <tr><th>Capienza Castelletto Fideiussorio / Garanzia Provvisoria</th><td>${escapeHtml(checkGaranzie)}</td></tr>
  </table>

  <h2>3. Analisi Economica e Sostenibilità di Commessa</h2>
  <table>
    <tr><th>Margine Operativo Netto Stimato (Target)</th><td><strong>${escapeHtml(margin)}</strong></td></tr>
    <tr><th>Valutazione Congruità &amp; Rischio Anomalia (Art. 110)</th><td>Offerta formulata nel rispetto dei costi del personale e della sicurezza aziendale</td></tr>
  </table>

  <h2>4. Delibera Finale del Comitato Gare</h2>
  <div style="text-align: center; margin: 20px 0;">
    ${isGo
      ? `<span class="badge-go">🟢 DELIBERA FAVOREVOLE (GO): PARTECIPAZIONE APPROVATA</span>`
      : `<span class="badge-nogo">🔴 DELIBERA CONTRARIA (NO-GO): PROCEDURA ARCHIVIATA</span>`
    }
  </div>

  ${notes ? `
  <div style="background-color: #f8fafc; border-left: 4px solid ${isGo ? '#22c55e' : '#ef4444'}; padding: 12px; margin-top: 10px; font-size: 10pt;">
    <strong>Motivazioni e Note della Delibera:</strong><br>
    ${escapeHtml(notes).replace(/\n/g, "<br>")}
  </div>
  ` : ""}

  <table class="sign-box">
    <tr>
      <td>
        <strong>Il Responsabile Ufficio Gare:</strong>
        <div class="sign-line">Firma per esteso e data</div>
      </td>
      <td>
        <strong>La Direzione Generale / Legale Rappresentante:</strong>
        <div class="sign-line">Firma digitale per approvazione (${escapeHtml(company)})</div>
      </td>
    </tr>
  </table>

  <div class="footer">
    <p>Verbale redatto ai fini del sistema di gestione qualità aziendale e per l'audit trail delle decisioni d'appalto.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Genera documento Markdown per il Verbale di Delibera Go/No-Go (Fase 2)
   */
  function generateFase2VerbaleMd(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const title = (p.title || "Procedura di Gara").trim();
    const authority = (p.authority || "Stazione Appaltante").trim();
    const rup = (p.rup || "N/D").trim();
    const amount = p.amount ? `€ ${formatMoney(p.amount)}` : "N/D";
    const deadline = p.deadline ? formatDateIt(p.deadline) : "N/D";
    const go = (p.go_decision || "GO").toUpperCase();
    const isGo = go === "GO";
    const margin = p.margin_estimated_pct !== undefined ? `${p.margin_estimated_pct}%` : "12.5%";
    const checkFatturato = p.check_fatturato ? "✓ CONFORME (art. 100 c.11 superato)" : "✗ NON VERIFICATO";
    const checkIso = p.check_iso ? "✓ DISPONIBILI (ISO 9001 -30% cauzione)" : "✗ NON APPLICATE";
    const checkSopralluogo = p.check_sopralluogo ? "✓ VERIFICATO / NON RICHIESTO" : "✗ DA EFFETTUARE";
    const checkGaranzie = p.check_garanzie ? "✓ CAPIENTE (Castelletto verificato)" : "✗ VERIFICA PENDENTE";
    const notes = p.notes || "";
    const now = new Date();
    const printDate = formatDateIt(now.toISOString());

    return `# VERBALE DI QUALIFICAZIONE E DELIBERA PARTECIPAZIONE (GO / NO-GO)
**Procedura CIG ANAC:** \`${cig}\`  
**Data Verbale:** ${printDate}  

---

## 1. Dati Procedura
- **Oggetto della Gara:** ${title}
- **Stazione Appaltante:** ${authority}
- **RUP:** ${rup}
- **Base d'Asta:** **${amount}** (IVA esclusa)
- **Scadenza Offerte:** ${deadline}

## 2. Esito Checklist Requisiti
| Requisito di Partecipazione | Esito Verifica | Riferimento D.Lgs. 36/2023 |
| :--- | :--- | :--- |
| **Fatturato Triennale Specifico** | ${checkFatturato} | Art. 100, comma 11 |
| **Certificazioni Qualità ISO** | ${checkIso} | Art. 106, comma 8 |
| **Attestato Sopralluogo** | ${checkSopralluogo} | Disciplinare di gara |
| **Plafond Cauzioni Fideiussorie** | ${checkGaranzie} | Capienza con broker |

## 3. Parametri Economici
- **Margine Operativo Netto Stimato:** **${margin}**
- **Verifica Rischio Anomalia (Art. 110):** Valutata la sostenibilità dei costi di manodopera e della sicurezza.

## 4. Delibera Finale
> **ESITO DELIBERA:** **${isGo ? "🟢 GO - PARTECIPAZIONE APPROVATA" : "🔴 NO-GO - PROCEDURA ARCHIVIATA"}**

${notes ? `### Note e Prescrizioni del Comitato\n${notes}\n` : ""}
---
**Firme:**  
- *Responsabile Ufficio Gare:* ___________________________________  
- *La Direzione Generale:* ___________________________________  
`;
  }

  /**
   * Genera un file CSV compatibile al 100% con Microsoft Excel (BOM UTF-8, delimitatore ';') per il Business Case di Fase 2
   */
  function generateFase2BusinessCaseCsv(params) {
    const p = params || {};
    const cig = (p.cig || "N/D").trim().toUpperCase();
    const title = (p.title || "Procedura di Gara").replace(/[\r\n;]/g, " ").trim();
    const authority = (p.authority || "Stazione Appaltante").replace(/[\r\n;]/g, " ").trim();
    const baseAmount = Number(p.amount) || 0;
    const discountPct = Number(p.discount_pct) || 5.5;
    const offeredPrice = baseAmount > 0 ? baseAmount * (1 - discountPct / 100) : 0;
    const manodopera = Number(p.manodopera) || Math.round(offeredPrice * 0.25);
    const sicurezza = Number(p.sicurezza) || Math.round(offeredPrice * 0.02);
    const costDirect = Math.round(offeredPrice * 0.60);
    const totalCost = costDirect + manodopera + sicurezza;
    const grossMargin = offeredPrice - totalCost;
    const grossMarginPct = offeredPrice > 0 ? ((grossMargin / offeredPrice) * 100).toFixed(2) : "0.00";
    const fideiussioneCost = Math.round(baseAmount * 0.02 * 0.5 * 0.015); // Stima costo polizza 1.5% su cauzione ridotta 50%
    const netMargin = grossMargin - fideiussioneCost;
    const netMarginPct = offeredPrice > 0 ? ((netMargin / offeredPrice) * 100).toFixed(2) : "0.00";
    const go = (p.go_decision || "GO").toUpperCase();
    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    // Helper per numeri italiani con virgola per Excel
    const nFmt = n => String(Number(n || 0).toFixed(2)).replace(".", ",");

    const lines = [
      "BUSINESS CASE E ANALISI DI REDDITIVITA' GARA;MePA & Consip Desk Pro",
      `CIG ANAC;${cig}`,
      `Oggetto Appalto;${title}`,
      `Stazione Appaltante;${authority}`,
      `Data Elaborazione;${todayStr}`,
      `Delibera Comitato;${go}`,
      "",
      "VOCE DI COSTO / RICAVO;VALORE IN EURO;PERCENTUALE;NOTE NORMATIVE & METODOLOGICHE",
      `Importo a Base di Gara;${nFmt(baseAmount)};100,00%;Importo massimo stimato dalla Stazione Appaltante`,
      `Ribasso Percentuale Ipotizzato;${nFmt(baseAmount - offeredPrice)};${nFmt(discountPct)}%;Sconto applicato alla base d'asta`,
      `Prezzo Netto Offerto Previsto;${nFmt(offeredPrice)};${nFmt(100 - discountPct)}%;Ricavo complessivo di commessa (IVA esclusa)`,
      `Costi Diretti Industriali / Materiali;${nFmt(costDirect)};${offeredPrice > 0 ? nFmt((costDirect/offeredPrice)*100) : "0,00"}%;Acquisto beni, licenze, apparati o subforniture`,
      `Costi della Manodopera Previsti;${nFmt(manodopera)};${offeredPrice > 0 ? nFmt((manodopera/offeredPrice)*100) : "0,00"}%;Art. 108 c. 9 D.Lgs. 36/2023 (inderogabili)`,
      `Oneri Aziendali della Sicurezza;${nFmt(sicurezza)};${offeredPrice > 0 ? nFmt((sicurezza/offeredPrice)*100) : "0,00"}%;D.Lgs. 81/2008 (DPI, formazione, visite mediche)`,
      `Costo Totale Industriale Stimato;${nFmt(totalCost)};${offeredPrice > 0 ? nFmt((totalCost/offeredPrice)*100) : "0,00"}%;Somma costi industriali + personale + sicurezza`,
      `Margine Operativo Lordo (MOL);${nFmt(grossMargin)};${grossMarginPct}%;Prezzo Offerto - Costo Totale Industriale`,
      `Costo Garanzia Fideiussoria Provvisoria;${nFmt(fideiussioneCost)};${offeredPrice > 0 ? nFmt((fideiussioneCost/offeredPrice)*100) : "0,00"}%;Premio stimato garanzia ex art. 106 D.Lgs. 36/2023`,
      `MARGINE OPERATIVO NETTO FINALE;${nFmt(netMargin)};${netMarginPct}%;Margine residuo al netto dei costi di partecipazione`,
      "",
      "VERIFICA CONGRUITA' ECONOMICA (ART. 110 D.LGS. 36/2023)",
      `${netMargin >= 0 ? "CONGRUA (Margine positivo sostenibile)" : "A RISCHIO (Margine negativo o incongruo)"};Target Aziendale: ${p.margin_estimated_pct || 12.5}%;Valutazione preventiva per verifica di anomalia`
    ];

    // BOM UTF-8 (\uFEFF) per garantire che Excel su Windows apra correttamente lettere accentate e colonne
    return "\uFEFF" + lines.join("\r\n");
  }

  /**
   * Genera l'oggetto JSON strutturato per la Fase 2 (Qualificazione & Delibera)
   */
  function generateFase2Json(params) {
    const p = params || {};
    return {
      metadata: {
        generator: "MePA & Consip Desk Pro - Workflow Deterministico",
        version: "2.0",
        generated_at: new Date().toISOString()
      },
      tender: {
        cig: (p.cig || "N/D").trim().toUpperCase(),
        title: p.title || "",
        authority: p.authority || "",
        rup: p.rup || "",
        amount: Number(p.amount) || 0,
        deadline: p.deadline || null,
        qa_deadline: p.qa_deadline || null
      },
      qualification_checklist: {
        check_fatturato: Boolean(p.check_fatturato),
        check_iso: Boolean(p.check_iso),
        check_sopralluogo: Boolean(p.check_sopralluogo),
        check_garanzie: Boolean(p.check_garanzie)
      },
      business_case: {
        base_amount: Number(p.amount) || 0,
        margin_estimated_pct: Number(p.margin_estimated_pct) || 12.5,
        target_sustainable: (Number(p.margin_estimated_pct) || 0) >= 8.0
      },
      deliberation: {
        outcome: (p.go_decision || "GO").toUpperCase(),
        notes: p.notes || "",
        deliberated_at: new Date().toISOString()
      }
    };
  }

  return {
    generateQaRequestText,
    generateGuaranteeReleaseRequestText,
    generateIcsCalendar,
    downloadIcsFile,
    formatDateIt,
    formatMoney,
    generateFase1SchedaHtml,
    generateFase1SchedaMd,
    generateFase2VerbaleHtml,
    generateFase2VerbaleMd,
    generateFase2BusinessCaseCsv,
    generateFase2Json
  };
});
