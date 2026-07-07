/**
 * DataSync — hält LocalStorage (synchrone Working-Copy) und Server-DB
 * (dauerhafte Wahrheit + Backup + Historie) synchron.
 * ponytail: last-write-wins auf ganzen Dokumenten. Single-User → genügt.
 */
const DataSync = {
  KEY_EMPLOYEES: 'dienstplan_employees',
  KEY_DUTIES: 'dienstplan_duties',
  KEY_VACATION: 'dienstplan_vacation',
  KEY_PENDING: 'dienstplan_sync_pending',
  _applying: false,
  _timer: null,
  online: false,

  _local() {
    const parse = (k, fb) => {
      try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; }
      catch { return fb; }
    };
    return {
      employees: parse(this.KEY_EMPLOYEES, []),
      duties: parse(this.KEY_DUTIES, {}),
      vacation: parse(this.KEY_VACATION, {}),
    };
  },

  _isEmpty(s) {
    return (!s.employees || s.employees.length === 0)
      && (!s.duties || Object.keys(s.duties).length === 0)
      && (!s.vacation || Object.keys(s.vacation).length === 0);
  },

  // Reine Entscheidung — in Node unit-getestet.
  decideSync(local, server, pending) {
    if (server === null) return 'offline';
    if (pending) return 'push-local';
    if (this._isEmpty(server) && !this._isEmpty(local)) return 'push-local';
    return 'adopt-server';
  },

  _applyServer(server) {
    this._applying = true;
    try {
      localStorage.setItem(this.KEY_EMPLOYEES, JSON.stringify(server.employees ?? []));
      localStorage.setItem(this.KEY_DUTIES, JSON.stringify(server.duties ?? {}));
      localStorage.setItem(this.KEY_VACATION, JSON.stringify(server.vacation ?? {}));
    } finally {
      this._applying = false;
    }
  },

  async boot() {
    let server = null;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) server = await res.json();
    } catch { /* offline */ }

    const action = this.decideSync(this._local(), server, localStorage.getItem(this.KEY_PENDING) === '1');
    if (action === 'offline') { this.online = false; this._renderStatus(); return; }
    this.online = true;
    if (action === 'adopt-server') this._applyServer(server);
    else await this._flush(); // push-local: Erstmigration oder pending Offline-Aenderungen
    this._renderStatus();
  },

  push() {
    if (this._applying) return;
    this._dirty = (this._dirty || 0) + 1;
    localStorage.setItem(this.KEY_PENDING, '1');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), 500);
  },

  async _flush() {
    const gen = this._dirty; // ponytail: Generationszaehler gegen Verlust-Race bei ueberlappenden Flushes
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._local()),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (this._dirty === gen) localStorage.removeItem(this.KEY_PENDING); // nur wenn kein neuerer push() lief
      this.online = true;
    } catch (e) {
      console.error('Sync fehlgeschlagen, Daten bleiben lokal:', e);
      this.online = false; // pending bleibt gesetzt → naechster boot() pusht
    }
    this._renderStatus();
  },

  _renderStatus() {
    if (typeof document === 'undefined' || !document.body) return;
    let el = document.getElementById('sync-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-status';
      el.style.cssText = 'position:fixed;bottom:8px;right:8px;font-size:12px;'
        + 'padding:4px 8px;border-radius:6px;z-index:9999;opacity:.85;color:#fff';
      document.body.appendChild(el);
    }
    el.textContent = this.online ? '● Synchronisiert' : '● Offline (nur lokal)';
    el.style.background = this.online ? '#1e7e34' : '#856404';
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = DataSync;
if (typeof window !== 'undefined') window.DataSync = DataSync;
