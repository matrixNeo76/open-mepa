/**
 * MePA & Consip Desk Pro - API Client
 * Chiamate HTTP/REST verso il server Python locale (porta 8050)
 */

const Api = {
  getBaseUrl() {
    if (typeof liveBackendUrl !== "undefined" && liveBackendUrl) return liveBackendUrl;
    if (typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http")) {
      return window.location.origin;
    }
    return "http://127.0.0.1:8050";
  },

  async getStatus() {
    const resp = await fetch(`${this.getBaseUrl()}/api/status`);
    if (!resp.ok) throw new Error("Status HTTP non valido");
    return await resp.json();
  },

  async getGare(page = null, pageSize = null) {
    let url = `${this.getBaseUrl()}/api/gare`;
    if (page !== null && pageSize !== null) {
      url += `?page=${page}&pageSize=${pageSize}`;
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Errore recupero gare");
    return await resp.json();
  },

  async saveGara(tenderData) {
    const resp = await fetch(`${this.getBaseUrl()}/api/gare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tenderData)
    });
    if (!resp.ok) throw new Error("Errore salvataggio gara");
    return await resp.json();
  },

  async deleteGara(id) {
    const resp = await fetch(`${this.getBaseUrl()}/api/gare/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!resp.ok) throw new Error("Errore eliminazione gara");
    return await resp.json();
  },

  async batchGare(records, mode = "dedup") {
    const resp = await fetch(`${this.getBaseUrl()}/api/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records, mode })
    });
    if (!resp.ok) throw new Error("Errore importazione batch");
    return await resp.json();
  },

  async resetGare() {
    const resp = await fetch(`${this.getBaseUrl()}/api/reset`, { method: "POST" });
    if (!resp.ok) throw new Error("Errore svuotamento gare");
    return await resp.json();
  },

  async getCataloghi(page = 1, pageSize = 25, q = "", categoria = "") {
    const url = `${this.getBaseUrl()}/api/cataloghi?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&categoria=${encodeURIComponent(categoria)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Errore catalogo");
    return await resp.json();
  },

  async getAmministrazioni(page = 1, pageSize = 25, q = "", regione = "", tipologia = "") {
    const url = `${this.getBaseUrl()}/api/amministrazioni?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&regione=${encodeURIComponent(regione)}&tipologia=${encodeURIComponent(tipologia)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Errore amministrazioni");
    return await resp.json();
  },

  async getAnalytics() {
    const resp = await fetch(`${this.getBaseUrl()}/api/analytics`);
    if (!resp.ok) throw new Error("Errore statistiche");
    return await resp.json();
  },

  async getWorkflow(garaId) {
    const resp = await fetch(`${this.getBaseUrl()}/api/workflow?gara_id=${encodeURIComponent(garaId)}`);
    if (!resp.ok) throw new Error("Errore recupero workflow gara");
    return await resp.json();
  },

  async saveWorkflow(workflowData) {
    const resp = await fetch(`${this.getBaseUrl()}/api/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflowData)
    });
    if (!resp.ok) throw new Error("Errore salvataggio workflow gara");
    return await resp.json();
  }
};

