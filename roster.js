/**
 * Team-Plan: der Aushang zum Reinklicken.
 *
 * Ein Bildschirm, drei Regeln:
 *  - Jeder sieht den ganzen Monat.
 *  - Eintragen und Zurueckziehen darf jeder nur fuer sich.
 *  - Entscheiden darf nur der Admin, direkt in der Zeile.
 *
 * Der Server erzwingt all das nochmal; hier geht es nur darum, gar nicht erst
 * anzubieten, was ohnehin abgelehnt wuerde.
 */
const Roster = {
  ich: null,          // { id, email, isAdmin }
  monat: null,        // 'YYYY-MM'
  eintraege: [],

  async init() {
    const jetzt = new Date();
    this.monat = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('roster-month').value = this.monat;
    document.getElementById('roster-month').addEventListener('change', (e) => {
      this.monat = e.target.value;
      this.laden();
    });
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (r.ok) this.ich = await r.json();
    } catch { /* offline: dann bleibt es beim Nur-Lesen */ }
    await this.laden();
  },

  async laden() {
    const ziel = document.getElementById('roster-table');
    if (!this.monat) return;
    try {
      const r = await fetch(`/api/roster?month=${this.monat}`, { credentials: 'include' });
      if (!r.ok) {
        ziel.innerHTML = '<p class="text-muted">Plan konnte nicht geladen werden.</p>';
        return;
      }
      this.eintraege = (await r.json()).duties;
      this.zeichnen();
    } catch {
      ziel.innerHTML = '<p class="text-muted">Offline — der Plan zeigt nur den letzten Stand.</p>';
    }
  },

  tageDesMonats() {
    const [j, m] = this.monat.split('-').map(Number);
    const anzahl = new Date(j, m, 0).getDate();
    return Array.from({ length: anzahl }, (_, i) => `${this.monat}-${String(i + 1).padStart(2, '0')}`);
  },

  zeichnen() {
    const proTag = {};
    for (const e of this.eintraege) (proTag[e.date] ||= []).push(e);

    const tabelle = document.createElement('table');
    tabelle.className = 'roster-table';
    tabelle.innerHTML = '<thead><tr><th>Tag</th><th>Besetzt durch</th><th>Ich</th></tr></thead>';
    const body = document.createElement('tbody');

    for (const tag of this.tageDesMonats()) {
      const eintraege = proTag[tag] || [];
      const summe = eintraege.filter((e) => e.status !== 'rejected')
        .reduce((s, e) => s + e.share, 0);
      const meiner = eintraege.find((e) => this.ich && e.userId === this.ich.id && e.status !== 'rejected');

      const tr = document.createElement('tr');
      tr.className = 'roster-row';
      // Ein Tag, dessen Summe nicht 1,0 ergibt, ist auffaellig — die Regel
      // stammt aus den echten Bestandsdaten, nicht aus einer Annahme.
      if (summe > 1.0001) tr.classList.add('roster-ueberbucht');
      else if (summe > 0 && summe < 0.9999) tr.classList.add('roster-halb');

      const d = new Date(`${tag}T12:00:00`);
      const wt = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const istWE = d.getDay() === 0 || d.getDay() === 6;

      const tdTag = document.createElement('td');
      tdTag.className = `roster-tag${istWE ? ' roster-wochenende' : ''}`;
      tdTag.textContent = `${wt}, ${d.getDate()}.`;
      tr.appendChild(tdTag);

      const tdWer = document.createElement('td');
      for (const e of eintraege) {
        if (e.status === 'rejected') continue;
        tdWer.appendChild(this.person(e));
      }
      if (!tdWer.children.length) {
        const leer = document.createElement('span');
        leer.className = 'text-muted';
        leer.textContent = 'frei';
        tdWer.appendChild(leer);
      }
      tr.appendChild(tdWer);

      tr.appendChild(this.eigeneSpalte(tag, meiner, summe));
      body.appendChild(tr);
    }

    tabelle.appendChild(body);
    const ziel = document.getElementById('roster-table');
    ziel.innerHTML = '';
    ziel.appendChild(tabelle);
  },

  person(e) {
    const span = document.createElement('span');
    span.className = `roster-person roster-${e.status}`;
    const anteil = e.share === 1 ? '' : ' ½';
    span.textContent = `${e.name}${anteil}`;
    if (e.status === 'pending') span.title = 'wartet auf Freigabe';
    span.appendChild(document.createTextNode(' '));
    if (this.ich && this.ich.isAdmin && e.status === 'pending') {
      span.appendChild(this.knopf('✓', 'roster-ja', () => this.entscheiden(e.id, 'approved')));
      span.appendChild(this.knopf('✕', 'roster-nein', () => this.entscheiden(e.id, 'rejected')));
    }
    return span;
  },

  eigeneSpalte(tag, meiner, summe) {
    const td = document.createElement('td');
    if (!this.ich) return td;
    if (meiner) {
      const zustand = document.createElement('span');
      zustand.className = 'text-muted';
      zustand.textContent = meiner.status === 'approved' ? 'freigegeben' : 'vorgemerkt';
      td.appendChild(zustand);
      if (meiner.status === 'pending') {
        td.appendChild(this.knopf('zurückziehen', 'btn btn-small btn-secondary',
          () => this.zuruecknehmen(meiner.id)));
      }
      return td;
    }
    // Voll besetzte Tage nicht zum Klicken anbieten — der Server wuerde es
    // erlauben, aber es waere fast immer ein Versehen.
    if (summe >= 1) {
      const voll = document.createElement('span');
      voll.className = 'text-muted';
      voll.textContent = '—';
      td.appendChild(voll);
      return td;
    }
    td.appendChild(this.knopf('ganz', 'btn btn-small btn-primary', () => this.eintragen(tag, 1)));
    td.appendChild(this.knopf('halb', 'btn btn-small btn-secondary', () => this.eintragen(tag, 0.5)));
    return td;
  },

  knopf(text, klasse, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = klasse;
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  },

  async schicken(pfad, opts, erfolg) {
    try {
      const r = await fetch(pfad, { credentials: 'include', ...opts });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (window.app) app.showToast(body.error || 'Das hat nicht geklappt.', 'error');
        return false;
      }
      if (window.app) app.showToast(erfolg, 'success');
      await this.laden();
      return true;
    } catch {
      if (window.app) app.showToast('Keine Verbindung — der Plan braucht Netz.', 'error');
      return false;
    }
  },

  eintragen(date, share) {
    return this.schicken('/api/duties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, share }),
    }, 'Eingetragen, wartet auf Freigabe.');
  },

  zuruecknehmen(id) {
    return this.schicken(`/api/duties/${id}`, { method: 'DELETE' }, 'Zurückgezogen.');
  },

  entscheiden(id, status) {
    return this.schicken(`/api/duties/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }, status === 'approved' ? 'Freigegeben.' : 'Abgelehnt.');
  },
};

window.Roster = Roster;
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('roster-table')) Roster.init();
});
