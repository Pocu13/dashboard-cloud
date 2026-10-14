
import { createClient } from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.querySelector('#app');

let sb = null;

const euro = n => new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2
}).format(Number(n || 0));

const date = s => s ? new Date(s).toLocaleDateString('it-IT') : '—';

const esc = v => String(v ?? '—').replace(/[&<>\\\"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\\\"': '&quot;',
  "'": '&#39;'
}[ch]));

function login(message = 'Accedi per consultare i dati sincronizzati dal software locale.') {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="login card">
        <div class="brand">
          <div class="brand-icon">P</div>
          <div><strong>Peppol</strong><span>Sales Analytics</span></div>
        </div>
        <h1>La tua attività, ovunque.</h1>
        <p>${message}</p>
        <form id="login">
          <label>
            Email
            <input type="email" name="email" required autocomplete="username" placeholder="nome@azienda.it">
          </label>
          <label>
            Password
            <input type="password" name="password" required autocomplete="current-password" placeholder="Password">
          </label>
          <button type="submit">Accedi alla dashboard</button>
          <div id="error" class="error" role="alert"></div>
        </form>
        <button type="button" id="forgot-password" class="secondary">Password dimenticata?</button>
        <div id="recovery-message" class="error" role="status"></div>
        <small>I dati vengono sincronizzati dal software Peppol installato sul computer.</small>
      </section>
    </main>`;

  document.querySelector('#login').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const errorEl = document.querySelector('#error');
    const submitButton = e.currentTarget.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = 'Accesso in corso…';
    errorEl.textContent = '';

    try {
      const { error } = await sb.auth.signInWithPassword({
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || '')
      });

      if (error) {
        const known = {
          'Invalid login credentials': 'Email o password non corretti.',
          'Email not confirmed': 'L’indirizzo email non è ancora stato confermato.',
          'Too many requests': 'Troppi tentativi. Attendi qualche minuto e riprova.',
          'User not found': 'Non esiste un account con questo indirizzo email.'
        };

        errorEl.textContent =
          (known[error.message] || error.message || 'Errore di autenticazione non specificato') +
          (error.code ? ' (codice: ' + error.code + ')' : '') +
          (error.status ? ' (HTTP ' + error.status + ')' : '');
      } else {
        await render();
      }
    } catch (err) {
      errorEl.textContent =
        'Errore durante il collegamento al servizio di accesso. Controlla la connessione e riprova.' +
        (err && err.message ? ' Dettaglio: ' + err.message : '');
    } finally {
      const currentButton = document.querySelector('#login button[type="submit"]');

      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = 'Accedi alla dashboard';
      }
    }
  });

  document.querySelector('#forgot-password').addEventListener('click', async () => {
    const email = document.querySelector('#login input[name="email"]').value.trim();
    const messageEl = document.querySelector('#recovery-message');

    if (!email) {
      messageEl.textContent = 'Inserisci prima il tuo indirizzo email nel campo Email.';
      document.querySelector('#login input[name="email"]').focus();
      return;
    }

    const button = document.querySelector('#forgot-password');
    button.disabled = true;
    messageEl.textContent = 'Invio email di recupero in corso…';

    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`
    });

    button.disabled = false;

    messageEl.textContent = error
      ? `Impossibile inviare l’email di recupero: ${error.message}`
      : 'Se l’indirizzo è registrato, riceverai un’email con il link per reimpostare la password. Controlla anche Spam.';
  });
}

function resetPasswordPage(message = '') {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="login card">
        <div class="brand">
          <div class="brand-icon">P</div>
          <div><strong>Peppol</strong><span>Sales Analytics</span></div>
        </div>
        <h1>Reimposta la password</h1>
        <p>Inserisci una nuova password per il tuo account.</p>
        <form id="reset-password-form">
          <label>
            Nuova password
            <input type="password" name="password" required minlength="6" autocomplete="new-password" placeholder="Almeno 6 caratteri">
          </label>
          <label>
            Conferma nuova password
            <input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" placeholder="Ripeti la nuova password">
          </label>
          <button type="submit">Salva nuova password</button>
          <div id="reset-error" class="error" role="alert">${esc(message)}</div>
        </form>
        <button type="button" id="back-to-login" class="secondary">Torna al login</button>
      </section>
    </main>`;

  document.querySelector('#back-to-login').addEventListener('click', () => {
    login('Accedi con la nuova password.');
  });

  document.querySelector('#reset-password-form').addEventListener('submit', async e => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '');
    const confirmPassword = String(fd.get('confirmPassword') || '');
    const errorEl = document.querySelector('#reset-error');
    const button = e.currentTarget.querySelector('button[type="submit"]');

    if (password !== confirmPassword) {
      errorEl.textContent = 'Le due password non coincidono.';
      return;
    }

    button.disabled = true;
    errorEl.textContent = 'Aggiornamento della password in corso…';

    const { error } = await sb.auth.updateUser({ password });

    button.disabled = false;

    if (error) {
      errorEl.textContent = `Non è stato possibile aggiornare la password: ${error.message}`;
      return;
    }

    app.innerHTML = `
      <main class="login-wrap">
        <section class="login card">
          <div class="brand">
            <div class="brand-icon">P</div>
            <div><strong>Peppol</strong><span>Sales Analytics</span></div>
          </div>
          <h1>Password aggiornata</h1>
          <p>La nuova password è stata salvata correttamente.</p>
          <button type="button" id="continue-dashboard">Continua</button>
        </section>
      </main>`;

    document.querySelector('#continue-dashboard').addEventListener('click', render);
  });
}

function moneyCard(label, value, icon, sub = '') {
  return `
    <article class="metric">
      <div class="metric-top">
        <span>${label}</span>
        <span class="metric-icon">${icon}</span>
      </div>
      <strong>${value}</strong>
      <small>${sub}</small>
    </article>`;
}

function table(title, rows, cols) {
  return `
    <section class="card table-card">
      <div class="section-head">
        <h2>${title}</h2>
        <span>${rows.length} recenti</span>
      </div>
      ${
        rows.length
          ? `<div class="table-scroll">
              <table>
                <thead>
                  <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
                </thead>
                <tbody>
                  ${rows.map(r => `
                    <tr>
                      ${cols.map(c => `
                        <td>${c.money ? esc(euro(r[c.key])) : esc(r[c.key])}</td>
                      `).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
          : '<div class="empty">Nessun dato sincronizzato per questa sezione.</div>'
      }
    </section>`;
}

async function render() {
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    login();
    return;
  }

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
          <p>Non è stato possibile leggere i dati cloud. Controlla la configurazione Supabase e le autorizzazioni.</p>
          <button id="retry">Riprova</button>
          <button class="secondary" id="logout">Esci</button>
        </section>
      </main>`;

    document.querySelector('#retry').onclick = render;
    document.querySelector('#logout').onclick = () => sb.auth.signOut().then(render);
    return;
  }

  const p = data?.payload || {};
  const k = p.kpi || {};
  const b = p.bank || {};
  const synced = data?.synced_at
    ? new Date(data.synced_at).toLocaleString('it-IT')
    : 'Mai';

  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">P</div>
        <div><strong>Peppol</strong><span>Sales Analytics</span></div>
      </div>
      <nav>
        <a class="active">▦ &nbsp; Dashboard</a>
        <a href="#sales">▤ &nbsp; Fatture vendita</a>
        <a href="#purchases">▧ &nbsp; Fatture acquisto</a>
        <a href="#orders">▣ &nbsp; Ordini clienti</a>
        <a href="#bank">⇄ &nbsp; Estratto conto</a>
      </nav>
      <div class="side-foot">Dashboard cloud<br/><span>Replica in sola lettura</span></div>
    </aside>

    <main class="main">
      <header>
        <div>
          <p class="eyebrow">PANORAMICA</p>
          <h1>Dashboard</h1>
          <p class="muted">Una visione chiara e aggiornata della tua attività.</p>
        </div>
        <div class="header-actions">
          <span class="sync-status">
            <i></i> Ultima sincronizzazione<br/>
            <b>${synced}</b>
          </span>
          <button id="refresh" class="secondary">↻ Aggiorna</button>
          <button id="logout" class="secondary">Esci</button>
        </div>
      </header>

      <section class="welcome">
        <div>
          <span class="welcome-label">PEPPOL SALES ANALYTICS</span>
          <h2>I numeri principali, in un unico posto.</h2>
          <p>Questa dashboard mostra una copia dei dati inviati dal software locale. Non modifica i dati originali.</p>
        </div>
        <div class="welcome-mark">↗</div>
      </section>

      <div class="section-head kpi-title">
        <h2>Riepilogo economico</h2>
        <span>Valori disponibili nell'ultima sincronizzazione</span>
      </div>

      <section class="metrics">
        ${moneyCard('Fatturato lordo', euro(k.sales?.gross_total), '↗', `${k.sales?.count || 0} fatture vendita`)}
        ${moneyCard('Fatture acquisto', euro(k.purchases?.gross_total), '↙', `${k.purchases?.count || 0} fatture registrate`)}
        ${moneyCard('Ordini clienti', euro(k.orders?.gross_total), '▣', `${k.orders?.count || 0} ordini`)}
        ${moneyCard('Entrate bancarie', euro(b.incoming), '＋', `${b.count || 0} movimenti importati`)}
      </section>

      <section class="metrics metrics-small">
        ${moneyCard('Uscite bancarie', euro(b.outgoing), '−', 'Totale movimenti in uscita')}
        ${moneyCard('Movimenti abbinati', String(b.linked_sales || 0), '✓', 'Collegati a fatture vendita')}
        ${moneyCard('Fatture vendita', String(k.sales?.count || 0), '▤', 'Documenti nel database locale')}
        ${moneyCard('Ultimo aggiornamento', synced, '◷', 'Ora locale del software')}
      </section>

      <div id="sales">
        ${table('Fatture vendita', p.sales_invoices || [], [
          { key: 'invoice_number', label: 'Numero' },
          { key: 'counterparty', label: 'Cliente' },
          { key: 'issue_date', label: 'Data' },
          { key: 'total', label: 'Totale', money: true },
          { key: 'status', label: 'Stato' }
        ])}
      </div>

      <div id="purchases">
        ${table('Fatture acquisto', p.purchase_invoices || [], [
          { key: 'invoice_number', label: 'Numero' },
          { key: 'counterparty', label: 'Fornitore' },
          { key: 'issue_date', label: 'Data' },
          { key: 'total', label: 'Totale', money: true },
          { key: 'status', label: 'Stato' }
        ])}
      </div>

      <div id="orders">
        ${table('Ordini clienti', p.orders || [], [
          { key: 'order_number', label: 'Ordine' },
          { key: 'order_date', label: 'Data' },
          { key: 'total', label: 'Totale', money: true },
          { key: 'currency', label: 'Valuta' }
        ])}
      </div>

      <section id="bank" class="card bank-card">
        <div>
          <h2>Estratto conto</h2>
          <p class="muted">Movimenti importati nel software principale.</p>
        </div>
        <div class="bank-stats">
          <div><small>Entrate</small><strong>${euro(b.incoming)}</strong></div>
          <div><small>Uscite</small><strong>${euro(b.outgoing)}</strong></div>
          <div><small>Abbinamenti</small><strong>${b.linked_sales || 0}</strong></div>
        </div>
      </section>

      <footer>
        Peppol Sales Analytics · Dashboard online ·
        <span>Replica in sola lettura</span>
      </footer>
    </main>`;

  document.querySelector('#refresh').onclick = render;
  document.querySelector('#logout').onclick = () => sb.auth.signOut().then(render);
}

if (!url || !anon) {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="card login">
        <h1>Configurazione necessaria</h1>
        <p>Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili ambiente di Vercel.</p>
      </section>
    </main>`;
} else {
  sb = createClient(url, anon);

  // Supabase emette PASSWORD_RECOVERY quando il link email viene aperto
  // e la sessione di recupero è stata riconosciuta.
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      resetPasswordPage();
    }
  });

  login();
}
