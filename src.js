
import { createClient } from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.querySelector('#app');

let sb = null;
let snapshot = null;
let currentUser = null;

const euro = n => new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2
}).format(Number(n || 0));

const esc = v => String(v ?? '—').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

const fmtDate = s => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? esc(s) : d.toLocaleDateString('it-IT');
};

const fmtDateTime = s => s
  ? new Date(s).toLocaleString('it-IT')
  : 'Mai';

function login(message = 'Accedi per consultare i dati sincronizzati dal software locale.') {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="login card">
        <div class="brand">
          <div class="brand-icon">P</div>
          <div><strong>Peppol</strong><span>Sales Analytics</span></div>
        </div>
        <h1>La tua attività, ovunque.</h1>
        <p>${esc(message)}</p>
        <form id="login">
          <label>Email
            <input type="email" name="email" required autocomplete="username"
              placeholder="nome@azienda.it">
          </label>
          <label>Password
            <input type="password" name="password" required
              autocomplete="current-password" placeholder="Password">
          </label>
          <button type="submit">Accedi alla dashboard</button>
          <div id="error" class="error" role="alert"></div>
        </form>
        <button type="button" id="forgot-password" class="secondary">
          Password dimenticata?
        </button>
        <div id="recovery-message" class="error" role="status"></div>
        <small>I dati vengono sincronizzati dal software Peppol installato sul computer.</small>
      </section>
    </main>`;

  document.querySelector('#login').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const errorEl = document.querySelector('#error');
    const button = e.currentTarget.querySelector('[type="submit"]');

    button.disabled = true;
    button.textContent = 'Accesso in corso…';
    errorEl.textContent = '';

    try {
      const { error } = await sb.auth.signInWithPassword({
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || '')
      });

      if (error) {
        errorEl.textContent =
          `${error.message || 'Accesso non riuscito'}`
          + (error.status ? ` (HTTP ${error.status})` : '')
          + (error.code ? ` (${error.code})` : '');
        return;
      }

      await render();
    } catch (err) {
      errorEl.textContent =
        'Errore di collegamento: ' + (err?.message || 'riprova.');
    } finally {
      const activeButton = document.querySelector('#login [type="submit"]');
      if (activeButton) {
        activeButton.disabled = false;
        activeButton.textContent = 'Accedi alla dashboard';
      }
    }
  });

  document.querySelector('#forgot-password').addEventListener('click', async () => {
    const emailInput = document.querySelector('#login input[name="email"]');
    const message = document.querySelector('#recovery-message');
    const button = document.querySelector('#forgot-password');
    const email = emailInput.value.trim();

    if (!email) {
      message.textContent = 'Inserisci prima il tuo indirizzo email.';
      emailInput.focus();
      return;
    }

    button.disabled = true;
    message.textContent = 'Invio email in corso…';

    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`
      });

      message.textContent = error
        ? `Errore: ${error.message}`
        : 'Se l’indirizzo è registrato, riceverai un’email per reimpostare la password.';
    } catch (err) {
      message.textContent = 'Errore: ' + (err?.message || 'riprova.');
    } finally {
      button.disabled = false;
    }
  });
}

function resetPasswordPage() {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="login card">
        <div class="brand">
          <div class="brand-icon">P</div>
          <div><strong>Peppol</strong><span>Sales Analytics</span></div>
        </div>
        <h1>Reimposta la password</h1>
        <p>Inserisci e conferma la nuova password.</p>
        <form id="reset-form">
          <label>Nuova password
            <input type="password" name="password" required minlength="6"
              autocomplete="new-password">
          </label>
          <label>Conferma password
            <input type="password" name="confirm" required minlength="6"
              autocomplete="new-password">
          </label>
          <button type="submit">Salva password</button>
          <div id="reset-error" class="error" role="alert"></div>
        </form>
      </section>
    </main>`;

  document.querySelector('#reset-form').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');
    const errorEl = document.querySelector('#reset-error');
    const button = e.currentTarget.querySelector('[type="submit"]');

    if (password !== confirm) {
      errorEl.textContent = 'Le password non coincidono.';
      return;
    }

    button.disabled = true;
    errorEl.textContent = 'Aggiornamento in corso…';

    try {
      const { error } = await sb.auth.updateUser({ password });

      if (error) {
        errorEl.textContent = error.message;
        return;
      }

      errorEl.textContent = 'Password aggiornata. Puoi continuare.';
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = 'Apri dashboard';
      next.addEventListener('click', render);
      e.currentTarget.replaceWith(next);
    } catch (err) {
      errorEl.textContent = err?.message || 'Errore durante il salvataggio.';
    } finally {
      button.disabled = false;
    }
  });
}

function moneyCard(label, value, icon, sub = '') {
  return `
    <article class="metric">
      <div class="metric-top">
        <span>${esc(label)}</span>
        <span class="metric-icon">${icon}</span>
      </div>
      <strong>${esc(value)}</strong>
      <small>${esc(sub)}</small>
    </article>`;
}

function table(title, rows, cols) {
  rows = Array.isArray(rows) ? rows : [];

  return `
    <section class="card table-card">
      <div class="section-head">
        <h2>${esc(title)}</h2>
        <span>${rows.length} documenti</span>
      </div>
      ${
        rows.length
          ? `<div class="table-scroll">
              <table>
                <thead><tr>
                  ${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${rows.map(r => `<tr>
                    ${cols.map(c => {
                      const value = r?.[c.key];
                      const output = c.money
                        ? euro(value)
                        : c.date
                          ? fmtDate(value)
                          : esc(value);
                      return `<td>${output}</td>`;
                    }).join('')}
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`
          : '<div class="empty">Nessun dato disponibile nell’ultima sincronizzazione.</div>'
      }
    </section>`;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'sales', label: 'Fatture vendita', icon: '▤' },
  { id: 'purchases', label: 'Fatture acquisto', icon: '▧' },
  { id: 'orders', label: 'Ordini clienti', icon: '▣' },
  { id: 'bank', label: 'Estratto conto', icon: '⇄' }
];

function getPage() {
  const page = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return navItems.some(item => item.id === page) ? page : 'dashboard';
}

function shell(page, synced, content) {
  return `
    <aside class="sidebar">
      <a class="brand brand-link" href="#/dashboard">
        <div class="brand-icon">P</div>
        <div><strong>Peppol</strong><span>Sales Analytics</span></div>
      </a>

      <nav aria-label="Navigazione principale">
        ${navItems.map(item => `
          <a href="#/${item.id}"
             class="nav-link ${page === item.id ? 'active' : ''}"
             ${page === item.id ? 'aria-current="page"' : ''}>
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>

      <div class="side-foot">
        Dashboard cloud<br>
        <span>Replica in sola lettura</span>
      </div>
    </aside>

    <main class="main">
      <header class="page-header">
        <div class="page-heading">
          <p class="eyebrow">PEPPOL SALES ANALYTICS</p>
          <h1>${esc(navItems.find(item => item.id === page)?.label || 'Dashboard')}</h1>
          <p class="muted">Dati sincronizzati dal software locale.</p>
        </div>

        <div class="header-actions">
          <span class="sync-status">
            <i></i>
            <span>Ultima sincronizzazione</span>
            <b>${esc(synced)}</b>
          </span>
          <button id="refresh" class="secondary">↻ Aggiorna</button>
          <button id="logout" class="secondary">Esci</button>
        </div>
      </header>

      <div class="page-content">${content}</div>

      <footer>
        Peppol Sales Analytics · Dashboard online ·
        <span>Replica in sola lettura</span>
      </footer>
    </main>
  `;
}

function dashboardPage(p, k, b, synced) {
  return `
    <section class="section-head kpi-title">
      <h2>Riepilogo economico</h2>
      <span>Valori dell’ultima sincronizzazione</span>
    </section>

    <section class="metrics">
      ${moneyCard('Fatturato lordo', euro(k.sales?.gross_total), '↗',
        `${k.sales?.count || 0} fatture vendita`)}
      ${moneyCard('Fatture acquisto', euro(k.purchases?.gross_total), '↙',
        `${k.purchases?.count || 0} fatture registrate`)}
      ${moneyCard('Ordini clienti', euro(k.orders?.gross_total), '▣',
        `${k.orders?.count || 0} ordini`)}
      ${moneyCard('Entrate bancarie', euro(b.incoming), '＋',
        `${b.count || 0} movimenti importati`)}
    </section>

    <section class="metrics metrics-small">
      ${moneyCard('Uscite bancarie', euro(b.outgoing), '−',
        'Totale movimenti in uscita')}
      ${moneyCard('Movimenti abbinati', String(b.linked_sales || 0), '✓',
        'Collegati a fatture vendita')}
      ${moneyCard('Fatture vendita', String(k.sales?.count || 0), '▤',
        'Documenti sincronizzati')}
      ${moneyCard('Ultimo aggiornamento', synced, '◷',
        'Ora locale del software')}
    </section>

    <section class="quick-links">
      <h2>Vai alle sezioni</h2>
      <div class="quick-grid">
        ${navItems.filter(item => item.id !== 'dashboard').map(item => `
          <a class="quick-link card" href="#/${item.id}">
            <span class="quick-icon">${item.icon}</span>
            <span>${item.label}</span>
            <span class="quick-arrow">→</span>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

function pageContent(page, p, k, b, synced) {
  switch (page) {
    case 'sales':
      return table('Fatture vendita', p.sales_invoices || [], [
        { key: 'invoice_number', label: 'Numero' },
        { key: 'counterparty', label: 'Cliente' },
        { key: 'issue_date', label: 'Data', date: true },
        { key: 'total', label: 'Totale', money: true },
        { key: 'status', label: 'Stato' }
      ]);

    case 'purchases':
      return table('Fatture acquisto', p.purchase_invoices || [], [
        { key: 'invoice_number', label: 'Numero' },
        { key: 'counterparty', label: 'Fornitore' },
        { key: 'issue_date', label: 'Data', date: true },
        { key: 'total', label: 'Totale', money: true },
        { key: 'status', label: 'Stato' }
      ]);

    case 'orders':
      return table('Ordini clienti', p.orders || [], [
        { key: 'order_number', label: 'Ordine' },
        { key: 'order_date', label: 'Data', date: true },
        { key: 'total', label: 'Totale', money: true },
        { key: 'currency', label: 'Valuta' }
      ]);

    case 'bank':
      return `
        <section class="metrics bank-metrics">
          ${moneyCard('Entrate', euro(b.incoming), '＋', 'Movimenti in entrata')}
          ${moneyCard('Uscite', euro(b.outgoing), '−', 'Movimenti in uscita')}
          ${moneyCard('Movimenti abbinati', String(b.linked_sales || 0), '✓',
            'Collegati a fatture vendita')}
          ${moneyCard('Movimenti importati', String(b.count || 0), '⇄',
            'Totale movimenti sincronizzati')}
        </section>
        <section class="card bank-card">
          <h2>Estratto conto</h2>
          <p class="muted">
            Il riepilogo mostra i movimenti bancari presenti nell’ultima
            sincronizzazione. L’elenco dettagliato sarà disponibile se
            il software locale include i singoli movimenti nel payload cloud.
          </p>
        </section>`;

    default:
      return dashboardPage(p, k, b, synced);
  }
}

async function render() {
  const { data: { session }, error: sessionError } = await sb.auth.getSession();

  if (sessionError || !session) {
    login();
    return;
  }

  currentUser = session.user;
  app.innerHTML = '<div class="loading">Caricamento dati sincronizzati…</div>';

  const { data, error } = await sb
    .from('dashboard_snapshots')
    .select('payload,synced_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    app.innerHTML = `
      <main class="login-wrap">
        <section class="card login">
          <h1>Dashboard non disponibile</h1>
          <p>Non è stato possibile leggere i dati cloud: ${esc(error.message)}</p>
          <button id="retry">Riprova</button>
          <button id="logout" class="secondary">Esci</button>
        </section>
      </main>`;

    document.querySelector('#retry').onclick = render;
    document.querySelector('#logout').onclick = async () => {
      await sb.auth.signOut();
      login();
    };
    return;
  }

  snapshot = data;
  renderPage();
}

function renderPage() {
  if (!currentUser || !snapshot) return;

  const p = snapshot.payload || {};
  const k = p.kpi || {};
  const b = p.bank || {};
  const synced = fmtDateTime(snapshot.synced_at);
  const page = getPage();

  app.innerHTML = shell(
    page,
    synced,
    pageContent(page, p, k, b, synced)
  );

  document.querySelector('#refresh').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Aggiornamento…';
    await render();
  });

  document.querySelector('#logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    currentUser = null;
    snapshot = null;
    login();
  });
}

window.addEventListener('hashchange', renderPage);

if (!url || !anon) {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="card login">
        <h1>Configurazione necessaria</h1>
        <p>Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili ambiente di Vercel.</p>
      </section>
    </main>`;
} else {
  sb = createClient(url, anon);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      resetPasswordPage();
    }
  });

  render();
}
