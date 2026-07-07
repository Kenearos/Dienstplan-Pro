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
        const email = (input.value || '').trim();
        await fetch('/api/admin/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ email }),
        });
        input.value = '';
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
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #eee';
        const span = document.createElement('span');
        span.textContent = u.email + (u.isAdmin ? '  (Admin)' : '');
        row.appendChild(span);
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.textContent = 'Entfernen';
        btn.addEventListener('click', async () => {
          if (!confirm(`Nutzer ${u.email} entfernen?`)) return;
          const r = await fetch('/api/admin/users/' + u.id, { method: 'DELETE', credentials: 'include' });
          if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Fehler beim Entfernen'); }
          this.loadUsers();
        });
        row.appendChild(btn);
        list.appendChild(row);
      });
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
