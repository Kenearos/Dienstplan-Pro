/**
 * AuthUI — Login-Overlay, Admin-Nutzerverwaltung, Logout, Nutzer-Isolation.
 * Hält app.js schlank; alle fetch mit credentials.
 */
const AuthUI = {
  // Bei Nutzerwechsel/Logout zu leerende Schlüssel: Daten + pending + gerätelokaler OpenRouter-Key.
  KEYS_TO_CLEAR: [
    'dienstplan_employees', 'dienstplan_duties', 'dienstplan_vacation',
    'dienstplan_sync_pending', 'dienstplan_openrouter_key', 'dienstplan_openrouter_model',
  ],

  clearLocalData() { this.KEYS_TO_CLEAR.forEach(k => localStorage.removeItem(k)); },

  showLogin() {
    const ov = document.getElementById('login-overlay');
    const cont = document.querySelector('.container');
    if (ov) ov.hidden = false;
    if (cont) cont.style.display = 'none';
    this.wireLoginForm();
  },
  hideLogin() {
    const ov = document.getElementById('login-overlay');
    const cont = document.querySelector('.container');
    if (ov) ov.hidden = true;
    if (cont) cont.style.display = '';
  },

  wireLoginForm() {
    const form = document.getElementById('login-form');
    if (!form || form._wired) return;
    form._wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (document.getElementById('login-email').value || '').trim();
      try {
        await fetch('/api/auth/request', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ email }),
        });
      } catch { /* neutral bleiben */ }
      const msg = document.getElementById('login-message');
      if (msg) msg.hidden = false;
      const btn = form.querySelector('button');
      if (btn) btn.disabled = true;
    });
  },

  showAdminSection() {
    const sec = document.getElementById('admin-section');
    if (sec) sec.hidden = false;
    this.loadUsers();
    const addForm = document.getElementById('admin-add-form');
    if (addForm && !addForm._wired) {
      addForm._wired = true;
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('admin-add-email');
        const nameInput = document.getElementById('admin-add-name');
        const email = (input.value || '').trim();
        const name = nameInput ? (nameInput.value || '').trim() : '';
        const r = await fetch('/api/admin/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ email, name }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Anlegen fehlgeschlagen'); return; }
        input.value = '';
        if (nameInput) nameInput.value = '';
        this.loadUsers();
      });
    }
  },

  async loadUsers() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) return;
      const { users } = await res.json();
      list.innerHTML = '';
      users.forEach((u) => {
        const row = document.createElement('div');
        row.className = 'admin-user-row';

        const span = document.createElement('span');
        span.className = 'admin-user-mail';
        span.textContent = u.email + (u.isAdmin ? '  (Admin)' : '') + (u.active ? '' : '  — deaktiviert');
        row.appendChild(span);

        // Anzeigename: erscheint so im Team-Plan und ordnet die Alt-Dienste zu.
        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'admin-user-name';
        name.placeholder = 'Anzeigename';
        name.value = u.name || '';
        name.addEventListener('change', async () => {
          const r = await fetch(`/api/admin/users/${u.id}/name`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ name: name.value }),
          });
          if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Name nicht gespeichert'); }
          this.loadUsers();
        });
        row.appendChild(name);

        const knopf = (text, klasse, fn) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `btn btn-small ${klasse}`;
          b.textContent = text;
          b.addEventListener('click', fn);
          row.appendChild(b);
        };

        if (u.active) {
          knopf('Deaktivieren', 'btn-secondary', async () => {
            if (!confirm(`${u.email} deaktivieren? Die Person kann sich dann nicht mehr anmelden, ihre Dienste bleiben erhalten.`)) return;
            const r = await fetch(`/api/admin/users/${u.id}/deactivate`, { method: 'POST', credentials: 'include' });
            if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Fehler'); }
            this.loadUsers();
          });
        } else {
          knopf('Wieder aktivieren', 'btn-primary', async () => {
            await fetch(`/api/admin/users/${u.id}/activate`, { method: 'POST', credentials: 'include' });
            this.loadUsers();
          });
        }

        knopf('Entfernen', 'btn-danger', async () => {
          if (!confirm(`Nutzer ${u.email} endgültig entfernen?`)) return;
          const r = await fetch('/api/admin/users/' + u.id, { method: 'DELETE', credentials: 'include' });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            alert(j.error || 'Fehler beim Entfernen');
          }
          this.loadUsers();
        });

        list.appendChild(row);
      });
      this.loadLegacy();
    } catch { /* ignorieren */ }
  },

  // Zeigt, welche Namen aus den Altdaten noch kein Konto haben, und bietet
  // die einmalige Uebernahme an, sobald alle zugeordnet sind.
  async loadLegacy() {
    const box = document.getElementById('admin-legacy');
    if (!box) return;
    try {
      const res = await fetch('/api/admin/legacy-names', { credentials: 'include' });
      if (!res.ok) return;
      const { offen, zugeordnet } = await res.json();
      box.innerHTML = '';
      if (!offen.length && !zugeordnet.length) return;

      const p = document.createElement('p');
      p.className = 'text-muted';
      p.textContent = offen.length
        ? `Ohne Konto: ${offen.join(', ')} — trag oben die E-Mail ein und schreib denselben Namen ins Feld.`
        : `Alle ${zugeordnet.length} Namen aus den Altdaten sind zugeordnet.`;
      box.appendChild(p);

      if (!offen.length) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primary';
        b.textContent = 'Alte Dienste übernehmen';
        b.addEventListener('click', async () => {
          const r = await fetch('/api/admin/migrate-legacy', { method: 'POST', credentials: 'include' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { alert(j.error || 'Übernahme fehlgeschlagen'); return; }
          alert(`${j.dienste} Dienste und ${j.urlaube} Urlaubsmonate übernommen.\n\n${j.zeilen.join('\n')}`);
          this.loadLegacy();
        });
        box.appendChild(b);
      }
    } catch { /* ignorieren */ }
  },

  wireLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* egal */ }
      this.clearLocalData();
      localStorage.removeItem('dienstplan_current_user');
      location.reload();
    });
  },
};

if (typeof window !== 'undefined') window.AuthUI = AuthUI;
