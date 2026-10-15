/**
 * MePA & Consip Desk Pro - Utility Functions
 * Sanitizzazione anti-XSS, formattazione valuta, calcolo semaforo e parsing
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseNumericAmount(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/[€\s]/g, "");
  if (!str) return 0;

  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function formatEUR(val) {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(num);
}

function parseDateString(raw) {
  if (!raw) return "2026-11-30T12:00";
  const str = String(raw).trim();

  if (str.includes("T")) return str.substring(0, 16);

  const itMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (itMatch) {
    const d = itMatch[1].padStart(2, "0");
    const m = itMatch[2].padStart(2, "0");
    const y = itMatch[3];
    const hh = (itMatch[4] || "12").padStart(2, "0");
    const mm = (itMatch[5] || "00").padStart(2, "0");
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 16);
  }

  return "2026-11-30T12:00";
}

function calculateTimeRemaining(deadlineStr) {
  if (!deadlineStr) return { text: "Nessuna data", days: -999, colorClass: "text-slate-500", badgeBg: "bg-slate-800" };
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline - now;

  if (isNaN(deadline.getTime())) {
    return { text: "Data non valida", days: -999, colorClass: "text-slate-500", badgeBg: "bg-slate-800" };
  }

  if (diffMs < 0) {
    return { text: "Termine Scaduto", days: -1, colorClass: "text-slate-400", badgeBg: "bg-slate-800/80" };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days === 0) {
    return { text: `Oggi! (${hours}h)`, days: 0, colorClass: "text-rose-400 font-bold animate-pulse", badgeBg: "bg-rose-950/60 border border-rose-500/40" };
  } else if (days <= 3) {
    return { text: `Entro ${days}gg ${hours}h`, days, colorClass: "text-rose-300 font-bold", badgeBg: "bg-rose-950/50 border border-rose-500/30" };
  } else if (days <= 7) {
    return { text: `${days} giorni`, days, colorClass: "text-amber-300 font-medium", badgeBg: "bg-amber-950/40 border border-amber-500/30" };
  } else {
    return { text: `${days} giorni`, days, colorClass: "text-slate-300", badgeBg: "bg-slate-900/90 border border-slate-800" };
  }
}

const categoryKeywords = {
  IT: [
    "informatic", "software", "hardware", "server", "pc", "workstation", "cloud", "licenz",
    "tecnolog", "rete", "switch", "router", "telecomunicazion", "digitale", "ict", "antivirus",
    "computer", "backup", "datacenter", "data center", "connettività", "fibra", "voip", "ced"
  ],
  CANCELLERIA: [
    "cancelleria", "carta", "toner", "cartucce", "consumabil", "stampant", "fogli", "ecolabel",
    "modulistica", "buste", "penne", "cartoleria", "copiator", "stamp", "timbri", "nastri"
  ],
  ARREDI: ["arred", "mobil", "sedie", "scrivanie", "scaffal", "armadi", "ufficio arredo"],
  SANITA: ["sanitar", "medical", "ospedal", "farmac", "siringhe", "dispositiv", "asl", "asst", "reagent"],
  ENERGIA: ["energi", "luce", "gas", "elettric", "combustibil", "termic", "carburant"]
};

function detectCategory(rawText) {
  if (!rawText) return "ALTRO";
  const txt = String(rawText).toLowerCase();

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => txt.includes(kw))) {
      return cat;
    }
  }
  return "ALTRO";
}

const italianRegions = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia",
  "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna",
  "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

function detectRegion(rawText) {
  if (!rawText) return "Nazionale";
  const txt = String(rawText).toLowerCase();

  for (const reg of italianRegions) {
    if (txt.includes(reg.toLowerCase())) return reg;
  }
  if (txt.includes("roma") || txt.includes("frosinone") || txt.includes("latina")) return "Lazio";
  if (txt.includes("milano") || txt.includes("brescia") || txt.includes("bergamo") || txt.includes("monza")) return "Lombardia";
  if (txt.includes("torino") || txt.includes("cuneo") || txt.includes("novara")) return "Piemonte";
  if (txt.includes("napoli") || txt.includes("salerno") || txt.includes("caserta")) return "Campania";
  if (txt.includes("bologna") || txt.includes("modena") || txt.includes("parma") || txt.includes("reggio")) return "Emilia-Romagna";
  if (txt.includes("firenze") || txt.includes("pisa") || txt.includes("livorno") || txt.includes("siena")) return "Toscana";
  if (txt.includes("bari") || txt.includes("lecce") || txt.includes("taranto") || txt.includes("foggia")) return "Puglia";
  if (txt.includes("palermo") || txt.includes("catania") || txt.includes("messina")) return "Sicilia";
  if (txt.includes("venezia") || txt.includes("padova") || txt.includes("verona") || txt.includes("vicenza")) return "Veneto";
  if (txt.includes("genova") || txt.includes("savona")) return "Liguria";
  if (txt.includes("cagliari") || txt.includes("sassari")) return "Sardegna";

  return "Nazionale";
}

function getCategoryBadge(cat) {
  switch(cat) {
    case "IT":
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 font-medium whitespace-nowrap"><span>💻</span> IT &amp; TLC</span>`;
    case "CANCELLERIA":
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800/80 text-amber-300/90 border border-amber-800/30 font-medium whitespace-nowrap"><span>📦</span> Cancelleria</span>`;
    case "ARREDI":
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800/80 text-slate-300 border border-slate-700/40 whitespace-nowrap"><span>🪑</span> Arredi</span>`;
    case "SANITA":
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800/80 text-rose-300/90 border border-rose-800/30 whitespace-nowrap"><span>🏥</span> Sanità</span>`;
    case "ENERGIA":
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800/80 text-emerald-300/90 border border-emerald-800/30 whitespace-nowrap"><span>⚡</span> Energia</span>`;
    default:
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-900 text-slate-400 border border-slate-800 whitespace-nowrap">${escapeHtml(cat || 'Altro')}</span>`;
  }
}

function getSourceBadge(source) {
  if (source === "Bandi e Gare") return `<span class="text-[10px] text-amber-400/90 font-mono tracking-wide">Grandi Gare</span>`;
  if (source === "Gare ASP") return `<span class="text-[10px] text-pink-400/90 font-mono tracking-wide">ASP Locale</span>`;
  if (source === "RdO MePA") return `<span class="text-[10px] text-cyan-400 font-mono font-medium tracking-wide">RdO MePA</span>`;
  return `<span class="text-[10px] text-slate-400 font-mono tracking-wide">${escapeHtml(source || 'Bando')}</span>`;
}

function getStatusBadge(status) {
  switch(status) {
    case "Da Valutare":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-300 font-mono"><span class="status-dot status-dot-sky"></span><span>Da valutare</span></span>`;
    case "In Lavorazione":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-200 font-mono font-medium"><span class="status-dot status-dot-amber"></span><span>In lavorazione</span></span>`;
    case "Inviata":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-200 font-mono font-medium"><span class="status-dot status-dot-purple"></span><span>Inviata</span></span>`;
    case "Vinta":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-bold"><span class="status-dot status-dot-green"></span><span>Vinta ✓</span></span>`;
    case "Persa":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-rose-400 font-mono"><span class="status-dot status-dot-rose"></span><span>Persa</span></span>`;
    case "Scartata":
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-400 font-mono"><span class="status-dot status-dot-gray"></span><span>Scartata</span></span>`;
    default:
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-400 font-mono"><span class="status-dot status-dot-gray"></span><span>${escapeHtml(status || 'Da valutare')}</span></span>`;
  }
}

function showNotification(msg, isSuccess = true) {
  const importAlertMsg = document.getElementById("importAlertMsg");
  const importAlertBox = document.getElementById("importAlertBox");
  if (!importAlertMsg || !importAlertBox) return;

  importAlertMsg.textContent = msg;
  importAlertBox.className = `p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-lg ${isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`;
  importAlertBox.classList.remove("hidden");
  setTimeout(() => {
    importAlertBox.classList.add("hidden");
  }, 5000);
}

function showProgress(current, total, title = "Importazione nel Database SQLite") {
  const progressModal = document.getElementById("progressModal");
  if (!progressModal) return;
  progressModal.classList.remove("hidden");
  document.getElementById("progressTitle").textContent = title;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  document.getElementById("progressRecordsCount").textContent = `${current.toLocaleString()} / ${total.toLocaleString()} record`;
  document.getElementById("progressPercentage").textContent = `${pct}%`;
  document.getElementById("progressBarFill").style.width = `${pct}%`;
}

function hideProgress() {
  const progressModal = document.getElementById("progressModal");
  if (!progressModal) return;
  progressModal.classList.add("hidden");
  const fill = document.getElementById("progressBarFill");
  if (fill) fill.style.width = "0%";
}
