/**
 * MePA & Consip Desk Pro - Analytics & Market Dashboard Controller
 * Aggregazioni di spesa, categorie merceologiche, copertura territoriale e avanzamento pipeline.
 * Conforme alle specifiche di accessibilità WCAG (role="progressbar") e numeri tabellari.
 */

async function loadAnalytics() {
  try {
    const origin = liveBackendUrl || (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8050");
    const resp = await fetch(`${origin}/api/analytics`);
    if (!resp.ok) return;
    const d = await resp.json();

    // Popola le 4 Card KPI Principali con tabular-nums
    const tendersCountEl = document.getElementById("anaTendersCount");
    const totalAmountEl = document.getElementById("anaTotalAmount");
    const catalogCountEl = document.getElementById("anaCatalogCount");
    const ammCountEl = document.getElementById("anaAmmCount");

    if (tendersCountEl) {
      tendersCountEl.textContent = (d.total_tenders || 0).toLocaleString('it-IT');
      tendersCountEl.classList.add("tabular-nums");
    }
    if (totalAmountEl) {
      totalAmountEl.textContent = formatEUR(d.total_amount || 0);
      totalAmountEl.classList.add("tabular-nums");
    }
    if (catalogCountEl) {
      catalogCountEl.textContent = (d.total_cataloghi || 0).toLocaleString('it-IT');
      catalogCountEl.classList.add("tabular-nums");
    }
    if (ammCountEl) {
      ammCountEl.textContent = (d.total_amministrazioni || 0).toLocaleString('it-IT');
      ammCountEl.classList.add("tabular-nums");
    }

    // Rendering Barre Distribuzione Categorie Gare con role="progressbar"
    const catContainer = document.getElementById("anaCategoryBars");
    if (catContainer && d.categories_breakdown) {
      const maxAmount = Math.max(...d.categories_breakdown.map(c => c.amount), 1);
      catContainer.innerHTML = d.categories_breakdown.map(c => {
        const pct = Math.round((c.amount / maxAmount) * 100);
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-slate-200">${escapeHtml(c.category)} (${c.count} gare)</span>
              <span class="font-mono text-emerald-400 font-semibold tabular-nums">${formatEUR(c.amount)}</span>
            </div>
            <div class="h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(c.category)}: ${pct}%">
              <div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Rendering Top Regioni Amministrazioni PA con role="progressbar"
    const regAmmContainer = document.getElementById("anaRegionAmmBars");
    if (regAmmContainer && d.top_regions_amm) {
      const maxCount = Math.max(...d.top_regions_amm.map(r => r.count), 1);
      regAmmContainer.innerHTML = d.top_regions_amm.map(r => {
        const pct = Math.round((r.count / maxCount) * 100);
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-200">📍 ${escapeHtml(r.regione)}</span>
              <span class="font-mono text-sky-400 font-bold tabular-nums">${r.count.toLocaleString('it-IT')} enti</span>
            </div>
            <div class="h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Regione ${escapeHtml(r.regione)}: ${pct}%">
              <div class="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Rendering Top Categorie Listini MePA con role="progressbar"
    const catProdContainer = document.getElementById("anaCatalogCategoryBars");
    if (catProdContainer && d.top_cat_products) {
      const maxCat = Math.max(...d.top_cat_products.map(p => p.count), 1);
      catProdContainer.innerHTML = d.top_cat_products.map(p => {
        const pct = Math.round((p.count / maxCat) * 100);
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-200 truncate max-w-[280px]">${escapeHtml(p.categoria)}</span>
              <span class="font-mono text-cyan-400 font-bold tabular-nums">${p.count.toLocaleString('it-IT')} articoli</span>
            </div>
            <div class="h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Categoria ${escapeHtml(p.categoria)}: ${pct}%">
              <div class="h-full bg-gradient-to-r from-cyan-500 to-sky-500 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Rendering Avanzamento Pipeline delle 4 Fasi con role="progressbar"
    const statusContainer = document.getElementById("anaStatusBars");
    if (statusContainer && d.status_breakdown) {
      const maxSt = Math.max(...d.status_breakdown.map(s => s.count), 1);
      statusContainer.innerHTML = d.status_breakdown.map(s => {
        const pct = Math.round((s.count / maxSt) * 100);
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-200">Fase: ${escapeHtml(s.status)}</span>
              <span class="font-mono text-cyan-400 font-bold tabular-nums">${s.count.toLocaleString('it-IT')} gare</span>
            </div>
            <div class="h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Fase ${escapeHtml(s.status)}: ${pct}%">
              <div class="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    console.error("Errore fetch analytics:", e);
  }
}
