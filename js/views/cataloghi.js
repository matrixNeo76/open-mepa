/**
 * MePA & Consip Desk Pro - Cataloghi View Controller
 * Gestione esplorazione e ricerca ad alte prestazioni per oltre 287.000 articoli merci MePA.
 * Conforme alle specifiche di accessibilità WCAG e numeri tabellari.
 */

let catalogCurrentPage = 1;
let catalogTotalPages = 1;
let catalogCategoriesLoaded = false;
let catalogSearchDebounceTimer = null;

async function loadCataloghi() {
  const q = document.getElementById("catalogSearchInput") ? document.getElementById("catalogSearchInput").value.trim() : "";
  const cat = document.getElementById("catalogCategorySelect") ? document.getElementById("catalogCategorySelect").value : "";
  const pageSize = document.getElementById("catalogPageSizeSelect") ? parseInt(document.getElementById("catalogPageSizeSelect").value) : 25;
  const tbody = document.getElementById("catalogTableBody");
  const infoSpan = document.getElementById("catalogResultsInfo");
  const paginationText = document.getElementById("catalogPaginationText");
  const firstBtn = document.getElementById("catalogFirstPageBtn");
  const prevBtn = document.getElementById("catalogPrevPageBtn");
  const nextBtn = document.getElementById("catalogNextPageBtn");
  const lastBtn = document.getElementById("catalogLastPageBtn");

  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 font-mono animate-pulse">Caricamento articoli dal database SQLite in corso...</td></tr>`;

  try {
    const origin = liveBackendUrl || (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    const url = `${origin}/api/cataloghi?page=${catalogCurrentPage}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&categoria=${encodeURIComponent(cat)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Server HTTP non raggiungibile o tabella non inizializzata");
    const data = await resp.json();

    // Popola il menu a tendina delle categorie al primo caricamento
    if (!catalogCategoriesLoaded && data.categories && data.categories.length) {
      const selectCat = document.getElementById("catalogCategorySelect");
      if (selectCat) {
        data.categories.forEach(c => {
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

    if (infoSpan) infoSpan.textContent = `Trovati ${total.toLocaleString('it-IT')} articoli (Pagina ${catalogCurrentPage} di ${catalogTotalPages})`;
    if (paginationText) paginationText.textContent = `Pagina ${catalogCurrentPage} di ${catalogTotalPages}`;
    
    if (firstBtn) firstBtn.disabled = catalogCurrentPage <= 1;
    if (prevBtn) prevBtn.disabled = catalogCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = catalogCurrentPage >= catalogTotalPages;
    if (lastBtn) lastBtn.disabled = catalogCurrentPage >= catalogTotalPages;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-12 text-center text-slate-500 font-mono">Nessun articolo trovato con i criteri selezionati.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const isAvail = item.disponibile === "S";
      const availBadge = isAvail 
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Disponibile</span>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Non Disp.</span>`;

      return `
        <tr class="hover:bg-slate-900/60 transition group border-b border-slate-800/40">
          <td class="px-4 py-3">
            <div class="font-semibold text-white text-xs">${escapeHtml(item.prodotto || 'Articolo')}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(item.dettaglio || '')}</div>
          </td>
          <td class="px-4 py-3 font-mono tabular-nums text-[11px]">
            <span class="text-pink-400 font-bold">${escapeHtml(item.cpv || '-')}</span>
            <div class="text-slate-400 text-[10px] truncate max-w-[200px]">${escapeHtml(item.cpv_desc || '')}</div>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] bg-slate-800 border border-slate-700/80 text-slate-300">
              ${escapeHtml(item.categoria || 'Varie')}
            </span>
          </td>
          <td class="px-4 py-3 text-xs">
            <div class="text-slate-200 font-medium">${escapeHtml(item.iniziativa || 'Beni')}</div>
            <div class="text-[10px] text-slate-400 truncate max-w-[180px]">${escapeHtml(item.lotto_nome || '-')}</div>
          </td>
          <td class="px-4 py-3 text-center">
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              ${escapeHtml(item.strumento || 'MePA')}
            </span>
          </td>
          <td class="px-4 py-3 text-center">
            ${availBadge}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-12 text-center text-rose-400 font-mono">Impossibile consultare il catalogo: avvia il server Python locale (porta 8050) per interrogare la tabella su disco.</td></tr>`;
  }
}

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
      catalogCurrentPage = 1;
      loadCataloghi();
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
});
