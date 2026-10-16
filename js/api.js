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
    const resp = await fetch(`${this.getBaseUrl()}/api/reset`, { method: "POST", headers: { "X-Confirm-Reset": "yes" } });
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
  },

  // --- Milestone 4: Note, Allegati & Calendario ICS ---
  async getNotes(garaId) {
    const url = garaId ? `${this.getBaseUrl()}/api/note?gara_id=${encodeURIComponent(garaId)}` : `${this.getBaseUrl()}/api/note`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Errore recupero note gara");
    return await resp.json();
  },

  async addNote(noteData) {
    const resp = await fetch(`${this.getBaseUrl()}/api/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(noteData)
    });
    if (!resp.ok) throw new Error("Errore inserimento nota");
    return await resp.json();
  },

  async deleteNote(noteId) {
    const resp = await fetch(`${this.getBaseUrl()}/api/note/${encodeURIComponent(noteId)}`, {
      method: "DELETE"
    });
    if (!resp.ok) throw new Error("Errore eliminazione nota");
    return await resp.json();
  },

  async getAllegati(garaId) {
    const url = garaId ? `${this.getBaseUrl()}/api/allegati?gara_id=${encodeURIComponent(garaId)}` : `${this.getBaseUrl()}/api/allegati`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Errore recupero allegati gara");
    return await resp.json();
  },

  async addAllegato(allegatoData) {
    const resp = await fetch(`${this.getBaseUrl()}/api/allegati`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allegatoData)
    });
    if (!resp.ok) throw new Error("Errore registrazione allegato");
    return await resp.json();
  },

  async deleteAllegato(allegatoId) {
    const resp = await fetch(`${this.getBaseUrl()}/api/allegati/${encodeURIComponent(allegatoId)}`, {
      method: "DELETE"
    });
    if (!resp.ok) throw new Error("Errore eliminazione allegato");
    return await resp.json();
  },

  getIcsExportUrl(garaId = null) {
    return garaId ? `${this.getBaseUrl()}/api/export/ics?gara_id=${encodeURIComponent(garaId)}` : `${this.getBaseUrl()}/api/export/ics`;
  }
};

