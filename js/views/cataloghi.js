/**
 * MePA & Consip Desk Pro - Cataloghi View Controller
 * Gestione esplorazione e ricerca ad alte prestazioni per oltre 287.000 articoli merci MePA & Consip.
 * Conforme alle specifiche di accessibilità WCAG 2.1 AA, numeri tabellari e palette istituzionale.
 */

let catalogCurrentPage = 1;
let catalogTotalPages = 1;
let catalogCategoriesLoaded = false;
let catalogSearchDebounceTimer = null;
let currentCatalogItemsCache = [];

/**
 * Caricamento asincrono paginato degli articoli dal backend SQLite
 */
async function loadCataloghi() {
  const q = document.getElementById("catalogSearchInput") ? document.getElementById("catalogSearchInput").value.trim() : "";
  const cat = document.getElementById("catalogCategorySelect") ? document.getElementById("catalogCategorySelect").value : "";
  const strumento = document.getElementById("catalogInstrumentSelect") ? document.getElementById("catalogInstrumentSelect").value : "";
  const disponibile = document.getElementById("catalogAvailSelect") ? document.getElementById("catalogAvailSelect").value : "";
  const pageSize = document.getElementById("catalogPageSizeSelect") ? parseInt(document.getElementById("catalogPageSizeSelect").value) : 25;

  const tbody = document.getElementById("catalogTableBody");
  const infoSpan = document.getElementById("catalogResultsInfo");
  const infoSpanBottom = document.getElementById("catalogResultsInfoBottom");
  const paginationText = document.getElementById("catalogPaginationText");
  const firstBtn = document.getElementById("catalogFirstPageBtn");
  const prevBtn = document.getElementById("catalogPrevPageBtn");
  const nextBtn = document.getElementById("catalogNextPageBtn");
  const lastBtn = document.getElementById("catalogLastPageBtn");

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-4 py-16 text-center text-slate-400 font-mono">
          <div class="flex flex-col items-center justify-center gap-2">
            <svg class="w-6 h-6 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span class="text-xs">Interrogazione database SQLite (287k articoli)...</span>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                   (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    
    const queryParams = new URLSearchParams({
      page: catalogCurrentPage.toString(),
      pageSize: pageSize.toString(),
      q: q,
      categoria: cat,
      strumento: strumento,
      disponibile: disponibile
    });

    const resp = await fetch(`${origin}/api/cataloghi?${queryParams.toString()}`);
    if (!resp.ok) throw new Error("Server HTTP non raggiungibile o tabella non inizializzata");
    const data = await resp.json();

    // Popola dinamicamente le categorie merceologiche
    if (!catalogCategoriesLoaded && data.categories && data.categories.length) {
      const selectCat = document.getElementById("catalogCategorySelect");
      if (selectCat) {
        data.categories.forEach(c => {
          if (!c || c === 'ND') return;
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          selectCat.appendChild(opt);
        });
        catalogCategoriesLoaded = true;
      }
    }

    const total = data.total || 0;
    catalogTotalPages = data.totalPages || 1;
    const items = data.items || [];
    currentCatalogItemsCache = items;

    const infoText = `Trovati ${total.toLocaleString('it-IT')} articoli (Pagina ${catalogCurrentPage} di ${catalogTotalPages})`;
    if (infoSpan) infoSpan.textContent = infoText;
    if (infoSpanBottom) infoSpanBottom.textContent = infoText;
    if (paginationText) paginationText.textContent = `Pagina ${catalogCurrentPage} di ${catalogTotalPages}`;
    
    if (firstBtn) firstBtn.disabled = catalogCurrentPage <= 1;
    if (prevBtn) prevBtn.disabled = catalogCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = catalogCurrentPage >= catalogTotalPages;
    if (lastBtn) lastBtn.disabled = catalogCurrentPage >= catalogTotalPages;

    if (items.length === 0) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-4 py-16 text-center text-slate-400 font-mono">
              <div class="flex flex-col items-center justify-center gap-2">
                <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-xs font-semibold text-slate-300">Nessun articolo trovato con i criteri selezionati.</span>
                <span class="text-[11px] text-slate-500">Prova a modificare i filtri o la parola chiave di ricerca (es. CIG, CPV o nome bene).</span>
              </div>
            </td>
          </tr>
        `;
      }
      return;
    }

    if (tbody) {
      tbody.innerHTML = items.map((item, idx) => {
        const isAvail = item.disponibile === "S";
        const availBadge = isAvail 
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Disponibile</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Non Disp.</span>`;

        // Risoluzione intelligente del titolo: evita che appaia il valore tecnico 'radice'
        const isRoot = !item.prodotto || item.prodotto.toLowerCase() === 'radice';
        const displayTitle = item.dettaglio ? item.dettaglio : (isRoot ? 'Articolo a Listino MePA' : item.prodotto);
        const secondaryText = (!isRoot && item.dettaglio && item.dettaglio !== item.prodotto) 
          ? `<div class="text-[11px] text-slate-400 mt-0.5 truncate max-w-[280px]">${escapeHtml(item.prodotto)}</div>`
          : '';

        // Badge Strumento semantico
        let instrumentBadge = `<span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">MePA</span>`;
        if (item.strumento === 'Accordo Quadro') {
          instrumentBadge = `<span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">Accordo Quadro</span>`;
        } else if (item.strumento === 'Convenzione') {
          instrumentBadge = `<span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Convenzione</span>`;
        }

        // CIG di lotto con pulsante copia
        const cigFormatted = item.lotto_cig && item.lotto_cig.trim() !== '' 
          ? `
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-cyan-400 font-bold text-xs tracking-wider">${escapeHtml(item.lotto_cig)}</span>
              <button type="button" onclick="window.copyCatalogCig('${escapeHtml(item.lotto_cig)}', event)" class="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition touch-target-action" title="Copia CIG ${escapeHtml(item.lotto_cig)}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          `
          : `<span class="text-slate-500 font-mono text-[11px]">-</span>`;

        return `
          <tr onclick="window.openCatalogItemModal(${item.id})" class="hover:bg-slate-900/80 transition group border-b border-slate-800/40 cursor-pointer">
            <!-- Articolo / Dettaglio -->
            <td class="px-4 py-3.5">
              <div class="font-semibold text-white text-xs group-hover:text-cyan-300 transition line-clamp-2">${escapeHtml(displayTitle)}</div>
              ${secondaryText}
            </td>

            <!-- CIG Lotto & Iniziativa -->
            <td class="px-4 py-3.5">
              ${cigFormatted}
              <div class="text-[11px] text-slate-300 font-medium truncate max-w-[200px] mt-0.5" title="${escapeHtml(item.iniziativa || '')}">${escapeHtml(item.iniziativa || 'Consip')}</div>
              <div class="text-[10px] text-slate-400 truncate max-w-[200px]" title="${escapeHtml(item.lotto_nome || '')}">Lotto: ${escapeHtml(item.lotto_nome || '-')}</div>
            </td>

            <!-- Codice CPV & Descrizione -->
            <td class="px-4 py-3.5 font-mono text-[11px]">
              <div class="text-sky-400 font-bold tracking-wider">${escapeHtml(item.cpv || '-')}</div>
              <div class="text-slate-400 text-[10px] truncate max-w-[190px] font-sans mt-0.5" title="${escapeHtml(item.cpv_desc || '')}">${escapeHtml(item.cpv_desc || 'Settore ordinario')}</div>
            </td>

            <!-- Categoria Merci -->
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] bg-slate-800/90 border border-slate-700/80 text-slate-300 max-w-[160px] truncate" title="${escapeHtml(item.categoria || 'Varie')}">
                ${escapeHtml(item.categoria || 'Varie')}
              </span>
            </td>

            <!-- Strumento Negoziale -->
            <td class="px-4 py-3.5 text-center">
              ${instrumentBadge}
            </td>

            <!-- Stato & Azione Scheda -->
            <td class="px-4 py-3.5 text-center">
              <div class="flex flex-col items-center gap-1.5" onclick="event.stopPropagation()">
                ${availBadge}
                <button type="button" onclick="window.openCatalogItemModal(${item.id}); event.stopPropagation();" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950/80 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/40 text-[10px] font-semibold text-slate-300 transition flex items-center gap-1">
                  <svg class="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  <span>Scheda</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Errore catalogo:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-12 text-center text-rose-400 font-mono">
            <div class="flex flex-col items-center justify-center gap-1">
              <span>Errore nel caricamento del catalogo:</span>
              <span class="text-xs text-slate-400">Verifica che il server Python locale (porta 8050) sia in esecuzione.</span>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Copia rapida negli appunti del CIG
 */
window.copyCatalogCig = function(cig, event) {
  if (event) event.stopPropagation();
  if (!cig || cig === '-') return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cig).then(() => {
      if (typeof window.showNotification === "function") {
        window.showNotification(`CIG ${cig} copiato negli appunti!`);
      }
    }).catch(() => {
      copyFallback(cig);
    });
  } else {
    copyFallback(cig);
  }

  function copyFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    if (typeof window.showNotification === "function") {
      window.showNotification(`CIG ${text} copiato negli appunti!`);
    }
  }
};

/**
 * Apertura della Scheda Tecnica e Riferimenti MePA dell'Articolo
 */
window.openCatalogItemModal = function(itemId) {
  const item = currentCatalogItemsCache.find(x => x.id === itemId);
  if (!item) return;

  let modal = document.getElementById("catalogDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "catalogDetailModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  const isAvail = item.disponibile === "S";
  const isRoot = !item.prodotto || item.prodotto.toLowerCase() === 'radice';
  const displayTitle = item.dettaglio ? item.dettaglio : (isRoot ? 'Articolo a Listino MePA' : item.prodotto);

  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative text-left space-y-6 max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
      
      <!-- Modal Header -->
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              ${escapeHtml(item.strumento || 'MePA')}
            </span>
            ${isAvail 
              ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Disponibile per Ordinativo</span>`
              : `<span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Non Ordinabile al momento</span>`
            }
          </div>
          <h3 class="text-lg sm:text-xl font-extrabold text-white mt-2 leading-snug">
            ${escapeHtml(displayTitle)}
          </h3>
          ${item.prodotto && item.prodotto.toLowerCase() !== 'radice' ? `<p class="text-xs text-slate-400 font-mono">Modello / Tipo: ${escapeHtml(item.prodotto)}</p>` : ''}
        </div>
        <button type="button" onclick="window.closeCatalogDetailModal()" class="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition touch-target-action" title="Chiudi finestra">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Grid Dettagli Tecnici -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- CIG Lotto -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">CIG di Lotto (Accordo Quadro / Convenzione)</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-base font-black text-cyan-400 tracking-wider">${escapeHtml(item.lotto_cig || 'Non applicabile')}</span>
            ${item.lotto_cig ? `
              <button type="button" onclick="window.copyCatalogCig('${escapeHtml(item.lotto_cig)}', event)" class="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition" title="Copia CIG">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            ` : ''}
          </div>
          <p class="text-[11px] text-slate-500">Codice Identificativo Gara assegnato da ANAC per il lotto.</p>
        </div>

        <!-- Codice CPV -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Classificazione CPV Europeo</span>
          <div class="font-mono text-base font-black text-sky-400 tracking-wider">${escapeHtml(item.cpv || 'ND')}</div>
          <p class="text-[11px] text-slate-300 leading-tight">${escapeHtml(item.cpv_desc || 'Vocabolario comune per gli appalti pubblici')}</p>
        </div>

        <!-- Iniziativa Consip -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1 sm:col-span-2">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Iniziativa Ufficiale Consip &amp; Denominazione Lotto</span>
          <div class="text-sm font-bold text-white">${escapeHtml(item.iniziativa || 'Consip SpA')}</div>
          <div class="text-xs text-slate-300">${escapeHtml(item.lotto_nome || 'Lotto Unico')}</div>
        </div>

        <!-- Categoria Merci -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Categoria Merceologica</span>
          <div class="text-xs font-semibold text-slate-200">${escapeHtml(item.categoria || 'Non classificato')}</div>
        </div>

        <!-- Strumento Negoziale -->
        <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span class="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Tipologia di Strumento</span>
          <div class="text-xs font-semibold text-slate-200">${escapeHtml(item.strumento || 'MePA')}</div>
        </div>
      </div>

      <!-- Guida Operativa D.Lgs. 36/2023 -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Guida Operativa per Operatori Economici &amp; Stazioni Appaltanti</span>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">
          Questo articolo a catalogo fa parte dei listini Consip per la Pubblica Amministrazione. Gli operatori economici possono utilizzarlo per effettuare <strong>indagini di mercato preventive</strong>, confrontare i <strong>prezzi di riferimento ANAC</strong> o identificare gli <strong>Accordi Quadro</strong> attivi per proporre forniture equivalenti o subappalti conformi al principio di equivalenza dell'art. 79 del D.Lgs. 36/2023.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div class="flex items-center gap-2">
          ${item.lotto_cig ? `
            <button type="button" onclick="window.searchTenderByCatalogCig('${escapeHtml(item.lotto_cig)}')" class="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-900/30 flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <span>Cerca nel Cruscotto Gare</span>
            </button>
          ` : ''}

          <button type="button" onclick="window.copyCatalogFullSheet(${item.id})" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span>Copia Scheda</span>
          </button>
        </div>

        <button type="button" onclick="window.closeCatalogDetailModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition">
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
window.closeCatalogDetailModal = function() {
  const modal = document.getElementById("catalogDetailModal");
  if (modal) modal.classList.add("hidden");
};

/**
 * Cerca il CIG del catalogo all'interno del Cruscotto Gare
 */
window.searchTenderByCatalogCig = function(cig) {
  window.closeCatalogDetailModal();
  if (typeof window.switchView === "function") {
    window.switchView("cruscotto");
  }

  setTimeout(() => {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.value = cig;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof window.showNotification === "function") {
        window.showNotification(`Filtro applicato nel Cruscotto per CIG: ${cig}`);
      }
    }
  }, 100);
};

/**
 * Copia della scheda articolo in formato testo
 */
window.copyCatalogFullSheet = function(itemId) {
  const item = currentCatalogItemsCache.find(x => x.id === itemId);
  if (!item) return;

  const text = `
SCHEDA ARTICOLO CATALOGO CONSIP / MEPA
--------------------------------------
Articolo/Dettaglio: ${item.dettaglio || item.prodotto || '-'}
Codice Prodotto:    ${item.prodotto || '-'}
CIG Lotto:          ${item.lotto_cig || 'Non assegnato'}
Iniziativa Consip:  ${item.iniziativa || '-'}
Lotto:              ${item.lotto_nome || '-'}
Classificazione CPV: ${item.cpv || '-'} (${item.cpv_desc || '-'})
Categoria Merci:    ${item.categoria || '-'}
Strumento Negoziale: ${item.strumento || '-'}
Disponibilità:      ${item.disponibile === 'S' ? 'Disponibile' : 'Non disponibile'}
Data Consultazione: ${new Date().toLocaleDateString('it-IT')}
--------------------------------------
  `.trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof window.showNotification === "function") {
        window.showNotification("Scheda articolo copiata negli appunti!");
      }
    });
  }
};

/**
 * Modale di Guida e Spiegazione Semplice per Cataloghi, CPV e Accordi Quadro
 */
window.showCatalogHelpModal = function(topic) {
  let modal = document.getElementById("catalogHelpModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "catalogHelpModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all";
    document.body.appendChild(modal);
  }

  let title = "Guida ai Cataloghi MePA & Consip";
  let content = "";

  if (topic === 'cpv') {
    title = "Codici CPV (Common Procurement Vocabulary)";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/50">
          <h4 class="font-bold text-cyan-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            Il codice CPV è il <strong>"codice a barre europeo"</strong> che classifica esattamente cosa la Pubblica Amministrazione sta acquistando (es. PC, servizi di pulizia, forniture mediche, lavori edili).
          </p>
        </div>

        <div class="space-y-2">
          <h4 class="font-bold text-white text-sm">A cosa serve nell'ufficio gare?</h4>
          <ul class="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li><strong>Ricerca bandi affini:</strong> Consente di trovare tutte le gare identiche o simili alla tua attività aziendale.</li>
            <li><strong>Requisiti speciali (DGUE):</strong> Spesso il disciplinare richiede di aver svolto servizi analoghi nello stesso settore CPV negli ultimi 3 anni.</li>
            <li><strong>Abilitazione MePA:</strong> L'impresa deve essere iscritta al bando MePA corrispondente a quel codice CPV per poter ricevere inviti o formulare offerte.</li>
          </ul>
        </div>
      </div>
    `;
  } else if (topic === 'strumento') {
    title = "Strumenti Negoziali: Accordo Quadro, Convenzione e MePA";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/50">
          <h4 class="font-bold text-cyan-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            Consip mette a disposizione della Pubblica Amministrazione diversi canali di acquisto:
          </p>
        </div>

        <div class="grid grid-cols-1 gap-3">
          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span class="text-sky-400 font-bold font-mono">1. Accordo Quadro (AQ)</span>
            <p class="text-slate-400 mt-1 leading-relaxed">
              Consip stipula un accordo con uno o più operatori selezionati a livello nazionale. Le singole amministrazioni emettono poi contratti esecutivi (Ordinativi) o avviano un confronto competitivo tra i fornitori abilitati.
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span class="text-emerald-400 font-bold font-mono">2. Convenzione Consip</span>
            <p class="text-slate-400 mt-1 leading-relaxed">
              È un vero e proprio contratto di fornitura stipulato da Consip (ex L. 488/1999) con prezzi unitari massimi già fissati. Le PA possono ordinare direttamente i beni senza dover fare una nuova gara.
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span class="text-cyan-400 font-bold font-mono">3. MePA (Mercato Elettronico)</span>
            <p class="text-slate-400 mt-1 leading-relaxed">
              Mercato digitale aperto per acquisti sottosoglia comunitaria dove le PA possono inviare <strong>Ordini Diretti (OdA)</strong>, <strong>Trattative Dirette</strong> o <strong>Richieste di Offerta (RdO)</strong> agli operatori abilitati al catalogo.
            </p>
          </div>
        </div>
      </div>
    `;
  } else {
    title = "Come utilizzare il Database Cataloghi Consip";
    content = `
      <div class="space-y-4 text-xs text-slate-300">
        <div class="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/50">
          <h4 class="font-bold text-cyan-300 mb-1">💡 In parole povere:</h4>
          <p class="leading-relaxed">
            Questa sezione contiene oltre <strong>287.000 articoli ufficiali Consip</strong>. È uno strumento strategico sia per chi acquista (PA) sia per le imprese che partecipano a gare d'appalto.
          </p>
        </div>

        <div class="space-y-2">
          <h4 class="font-bold text-white text-sm">Le 3 funzioni principali per la tua azienda:</h4>
          <ol class="list-decimal list-inside space-y-2 text-slate-400 pl-1">
            <li><strong>Verifica prezzi benchmark ANAC:</strong> Controlla a quali prezzi Consip o altri operatori hanno già venduto determinati articoli per calcolare il tuo margine di sconto nella Busta C Economica.</li>
            <li><strong>Copia immediata del CIG di Lotto:</strong> Recupera il codice CIG univoco del lotto per verificare se esiste un bando o una procedura aperta nel Cruscotto Gare.</li>
            <li><strong>Esportazione Listini in Excel:</strong> Scarica gli elenchi filtrati per analizzare con il tuo team le categorie merceologiche e i prodotti da inserire nella tua offerta tecnica.</li>
          </ol>
        </div>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl relative text-left space-y-5" onclick="event.stopPropagation()">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center">?</span>
          <span>${title}</span>
        </h3>
        <button type="button" onclick="window.closeCatalogHelpModal()" class="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition touch-target-action" title="Chiudi">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div>
        ${content}
      </div>

      <div class="pt-3 border-t border-slate-800 flex justify-end">
        <button type="button" onclick="window.closeCatalogHelpModal()" class="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition">
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
window.closeCatalogHelpModal = function() {
  const modal = document.getElementById("catalogHelpModal");
  if (modal) modal.classList.add("hidden");
};

/**
 * Esportazione Dati Filtrati (Excel CSV con UTF-8 BOM oppure JSON)
 */
window.exportCatalogData = function(fmt) {
  const q = document.getElementById("catalogSearchInput") ? document.getElementById("catalogSearchInput").value.trim() : "";
  const cat = document.getElementById("catalogCategorySelect") ? document.getElementById("catalogCategorySelect").value : "";
  const strumento = document.getElementById("catalogInstrumentSelect") ? document.getElementById("catalogInstrumentSelect").value : "";
  const disponibile = document.getElementById("catalogAvailSelect") ? document.getElementById("catalogAvailSelect").value : "";

  const origin = (typeof liveBackendUrl !== "undefined" && liveBackendUrl) || 
                 (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");

  const queryParams = new URLSearchParams({
    format: fmt,
    limit: "2000",
    q: q,
    categoria: cat,
    strumento: strumento,
    disponibile: disponibile
  });

  const exportUrl = `${origin}/api/cataloghi/export?${queryParams.toString()}`;

  if (typeof window.showNotification === "function") {
    window.showNotification(`Download catalogo in formato ${fmt.toUpperCase()} avviato...`);
  }

  // Trigger download via elemento anchor
  const a = document.createElement("a");
  a.href = exportUrl;
  a.download = `cataloghi_consip_${fmt}_${new Date().toISOString().substring(0, 10)}.${fmt}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Inizializzazione listener di Catalogo
document.addEventListener("DOMContentLoaded", () => {
  const catSearch = document.getElementById("catalogSearchInput");
  if (catSearch) {
    catSearch.addEventListener("input", () => {
      clearTimeout(catalogSearchDebounceTimer);
      catalogSearchDebounceTimer = setTimeout(() => {
        catalogCurrentPage = 1;
        loadCataloghi();
      }, 300);
    });
  }

  const catSelect = document.getElementById("catalogCategorySelect");
  if (catSelect) {
    catSelect.addEventListener("change", () => {
      catalogCurrentPage = 1;
      loadCataloghi();
    });
  }

  const instSelect = document.getElementById("catalogInstrumentSelect");
  if (instSelect) {
    instSelect.addEventListener("change", () => {
      catalogCurrentPage = 1;
      loadCataloghi();
    });
  }

  const availSelect = document.getElementById("catalogAvailSelect");
  if (availSelect) {
    availSelect.addEventListener("change", () => {
      catalogCurrentPage = 1;
      loadCataloghi();
    });
  }

  const catPageSize = document.getElementById("catalogPageSizeSelect");
  if (catPageSize) {
    catPageSize.addEventListener("change", () => {
      catalogCurrentPage = 1;
      loadCataloghi();
    });
  }

  const catReset = document.getElementById("catalogResetBtn");
  if (catReset) {
    catReset.addEventListener("click", () => {
      if (catSearch) catSearch.value = "";
      if (catSelect) catSelect.value = "";
      if (instSelect) instSelect.value = "";
      if (availSelect) availSelect.value = "";
      catalogCurrentPage = 1;
      loadCataloghi();
      if (typeof window.showNotification === "function") {
        window.showNotification("Filtri del catalogo reimpostati.");
      }
    });
  }

  const catFirst = document.getElementById("catalogFirstPageBtn");
  if (catFirst) {
    catFirst.addEventListener("click", () => {
      if (catalogCurrentPage > 1) {
        catalogCurrentPage = 1;
        loadCataloghi();
      }
    });
  }

  const catPrev = document.getElementById("catalogPrevPageBtn");
  if (catPrev) {
    catPrev.addEventListener("click", () => {
      if (catalogCurrentPage > 1) {
        catalogCurrentPage--;
        loadCataloghi();
      }
    });
  }

  const catNext = document.getElementById("catalogNextPageBtn");
  if (catNext) {
    catNext.addEventListener("click", () => {
      if (catalogCurrentPage < catalogTotalPages) {
        catalogCurrentPage++;
        loadCataloghi();
      }
    });
  }

  const catLast = document.getElementById("catalogLastPageBtn");
  if (catLast) {
    catLast.addEventListener("click", () => {
      if (catalogCurrentPage < catalogTotalPages) {
        catalogCurrentPage = catalogTotalPages;
        loadCataloghi();
      }
    });
  }

  // Tasto Escape per chiudere le modali del catalogo
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.closeCatalogDetailModal();
      window.closeCatalogHelpModal();
    }
  });
});
