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
    const fehler = (text) => {
      const p = document.getElementById('login-fehler');
      if (!p) return;
      p.textContent = text;
      p.hidden = !text;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      fehler('');
      const email = (document.getElementById('login-email').value || '').trim();
      const feld = document.getElementById('login-password');
      const passwort = feld ? feld.value : '';

      // Ohne Passwort fällt die Maske auf den Magic-Link zurück — der bleibt
      // der Notausgang, wenn jemand sein Passwort vergessen hat.
      if (!passwort) {
        try {
          await fetch('/api/auth/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ email }),
          });
        } catch { /* neutral bleiben */ }
        const msg = document.getElementById('login-message');
        if (msg) msg.hidden = false;
        return;
      }

      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ email, password: passwort }),
        });
        if (r.ok) { location.reload(); return; }
        const j = await r.json().catch(() => ({}));
        // Der Server bleibt neutral und sagt nicht, ob es das Konto gibt oder ob
        // nur das Passwort fehlt. Fuer jemanden, der zum ersten Mal hier ist,
        // waere das eine Sackgasse — deshalb der Hinweis auf den zweiten Knopf.
        fehler(`${j.error || 'Anmeldung fehlgeschlagen.'} Zum ersten Mal hier? Dann leg mit dem Knopf darunter dein Passwort fest.`);
      } catch {
        fehler('Keine Verbindung zum Server.');
      }
    });

    const ersteinrichtung = document.getElementById('login-erstmalig');
    if (ersteinrichtung && !ersteinrichtung._wired) {
      ersteinrichtung._wired = true;
      ersteinrichtung.addEventListener('click', async () => {
        fehler('');
        const email = (document.getElementById('login-email').value || '').trim();
        const feld = document.getElementById('login-password');
        const passwort = feld ? feld.value : '';
        if (!email || !passwort) {
          fehler('Trag oben deine E-Mail und das gewünschte Passwort ein.');
          return;
        }
        try {
          const r = await fetch('/api/auth/set-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ email, password: passwort }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { fehler(j.error || 'Das hat nicht geklappt.'); return; }
          // Neutral: der Server sagt nicht, ob die Adresse freigeschaltet ist.
          // Deshalb gleich den Login versuchen — das gibt die ehrliche Antwort.
          const l = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ email, password: passwort }),
          });
          if (l.ok) { location.reload(); return; }
          fehler('Passwort gesetzt oder Adresse nicht freigeschaltet — bitte bei der Leitung melden.');
        } catch {
          fehler('Keine Verbindung zum Server.');
        }
      });
    }
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
