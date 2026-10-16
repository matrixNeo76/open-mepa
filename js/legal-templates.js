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

  return {
    generateQaRequestText,
    generateGuaranteeReleaseRequestText,
    generateIcsCalendar,
    downloadIcsFile,
    formatDateIt
  };
});
