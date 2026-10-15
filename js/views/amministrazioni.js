/**
 * MePA & Consip Desk Pro - Amministrazioni View Controller
 * Gestione anagrafica stazioni appaltanti, codici fiscali, IPA e punti ordinanti PA.
 * Conforme alle specifiche di accessibilità WCAG e numeri tabellari.
 */

let ammCurrentPage = 1;
let ammTotalPages = 1;
let ammFiltersLoaded = false;
let ammSearchDebounceTimer = null;

async function loadAmministrazioni() {
  const q = document.getElementById("ammSearchInput") ? document.getElementById("ammSearchInput").value.trim() : "";
  const reg = document.getElementById("ammRegionSelect") ? document.getElementById("ammRegionSelect").value : "";
  const tipo = document.getElementById("ammTipologiaSelect") ? document.getElementById("ammTipologiaSelect").value : "";
  const pageSize = document.getElementById("ammPageSizeSelect") ? parseInt(document.getElementById("ammPageSizeSelect").value) : 25;
  const tbody = document.getElementById("ammTableBody");
  const infoSpan = document.getElementById("ammResultsInfo");
  const paginationText = document.getElementById("ammPaginationText");
  const firstBtn = document.getElementById("ammFirstPageBtn");
  const prevBtn = document.getElementById("ammPrevPageBtn");
  const nextBtn = document.getElementById("ammNextPageBtn");
  const lastBtn = document.getElementById("ammLastPageBtn");

  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400 font-mono animate-pulse">Caricamento anagrafica amministrazioni dal database SQLite...</td></tr>`;

  try {
    const origin = liveBackendUrl || (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    const url = `${origin}/api/amministrazioni?page=${ammCurrentPage}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&regione=${encodeURIComponent(reg)}&tipologia=${encodeURIComponent(tipo)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Server HTTP non raggiungibile");
    const data = await resp.json();

    // Popola filtri regione e tipologia al primo caricamento
    if (!ammFiltersLoaded) {
      if (data.regions && data.regions.length) {
        const selectReg = document.getElementById("ammRegionSelect");
        if (selectReg) {
          data.regions.forEach(r => {
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

    if (infoSpan) infoSpan.textContent = `Trovate ${total.toLocaleString('it-IT')} amministrazioni (Pagina ${ammCurrentPage} di ${ammTotalPages})`;
    if (paginationText) paginationText.textContent = `Pagina ${ammCurrentPage} di ${ammTotalPages}`;
    
    if (firstBtn) firstBtn.disabled = ammCurrentPage <= 1;
    if (prevBtn) prevBtn.disabled = ammCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = ammCurrentPage >= ammTotalPages;
    if (lastBtn) lastBtn.disabled = ammCurrentPage >= ammTotalPages;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-500 font-mono">Nessuna amministrazione trovata con i filtri selezionati.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => {
      return `
        <tr class="hover:bg-slate-900/60 transition group border-b border-slate-800/40">
          <td class="px-4 py-3">
            <div class="font-bold text-white text-xs">${escapeHtml(item.denominazione || 'Ente Pubblico')}</div>
            <div class="text-[10px] text-slate-400 mt-0.5 truncate max-w-[280px]">${escapeHtml(item.tipologia || 'Pubblica Amministrazione')}</div>
          </td>
          <td class="px-4 py-3 font-mono tabular-nums text-[11px] text-cyan-400 font-semibold">
            ${escapeHtml(item.codice_fiscale || '-')}
          </td>
          <td class="px-4 py-3 font-mono tabular-nums text-[11px] text-slate-300">
            ${escapeHtml(item.ipa || '-')}
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
              ${escapeHtml(item.tipologia || '-')}
            </span>
          </td>
          <td class="px-4 py-3 text-xs">
            <div class="text-slate-200 font-semibold">${escapeHtml(item.regione || '-')}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(item.comune || '')} ${item.provincia ? `(${escapeHtml(item.provincia)})` : ''}</div>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              ${item.po_attivi || 0} PO
            </span>
          </td>
          <td class="px-4 py-3 text-center">
            <button onclick="filterGareByAuthority('${escapeHtml(item.denominazione)}')" aria-label="Cerca gare dell'ente ${escapeHtml(item.denominazione)}" class="touch-target-action px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-mono transition" title="Cerca gare bandite da questo ente">
              Gare Ente →
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-rose-400 font-mono">Impossibile consultare l'anagrafica PA: avvia il server Python locale per interrogare la tabella su disco.</td></tr>`;
  }
}

window.filterGareByAuthority = function(authName) {
  switchView("cruscotto");
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.value = authName.slice(0, 25);
    searchTerm = searchInput.value;
    renderApp();
  }
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
      ammCurrentPage = 1;
      loadAmministrazioni();
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
});
