/**
 * MePA & Consip Desk Pro - Amministrazioni View Controller
 * Gestione anagrafica stazioni appaltanti, codici fiscali, IPA e punti ordinanti PA.
 * Conforme alle specifiche di accessibilità WCAG 2.1 AA, numeri tabellari e palette istituzionale.
 */

let ammCurrentPage = 1;
let ammTotalPages = 1;
let ammFiltersLoaded = false;
let ammSearchDebounceTimer = null;
let currentAmmItemsCache = [];

/**
 * Estrae il termine di ricerca ottimale per trovare le gare di un'amministrazione
 */
function getAuthoritySearchTerm(item) {
  if (!item || !item.denominazione) return '';
  const raw = item.denominazione.trim();
  const upper = raw.toUpperCase();
  
  if (upper.includes("CONSIP")) return "Consip";
  
  if (upper.startsWith("COMUNE DI ")) return raw;
  if (upper.startsWith("CITTA' METROPOLITANA DI ") || upper.startsWith("CITTA METROPOLITANA DI ")) return raw;
  if (upper.startsWith("PROVINCIA DI ") || upper.startsWith("PROVINCIA AUTONOMA DI ")) return raw;
  if (upper.startsWith("REGIONE ")) return raw;
  
  if (raw.length > 25) {
    const words = raw.split(/[\s,()/-]+/).filter(w => {
      const u = w.toUpperCase();
      return w.length >= 3 && !['DELLA', 'DELLE', 'DEGLI', 'DELLO', 'DEI', 'DEL', 'ALLA', 'ALLE', 'AGLI', 'ALLO', 'PER', 'CON', 'FRA', 'TRA', 'SPA', 'SRL', 'SOCIETA', 'ENTE', 'AZIENDA', 'ISTITUTO', 'COMPRENSIVO', 'DIREZIONE', 'SETTORE', 'AREA', 'SERVIZIO', 'UFFICIO', 'TERRITORIALE'].includes(u);
    });
    if (words.length > 0) {
      return words.slice(0, 2).join(' ');
    }
  }
  return raw;
}

/**
 * Calcola in tempo reale il numero di procedure attive e totali collegate a un'amministrazione
 */
function getAuthorityTenderCounts(item) {
  if (!item) return { active: 0, total: 0, query: '' };
  
  const all = (typeof getAllTendersFromSQLite === "function") 
    ? getAllTendersFromSQLite() 
    : (window.allTenders || window.fallbackTenders || []);
    
  if (!all || !Array.isArray(all) || all.length === 0) {
    return { active: 0, total: 0, query: '' };
  }
  
  const query = getAuthoritySearchTerm(item);
  if (!query) return { active: 0, total: 0, query: '' };
  
  const termLower = query.toLowerCase();
  const cf = (item.codice_fiscale || '').trim().toLowerCase();
  
  let active = 0;
  let total = 0;
  
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    if (!t) continue;
    
    const auth = (t.authority || '').toLowerCase();
    const title = (t.title || '').toLowerCase();
    const owner = (t.owner || '').toLowerCase();
    const cig = (t.cig || '').toLowerCase();
    
    const matches = (termLower && (auth.includes(termLower) || title.includes(termLower) || owner.includes(termLower))) ||
                    (cf && cf.length > 5 && (auth.includes(cf) || title.includes(cf) || owner.includes(cf) || cig.includes(cf)));
                    
    if (matches) {
      total++;
      let isActive = true;
      if (typeof window.isTenderActive === "function") {
        isActive = window.isTenderActive(t);
      } else {
        const isConcluded = ["Vinta", "Persa", "Scartata", "AGGIUDICATA", "DESERTA", "REVOCATA", "ANNULLATA"].includes(t.status);
        if (isConcluded) {
          isActive = false;
        } else if (t.status === "Inviata") {
          isActive = true;
        } else if (t.deadline) {
          const d = new Date(t.deadline);
          isActive = isNaN(d.getTime()) || d.getTime() >= Date.now();
        }
      }
      if (isActive) active++;
    }
  }
  
  return { active, total, query };
}

/**
 * Caricamento asincrono paginato delle stazioni appaltanti dal backend SQLite
 */
async function loadAmministrazioni() {
  const q = document.getElementById("ammSearchInput") ? document.getElementById("ammSearchInput").value.trim() : "";
  const reg = document.getElementById("ammRegionSelect") ? document.getElementById("ammRegionSelect").value : "";
  const tipo = document.getElementById("ammTipologiaSelect") ? document.getElementById("ammTipologiaSelect").value : "";
  const minPo = document.getElementById("ammPoFilterSelect") ? document.getElementById("ammPoFilterSelect").value : "0";
  const pageSize = document.getElementById("ammPageSizeSelect") ? parseInt(document.getElementById("ammPageSizeSelect").value) : 25;

  const tbody = document.getElementById("ammTableBody");
  const infoSpan = document.getElementById("ammResultsInfo");
  const infoSpanBottom = document.getElementById("ammResultsInfoBottom");
  const paginationText = document.getElementById("ammPaginationText");
  const firstBtn = document.getElementById("ammFirstPageBtn");
  const prevBtn = document.getElementById("ammPrevPageBtn");
  const nextBtn = document.getElementById("ammNextPageBtn");
  const lastBtn = document.getElementById("ammLastPageBtn");

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-16 text-center text-slate-400 font-mono">
          <div class="flex flex-col items-center justify-center gap-2">
            <svg class="w-6 h-6 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span class="text-xs">Interrogazione anagrafica PA (20.776 stazioni appaltanti)...</span>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                   (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    
    const queryParams = new URLSearchParams({
      page: ammCurrentPage.toString(),
      pageSize: pageSize.toString(),
      q: q,
      regione: reg,
      tipologia: tipo,
      min_po: minPo
    });

    const resp = await fetch(`${origin}/api/amministrazioni?${queryParams.toString()}`);
    if (!resp.ok) throw new Error("Server HTTP non raggiungibile o tabella non inizializzata");
    const data = await resp.json();

    // Popola filtri regione e tipologia al primo caricamento
    if (!ammFiltersLoaded) {
      if (data.regions && data.regions.length) {
        const selectReg = document.getElementById("ammRegionSelect");
        if (selectReg) {
          data.regions.forEach(r => {
            if (!r) return;
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            selectReg.appendChild(opt);
          });
        }
      }
      if (data.tipologie && data.tipologie.length) {
        const selectTipo = document.getElementById("ammTipologiaSelect");
        if (selectTipo) {
          data.tipologie.forEach(t => {
            if (!t) return;
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            selectTipo.appendChild(opt);
          });
        }
      }
      ammFiltersLoaded = true;
    }

    const total = data.total || 0;
    ammTotalPages = data.totalPages || 1;
    const items = data.items || [];
    currentAmmItemsCache = items;

    const infoText = `Trovate ${total.toLocaleString('it-IT')} stazioni appaltanti (Pagina ${ammCurrentPage} di ${ammTotalPages})`;
    if (infoSpan) infoSpan.textContent = infoText;
    if (infoSpanBottom) infoSpanBottom.textContent = infoText;
    if (paginationText) paginationText.textContent = `Pagina ${ammCurrentPage} di ${ammTotalPages}`;
    
    if (firstBtn) firstBtn.disabled = ammCurrentPage <= 1;
    if (prevBtn) prevBtn.disabled = ammCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = ammCurrentPage >= ammTotalPages;
    if (lastBtn) lastBtn.disabled = ammCurrentPage >= ammTotalPages;

    if (items.length === 0) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="px-4 py-16 text-center text-slate-400 font-mono">
              <div class="flex flex-col items-center justify-center gap-2">
                <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                <span class="text-xs font-semibold text-slate-300">Nessuna stazione appaltante trovata con i filtri selezionati.</span>
                <span class="text-[11px] text-slate-500">Prova a modificare il testo di ricerca (es. Codice Fiscale, IPA o Comune).</span>
              </div>
            </td>
          </tr>
        `;
      }
      return;
    }

    if (tbody) {
      tbody.innerHTML = items.map((item) => {
        const poCount = item.po_attivi || 0;
        const tenderCounts = getAuthorityTenderCounts(item);
        const hasActiveTenders = tenderCounts.active > 0;
        
        // Badge Punti Ordinanti con semaforo
        let poBadge = `<span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-slate-800 text-slate-400 border border-slate-700/80" title="Nessun Punto Ordinante attivo segnalato su MePA">0 PO</span>`;
        if (poCount >= 5) {
          poBadge = `<span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="${poCount} Punti Ordinanti MePA abilitati (Alto volume)">${poCount} PO</span>`;
        } else if (poCount > 0) {
          poBadge = `<span class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20" title="${poCount} Punti Ordinanti MePA abilitati">${poCount} PO</span>`;
        }

        const cfFormatted = item.codice_fiscale && item.codice_fiscale.trim() !== '' 
          ? `
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-cyan-400 font-bold text-xs tracking-wider">${escapeHtml(item.codice_fiscale)}</span>
              <button type="button" onclick="window.copyAmmField(${item.id}, 'codice_fiscale', event)" class="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition touch-target-action" title="Copia Codice Fiscale">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          `
          : `<span class="text-slate-500 font-mono text-[11px]">-</span>`;

        const ipaFormatted = item.ipa && item.ipa.trim() !== ''
          ? `
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-sky-300 font-bold text-xs uppercase tracking-wider">${escapeHtml(item.ipa)}</span>
              <button type="button" onclick="window.copyAmmField(${item.id}, 'ipa', event)" class="p-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition touch-target-action" title="Copia Codice IPA / SDI">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          `
          : `<span class="text-slate-500 font-mono text-[11px]">-</span>`;

        // Pulsante Bandi con contatore e badge semaforico
        const bandiActionHtml = hasActiveTenders ? `
          <button type="button" onclick="window.filterGareByAuthorityId(${item.id}, event);" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold transition flex items-center gap-1.5 shadow-sm shadow-emerald-950/40 group/btn" title="${tenderCounts.active} procedure attive e aperte per ${escapeHtml(item.denominazione)}">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Bandi</span>
            <span class="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] font-mono font-bold tabular-nums">${tenderCounts.active.toLocaleString('it-IT')}</span>
            <span class="group-hover/btn:translate-x-0.5 transition-transform">&rarr;</span>
          </button>
        ` : `
          <button type="button" onclick="window.filterGareByAuthorityId(${item.id}, event);" class="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 text-[10px] font-medium transition flex items-center gap-1.5" title="Nessun bando attivo al momento per ${escapeHtml(item.denominazione)} (clicca per verificare nel Cruscotto)">
            <span>Bandi</span>
            <span class="px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-500 text-[10px] font-mono tabular-nums">0</span>
            <span>&rarr;</span>
          </button>
        `;

        return `
          <tr onclick="window.openAmmItemModal(${item.id})" class="hover:bg-slate-900/80 transition group border-b border-slate-800/40 cursor-pointer">
            <!-- Denominazione Ente & Tipologia -->
            <td class="px-4 py-3.5">
              <div class="font-bold text-white text-xs group-hover:text-sky-300 transition line-clamp-2">${escapeHtml(item.denominazione || 'Ente Pubblico')}</div>
              <div class="text-[10px] text-slate-400 mt-0.5 truncate max-w-[280px]">${escapeHtml(item.tipologia || 'Pubblica Amministrazione')}</div>
            </td>

            <!-- Codice Fiscale -->
            <td class="px-4 py-3.5">
              ${cfFormatted}
            </td>

            <!-- Codice IPA (SDI) -->
            <td class="px-4 py-3.5">
              ${ipaFormatted}
            </td>

            <!-- Tipologia -->
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] bg-slate-800/90 border border-slate-700/80 text-slate-300 max-w-[170px] truncate" title="${escapeHtml(item.tipologia || '-')}">
                ${escapeHtml(item.tipologia || 'Ente Locale')}
              </span>
            </td>

            <!-- Sede & Territorio -->
            <td class="px-4 py-3.5 text-xs">
              <div class="text-slate-200 font-semibold">${escapeHtml(item.regione || '-')}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(item.comune || '')} ${item.provincia ? `(${escapeHtml(item.provincia)})` : ''}</div>
            </td>

            <!-- Punti Ordinanti -->
            <td class="px-4 py-3.5 text-center">
              ${poBadge}
            </td>

            <!-- Azioni: Scheda & Bandi con Contatore Reale -->
            <td class="px-4 py-3.5 text-center">
              <div class="flex items-center justify-center gap-1.5" onclick="event.stopPropagation()">
                <button type="button" onclick="window.openAmmItemModal(${item.id}); event.stopPropagation();" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-sky-950/80 hover:text-sky-300 border border-slate-700 hover:border-sky-500/40 text-[10px] font-semibold text-slate-300 transition" title="Visualizza Scheda Ente">
                  Scheda
                </button>
                ${bandiActionHtml}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Errore anagrafica PA:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="px-4 py-12 text-center text-rose-400 font-mono">
            <div class="flex flex-col items-center justify-center gap-1">
              <span>Errore nel caricamento dell'anagrafica stazioni appaltanti:</span>
              <span class="text-xs text-slate-400">Verifica che il server Python locale (porta 8050) sia in esecuzione.</span>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Copia rapida negli appunti con feedback toast
 */
window.copyAmmValue = function(val, label, event) {
  if (event) event.stopPropagation();
  if (!val || val === '-') return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(() => {
      if (typeof window.showNotification === "function") {
        window.showNotification(`${label}: ${val} copiato negli appunti!`);
      }
    }).catch(() => {
      fallbackCopy(val, label);
    });
  } else {
    fallbackCopy(val, label);
  }

  function fallbackCopy(text, lbl) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    if (typeof window.showNotification === "function") {
      window.showNotification(`${lbl}: ${text} copiato negli appunti!`);
    }
  }
};

/**
 * Apertura Modale Scheda Profilo Ente & Dati Fiscali
 */
window.openAmmItemModal = function(itemId) {
  const item = currentAmmItemsCache.find(x => x.id === itemId);
  if (!item) return;

  let modal = document.getElementById("ammDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ammDetailModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const poCount = item.po_attivi || 0;
  const counts = getAuthorityTenderCounts(item);

  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative text-left space-y-6 max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
      
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              STAZIONE APPALTANTE MEPA
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              ${escapeHtml(item.regione || 'ITALIA')}
            </span>
          </div>
          <h3 class="text-lg sm:text-xl font-extrabold text-white mt-2 leading-snug">
            ${escapeHtml(item.denominazione || 'Ente Pubblico')}
          </h3>
          <p class="text-xs text-slate-400 font-mono">${escapeHtml(item.tipologia || 'Pubblica Amministrazione')}</p>
        </div>
        <button type="button" onclick="window.closeAmmDetailModal()" class="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition touch-target-action" title="Chiudi finestra">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Dati Fiscali, Sede & Bandi Attivi -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Card Procedure d'Appalto Collegate (Cruscotto Gare) -->
        <div class="sm:col-span-2 p-4 rounded-2xl ${counts.active > 0 ? 'bg-emerald-950/20 border border-emerald-500/40' : 'bg-slate-950/80 border border-slate-800/80'} space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Procedure d'Appalto nel Cruscotto Gare</span>
            ${counts.active > 0 ? `
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ${counts.active.toLocaleString('it-IT')} GARE ATTIVE
              </span>
            ` : `
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700/80">
                0 Gare Aperte
              </span>
            `}
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-black font-mono ${counts.active > 0 ? 'text-emerald-400' : 'text-slate-300'} tabular-nums">
              ${counts.active.toLocaleString('it-IT')}
            </span>
            <span class="text-xs text-slate-400">
              ${counts.active === 1 ? 'procedura attiva aperta alla partecipazione' : 'procedure attive aperte alla partecipazione'}
              ${counts.total > counts.active ? ` (${counts.total - counts.active} archiviate o concluse)` : ''}
            </span>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            ${counts.active > 0 
              ? `Questa stazione appaltante ha ${counts.active.toLocaleString('it-IT')} lotti o gare aperte con termine di scadenza attivo. Clicca sul pulsante sottostante per visualizzarle e predisporre la partecipazione.`
              : `Al momento non risultano procedure aperte caricate per questo Ente nel database locale. Puoi importare nuove RdO MePA o creare un bando manuale dal Cruscotto.`}
          </p>
        </div>

        <!-- Codice Fiscale -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Codice Fiscale Stazione Appaltante</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-base font-black text-cyan-400 tracking-wider">${escapeHtml(item.codice_fiscale || 'Non specificato')}</span>
            ${item.codice_fiscale ? `
              <button type="button" onclick="window.copyAmmField(${item.id}, 'codice_fiscale', event)" class="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition" title="Copia Codice Fiscale">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            ` : ''}
          </div>
          <p class="text-[11px] text-slate-500">Indispensabile per Busta A, DGUE elettronico e garanzia fideiussoria.</p>
        </div>

        <!-- Codice IPA / SDI -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Codice Univoco IPA (Fatturazione SDI)</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-base font-black text-sky-400 tracking-wider uppercase">${escapeHtml(item.ipa || 'ND')}</span>
            ${item.ipa ? `
              <button type="button" onclick="window.copyAmmField(${item.id}, 'ipa', event)" class="p-1 text-slate-400 hover:text-sky-300 rounded hover:bg-slate-800 transition" title="Copia Codice IPA">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            ` : ''}
          </div>
          <p class="text-[11px] text-slate-500">Codice Univoco Ufficio per l'invio della Fattura Elettronica PA.</p>
        </div>

        <!-- Sede Territoriale -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Sede Legale &amp; Territorio</span>
          <div class="text-sm font-bold text-white">${escapeHtml(item.comune || '-')} ${item.provincia ? `(${escapeHtml(item.provincia)})` : ''}</div>
          <div class="text-xs text-slate-400">Regione: ${escapeHtml(item.regione || 'Italia')}</div>
        </div>

        <!-- Punti Ordinanti (PO) -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Punti Ordinanti (Centri di Spesa MePA)</span>
          <div class="text-sm font-bold text-emerald-400 font-mono">${poCount} Punti Ordinanti abilitati</div>
          <div class="text-xs text-slate-400">Funzionari autorizzati a impegnare la spesa su Consip.</div>
        </div>
      </div>

      <!-- Guida Operativa Appalti & Fatturazione -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="flex items-center gap-2 text-sky-400 font-semibold text-xs">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Utilizzo Operativo nei Flussi MePA &amp; D.Lgs. 36/2023</span>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">
          Usa questa scheda per accertare l'esatta denominazione giuridica e il Codice Fiscale dell'Ente prima di generare la <strong>Garanzia Provvisoria</strong> e il <strong>DGUE</strong> per la Busta A. Aggiudicata la gara, il <strong>Codice IPA</strong> permetterà al tuo ufficio contabilità di trasmettere immediatamente le fatture elettroniche tramite il Sistema di Interscambio (SDI) senza rischiare scarti formali.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          ${counts.active > 0 ? `
            <button type="button" onclick="window.filterGareByAuthorityId(${item.id}, event)" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40 flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <span>Visualizza i ${counts.active.toLocaleString('it-IT')} Bandi Attivi (${counts.active})</span>
            </button>
          ` : `
            <button type="button" onclick="window.filterGareByAuthorityId(${item.id}, event)" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5">
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <span>Verifica nel Cruscotto (0 gare)</span>
            </button>
          `}

          <button type="button" onclick="window.copyAmmDatiCompleti(${item.id})" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span>Copia Dati Fatturazione / DGUE</span>
          </button>
        </div>

        <button type="button" onclick="window.closeAmmDetailModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition">
          Chiudi
        </button>
      </div>

    </div>
  `;

  modal.classList.remove("hidden");
};

/**
 * Chiusura modale dettaglio
 */
window.closeAmmDetailModal = function() {
  const modal = document.getElementById("ammDetailModal");
  if (modal) modal.classList.add("hidden");
};

/**
 * Copia dell'anagrafica completa dell'ente
 */
window.copyAmmDatiCompleti = function(itemId) {
  const item = currentAmmItemsCache.find(x => x.id === itemId);
  if (!item) return;

  const text = `
ANAGRAFICA STAZIONE APPALTANTE / CLIENTE PA
-------------------------------------------
Denominazione:    ${item.denominazione || '-'}
Codice Fiscale:   ${item.codice_fiscale || '-'}
Codice IPA / SDI: ${item.ipa || '-'}
Tipologia:        ${item.tipologia || '-'}
Regione:          ${item.regione || '-'}
Sede Territoriale: ${item.comune || ''} ${item.provincia ? `(${item.provincia})` : ''}
Punti Ordinanti:  ${item.po_attivi || 0}
Data Estrazione:  ${new Date().toLocaleDateString('it-IT')}
-------------------------------------------
  `.trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof window.showNotification === "function") {
        window.showNotification("Dati anagrafici copiati per DGUE / Fatturazione!");
      }
    });
  }
};

/**
 * Ricerca incrociata delle gare nel Cruscotto senza troncamenti arbitrari
 */
window.filterGareByAuthority = function(authName, cf, counts) {
  window.closeAmmDetailModal();
  if (typeof window.switchView === "function") {
    window.switchView("cruscotto");
  }

  setTimeout(() => {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      let query = (counts && counts.query) ? counts.query : (authName ? authName.trim() : (cf ? cf.trim() : ''));
      
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      
      if (typeof window.showNotification === "function") {
        if (counts && counts.active > 0) {
          window.showNotification(`Trovate ${counts.active.toLocaleString('it-IT')} procedure attive per: "${query}"`);
        } else if (counts && counts.active === 0) {
          window.showNotification(`Nessuna procedura attiva al momento per "${query}" nel database.`, false);
        } else {
          window.showNotification(`Ricerca bandi nel Cruscotto per: ${query}`);
        }
      }
    }
  }, 100);
};

/**
 * Ricerca incrociata gare per ID Stazione Appaltante (100% immune da errori di quote)
 */
window.filterGareByAuthorityId = function(itemId, event) {
  if (event) event.stopPropagation();
  const item = currentAmmItemsCache.find(x => x.id === itemId);
  if (!item) return;
  const counts = getAuthorityTenderCounts(item);
  window.filterGareByAuthority(counts.query || item.denominazione, item.codice_fiscale, counts);
};

/**
 * Copia campo specifico per ID Stazione Appaltante (100% immune da errori di quote)
 */
window.copyAmmField = function(itemId, field, event) {
  if (event) event.stopPropagation();
  const item = currentAmmItemsCache.find(x => x.id === itemId);
  if (!item) return;
  const val = item[field] || '';
  const label = field === 'codice_fiscale' ? 'Codice Fiscale' : (field === 'ipa' ? 'Codice IPA (SDI)' : field);
  window.copyAmmValue(val, label, event);
};

/**
 * Modale di Guida Informativa Semplice ("In parole povere")
 */
window.showAmmHelpModal = function(topic) {
  let modal = document.getElementById("ammHelpModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ammHelpModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  let title = "Guida Anagrafica Clienti PA & Stazioni Appaltanti";
  let content = "";

  if (topic === 'cf') {
    title = "Codice Fiscale della Stazione Appaltante";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-800/50">
          <h4 class="font-bold text-sky-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            È l'identificativo tributario univoco dell'Ente Pubblico. A differenza della denominazione (che può variare, es. "Comune di Milano" vs "Città di Milano"), il Codice Fiscale è <strong>unico e inequivocabile</strong>.
          </p>
        </div>

        <div class="space-y-2">
          <h4 class="font-bold text-white text-sm">Perché è fondamentale per l'operatore economico?</h4>
          <ul class="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li><strong>Intestazione Cauzione Provvisoria:</strong> La polizza fideiussoria emessa dalla compagnia o dal broker deve essere intestata all'esatto C.F. della Stazione Appaltante beneficiaria, pena il soccorso istruttorio o l'esclusione.</li>
            <li><strong>Compilazione DGUE elettronico:</strong> Nella Busta A, il modulo DGUE richiede l'indicazione precisa del C.F. dell'amministrazione aggiudicatrice.</li>
          </ul>
        </div>
      </div>
    `;
  } else if (topic === 'ipa') {
    title = "Codice IPA e Codice Univoco Ufficio (Fattura SDI)";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-800/50">
          <h4 class="font-bold text-sky-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            L'IPA (<strong>Indice delle Pubbliche Amministrazioni</strong>) è il registro ufficiale di tutti gli uffici pubblici italiani. Il codice IPA corrisponde al <strong>Codice Univoco Ufficio (CUU)</strong> a 6 o 7 caratteri.
          </p>
        </div>

        <div class="space-y-2">
          <h4 class="font-bold text-white text-sm">A cosa serve dopo aver vinto la gara?</h4>
          <p class="text-slate-400 leading-relaxed">
            Quando emetti la <strong>Fattura Elettronica PA</strong> verso il Sistema di Interscambio (SDI), devi inserire obbligatoriamente il Codice IPA dell'ufficio destinatario insieme al <strong>CIG</strong> e al <strong>CUP</strong>. Se il codice è errato, la fattura viene scartata e il pagamento bloccato.
          </p>
        </div>
      </div>
    `;
  } else if (topic === 'po') {
    title = "Punti Ordinanti (PO) e Punti Istruttori (PI) MePA";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-800/50">
          <h4 class="font-bold text-sky-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            Sul portale MePA/Consip le persone fisiche della Pubblica Amministrazione hanno ruoli precisi:
          </p>
        </div>

        <div class="grid grid-cols-1 gap-3">
          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span class="text-emerald-400 font-bold font-mono">Punto Ordinante (PO)</span>
            <p class="text-slate-400 mt-1 leading-relaxed">
              È il <strong>Dirigente</strong> o funzionario con poteri di spesa e firma digitale. Solo il PO può formalizzare ordini (OdA), stipulare trattative dirette e aggiudicare gare (RdO).
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span class="text-sky-400 font-bold font-mono">Punto Istruttore (PI)</span>
            <p class="text-slate-400 mt-1 leading-relaxed">
              È il collaboratore amministrativo che predispone la gara, analizza le offerte e carica i documenti, ma sottopone poi il contratto alla firma del Punto Ordinante.
            </p>
          </div>
        </div>

        <div class="text-[11px] text-slate-400 mt-1">
          <strong>Regola commerciale:</strong> Più alto è il numero di PO attivi presso un ente, maggiore è la capillarità dei suoi centri di costo autorizzati ad acquistare autonomamente dal tuo catalogo MePA!
        </div>
      </div>
    `;
  } else {
    title = "Come utilizzare l'Anagrafica Clienti PA";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-800/50">
          <h4 class="font-bold text-sky-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            Questa sezione raccoglie oltre <strong>20.000 enti pubblici italiani</strong> censiti nel database Open Data di Consip.
          </p>
        </div>

        <div class="space-y-2">
          <h4 class="font-bold text-white text-sm">Le 3 funzioni chiave per la tua azienda:</h4>
          <ol class="list-decimal list-inside space-y-2 text-slate-400 pl-1">
            <li><strong>Verifica Anagrafica Fiscale:</strong> Recupera con un click Codice Fiscale, IPA e indirizzo legale per compilare velocemente la Busta A e il DGUE.</li>
            <li><strong>Ricerca Bandi dell'Ente:</strong> Clicca su "Bandi &rarr;" per scoprire all'istante tutte le gare bandite da quella specifica amministrazione nel Cruscotto.</li>
            <li><strong>Export per Mappatura Clienti:</strong> Esporta in Excel i contatti delle stazioni appaltanti della tua regione per pianificare le attività commerciali e le risposte a RdO e Trattative Dirette.</li>
          </ol>
        </div>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl relative text-left space-y-5" onclick="event.stopPropagation()">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold flex items-center justify-center">?</span>
          <span>${title}</span>
        </h3>
        <button type="button" onclick="window.closeAmmHelpModal()" class="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition touch-target-action" title="Chiudi">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div>
        ${content}
      </div>

      <div class="pt-3 border-t border-slate-800 flex justify-end">
        <button type="button" onclick="window.closeAmmHelpModal()" class="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition">
          Ho capito, grazie
        </button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
};

/**
 * Chiusura modale aiuto
 */
window.closeAmmHelpModal = function() {
  const modal = document.getElementById("ammHelpModal");
  if (modal) modal.classList.add("hidden");
};

/**
 * Esportazione Dati Filtrati (Excel CSV con UTF-8 BOM oppure JSON)
 */
window.exportAmmData = function(fmt) {
  const q = document.getElementById("ammSearchInput") ? document.getElementById("ammSearchInput").value.trim() : "";
  const reg = document.getElementById("ammRegionSelect") ? document.getElementById("ammRegionSelect").value : "";
  const tipo = document.getElementById("ammTipologiaSelect") ? document.getElementById("ammTipologiaSelect").value : "";
  const minPo = document.getElementById("ammPoFilterSelect") ? document.getElementById("ammPoFilterSelect").value : "0";

  const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                 (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");

  const queryParams = new URLSearchParams({
    format: fmt,
    limit: "2000",
    q: q,
    regione: reg,
    tipologia: tipo,
    min_po: minPo
  });

  const exportUrl = `${origin}/api/amministrazioni/export?${queryParams.toString()}`;

  if (typeof window.showNotification === "function") {
    window.showNotification(`Download anagrafica PA in formato ${fmt.toUpperCase()} avviato...`);
  }

  // Trigger download via elemento anchor
  const a = document.createElement("a");
  a.href = exportUrl;
  a.download = `amministrazioni_consip_${fmt}_${new Date().toISOString().substring(0, 10)}.${fmt}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Inizializzazione listener di Amministrazioni
document.addEventListener("DOMContentLoaded", () => {
  const ammSearch = document.getElementById("ammSearchInput");
  if (ammSearch) {
    ammSearch.addEventListener("input", () => {
      clearTimeout(ammSearchDebounceTimer);
      ammSearchDebounceTimer = setTimeout(() => {
        ammCurrentPage = 1;
        loadAmministrazioni();
      }, 300);
    });
  }

  const ammReg = document.getElementById("ammRegionSelect");
  if (ammReg) {
    ammReg.addEventListener("change", () => {
      ammCurrentPage = 1;
      loadAmministrazioni();
    });
  }

  const ammTipo = document.getElementById("ammTipologiaSelect");
  if (ammTipo) {
    ammTipo.addEventListener("change", () => {
      ammCurrentPage = 1;
      loadAmministrazioni();
    });
  }

  const ammPo = document.getElementById("ammPoFilterSelect");
  if (ammPo) {
    ammPo.addEventListener("change", () => {
      ammCurrentPage = 1;
      loadAmministrazioni();
    });
  }

  const ammPageSize = document.getElementById("ammPageSizeSelect");
  if (ammPageSize) {
    ammPageSize.addEventListener("change", () => {
      ammCurrentPage = 1;
      loadAmministrazioni();
    });
  }

  const ammReset = document.getElementById("ammResetBtn");
  if (ammReset) {
    ammReset.addEventListener("click", () => {
      if (ammSearch) ammSearch.value = "";
      if (ammReg) ammReg.value = "";
      if (ammTipo) ammTipo.value = "";
      if (ammPo) ammPo.value = "0";
      ammCurrentPage = 1;
      loadAmministrazioni();
      if (typeof window.showNotification === "function") {
        window.showNotification("Filtri dell'anagrafica PA reimpostati.");
      }
    });
  }

  const ammFirst = document.getElementById("ammFirstPageBtn");
  if (ammFirst) {
    ammFirst.addEventListener("click", () => {
      if (ammCurrentPage > 1) {
        ammCurrentPage = 1;
        loadAmministrazioni();
      }
    });
  }

  const ammPrev = document.getElementById("ammPrevPageBtn");
  if (ammPrev) {
    ammPrev.addEventListener("click", () => {
      if (ammCurrentPage > 1) {
        ammCurrentPage--;
        loadAmministrazioni();
      }
    });
  }

  const ammNext = document.getElementById("ammNextPageBtn");
  if (ammNext) {
    ammNext.addEventListener("click", () => {
      if (ammCurrentPage < ammTotalPages) {
        ammCurrentPage++;
        loadAmministrazioni();
      }
    });
  }

  const ammLast = document.getElementById("ammLastPageBtn");
  if (ammLast) {
    ammLast.addEventListener("click", () => {
      if (ammCurrentPage < ammTotalPages) {
        ammCurrentPage = ammTotalPages;
        loadAmministrazioni();
      }
    });
  }

  // Tasto Escape per chiudere le modali
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.closeAmmDetailModal();
      window.closeAmmHelpModal();
    }
  });
});
