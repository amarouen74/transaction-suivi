import { useEffect, useMemo, useState } from 'react';
import { buildMilestones, buildReminders, buildSummary, determineRisk, getDealStatus, statusLabelClass } from './utils';
import { collectReminders } from './reminderEngine';
import type { Contact, ContactRole, DealStatus, DocumentStatus, LoanStatus, NotaireStatus, ReminderItem, Transaction } from './types';
import { deleteContact as deleteContactApi, deleteDeal as deleteDealApi, fetchContacts, fetchDeals, saveContact as saveContactApi, saveDeal, signIn, signUp, signOut, getSession, onAuthStateChange } from './api';
import { supabaseReady } from './supabaseClient';

const REMINDER_INTERVAL_MS = 60_000;

type Notification = { message: string; type: 'success' | 'error' } | null;

const todayStr = () => new Date().toISOString().slice(0, 10);

const makeEmptyTransaction = (): Transaction => ({
  id: '',
  property: '',
  buyer: '',
  buyerId: undefined,
  seller: '',
  sellerId: undefined,
  compromisDate: todayStr(),
  notaire: '',
  notaireId: undefined,
  price: 0,
  loanStatus: 'pending',
  documentStatus: 'missing',
  notaireStatus: 'not ready',
  completed: false
});

const emptyContact: Contact = {
  id: '',
  name: '',
  role: 'buyer',
  email: '',
  phone: ''
};

const statusBadge = (value: string) => {
  const color = value.includes('approved') || value.includes('complete') || value.includes('ready') || value === 'on track' ? 'badge-good' : 'badge-warning';
  return <span className={`status-badge ${color}`}>{value}</span>;
};

const roleLabel = (role: ContactRole) => {
  return role.replace(/\b\w/g, (c) => c.toUpperCase());
};

// ── Sample demo data ──
const demoTransactions: Transaction[] = [
  {
    id: 'demo-1',
    property: '12 Rue de Rivoli, Paris',
    buyer: 'Sophie Martin',
    buyerId: undefined,
    seller: 'Jean Dupont',
    sellerId: undefined,
    compromisDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Laurent Petit',
    notaireId: undefined,
    price: 425000,
    loanStatus: 'approved',
    documentStatus: 'missing',
    notaireStatus: 'ready',
    completed: false
  },
  {
    id: 'demo-2',
    property: '8 Avenue des Ternes, Lyon',
    buyer: 'Marc Lefevre',
    buyerId: undefined,
    seller: 'Claire Bernard',
    sellerId: undefined,
    compromisDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Sophie Moreau',
    notaireId: undefined,
    price: 312000,
    loanStatus: 'pending',
    documentStatus: 'complete',
    notaireStatus: 'not ready',
    completed: false
  },
  {
    id: 'demo-3',
    property: '25 Boulevard Haussmann, Marseille',
    buyer: 'Lucas Roux',
    buyerId: undefined,
    seller: 'Marie Lambert',
    sellerId: undefined,
    compromisDate: new Date(Date.now() - 75 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Philippe Durand',
    notaireId: undefined,
    price: 550000,
    loanStatus: 'pending',
    documentStatus: 'missing',
    notaireStatus: 'not ready',
    completed: false
  }
];

const demoContacts: Contact[] = [
  { id: 'demo-c1', name: 'Sophie Martin', role: 'buyer', email: 'sophie.martin@email.com', phone: '06 12 34 56 78' },
  { id: 'demo-c2', name: 'Jean Dupont', role: 'seller', email: 'jean.dupont@email.com', phone: '06 98 76 54 32' },
  { id: 'demo-c3', name: 'Me. Laurent Petit', role: 'notaire', email: 'laurent.petit@notaire.fr', phone: '01 45 67 89 01' },
  { id: 'demo-c4', name: 'Marc Lefevre', role: 'buyer', email: 'marc.lefevre@email.com', phone: '06 23 45 67 89' },
  { id: 'demo-c5', name: 'Claire Bernard', role: 'seller', email: 'claire.bernard@email.com', phone: '06 87 65 43 21' }
];

function App() {
  const [user, setUser] = useState<any | null>(null);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transaction, setTransaction] = useState<Transaction>(makeEmptyTransaction);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Contact>(emptyContact);
  const [filter, setFilter] = useState<DealStatus>('all');
  const [notification, setNotification] = useState<Notification>(null);
  const [loading, setLoading] = useState(false);
  const [dueReminders, setDueReminders] = useState<ReminderItem[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'deal' | 'contact'; id: string } | null>(null);

  const loadData = async (userId: string) => {
    setLoading(true);
    setNotification(null);

    try {
      const [deals, savedContacts] = await Promise.all([fetchDeals(userId), fetchContacts(userId)]);
      setTransactions(deals);
      setContacts(savedContacts);
    } catch (error) {
      notify(`Unable to load backend data: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSession().then((session) => {
      if (session?.user) {
        setUser(session.user);
        loadData(session.user.id);
      }
    });

    const { data } = onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadData(session.user.id);
        if (event === 'SIGNED_IN') {
          notify('Signed in successfully.', 'success');
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setTransactions([]);
        setContacts([]);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const updateReminders = () => setDueReminders(collectReminders(transactions, contacts));
    updateReminders();
    const timer = window.setInterval(updateReminders, REMINDER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [transactions, contacts]);

  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => setNotificationPermission(permission));
    }
  }, []);

  const milestones = useMemo(() => buildMilestones(transaction), [transaction]);
  const reminders = useMemo(() => buildReminders(transaction), [transaction]);
  const risk = useMemo(() => determineRisk(transaction), [transaction]);

  const filteredTransactions = useMemo(() => {
    if (filter === 'all') return transactions;
    return transactions.filter((item) => getDealStatus(item) === filter);
  }, [filter, transactions]);

  const stats = useMemo(
    () => ({
      all: transactions.length,
      active: transactions.filter((item) => getDealStatus(item) === 'active').length,
      atRisk: transactions.filter((item) => getDealStatus(item) === 'at risk').length,
      closingSoon: transactions.filter((item) => getDealStatus(item) === 'closing soon').length,
      completed: transactions.filter((item) => getDealStatus(item) === 'completed').length
    }),
    [transactions]
  );

  const handleChange = (field: keyof Transaction, value: string | number | boolean | undefined) => {
    setTransaction((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleContactChange = (field: keyof Contact, value: string) => {
    setContactForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const selectContactForTransaction = (field: 'buyerId' | 'sellerId' | 'notaireId', contactId: string) => {
    const contact = contacts.find((item) => item.id === contactId);
    setTransaction((current) => ({
      ...current,
      [field]: contactId || undefined,
      [field === 'buyerId' ? 'buyer' : field === 'sellerId' ? 'seller' : 'notaire']: contact ? contact.name : current[field === 'buyerId' ? 'buyer' : field === 'sellerId' ? 'seller' : 'notaire']
    }));
  };

  const resetDealForm = () => {
    setSelectedDealId(null);
    setTransaction(makeEmptyTransaction());
  };

  const resetContactForm = () => {
    setSelectedContactId(null);
    setContactForm(emptyContact);
  };

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), type === 'error' ? 5000 : 3000);
  };

  const handleAuthFormChange = (field: 'email' | 'password', value: string) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  const loginUser = async () => {
    if (!authForm.email.trim() || !authForm.password.trim()) {
      notify('Email and password are required.', 'error');
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const response = authMode === 'signIn'
        ? await signIn(authForm.email, authForm.password)
        : await signUp(authForm.email, authForm.password);

      if (response.error) {
        throw response.error;
      }

      if (authMode === 'signUp') {
        notify('Check your email to confirm sign-up.', 'success');
      }
    } catch (error) {
      notify(`Authentication failed: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setTransactions([]);
    setContacts([]);
    setTransaction(makeEmptyTransaction());
    setContactForm(emptyContact);
    setNotification(null);
    setDeleteConfirm(null);
  };

  const saveTransaction = async () => {
    if (!user) {
      notify('Please sign in before saving deals.', 'error');
      return;
    }

    if (!transaction.property.trim() || !transaction.buyer.trim() || !transaction.seller.trim()) {
      notify('Property, buyer, and seller are required.', 'error');
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const result = await saveDeal(transaction, user.id);
      setTransactions((current) => {
        if (selectedDealId) {
          return current.map((item) => (item.id === selectedDealId ? result : item));
        }
        return [result, ...current];
      });
      notify(selectedDealId ? 'Deal updated.' : 'Deal saved.', 'success');
      resetDealForm();
    } catch (error) {
      notify(`Unable to save deal: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveContactForm = async () => {
    if (!user) {
      notify('Please sign in before saving contacts.', 'error');
      return;
    }

    if (!contactForm.name.trim()) {
      notify('Contact name is required.', 'error');
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const result = await saveContactApi(contactForm, user.id);
      setContacts((current) => {
        if (selectedContactId) {
          return current.map((item) => (item.id === selectedContactId ? result : item));
        }
        return [result, ...current];
      });
      notify(selectedContactId ? 'Contact updated.' : 'Contact saved.', 'success');
      resetContactForm();
    } catch (error) {
      notify(`Unable to save contact: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectTransaction = (id: string) => {
    const selected = transactions.find((item) => item.id === id);
    if (!selected) return;
    setSelectedDealId(id);
    setTransaction(selected);
  };

  const requestDeleteDeal = (id: string) => {
    setDeleteConfirm({ type: 'deal', id });
  };

  const requestDeleteContact = (id: string) => {
    setDeleteConfirm({ type: 'contact', id });
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || !user) return;

    try {
      if (deleteConfirm.type === 'deal') {
        await deleteDealApi(deleteConfirm.id, user.id);
        setTransactions((current) => current.filter((item) => item.id !== deleteConfirm.id));
        if (selectedDealId === deleteConfirm.id) resetDealForm();
        notify('Deal removed.', 'success');
      } else {
        await deleteContactApi(deleteConfirm.id, user.id);
        setContacts((current) => current.filter((item) => item.id !== deleteConfirm.id));
        if (selectedContactId === deleteConfirm.id) resetContactForm();
        notify('Contact removed.', 'success');
      }
    } catch (error) {
      notify(`Unable to remove: ${error}`, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const selectContact = (id: string) => {
    const selected = contacts.find((item) => item.id === id);
    if (!selected) return;
    setSelectedContactId(id);
    setContactForm(selected);
  };

  const cancelDealEdit = () => {
    resetDealForm();
    notify('Edit cancelled.', 'success');
  };

  const cancelContactEdit = () => {
    resetContactForm();
    notify('Edit cancelled.', 'success');
  };

  const copySummary = () => {
    const summary = buildSummary(transaction);
    navigator.clipboard.writeText(summary).then(() => {
      notify('Summary copied to clipboard.', 'success');
    });
  };

  const sendReminderEmail = (reminder: ReminderItem) => {
    if (!reminder.contactEmail) {
      notify(`No email address for ${reminder.contactRole}.`, 'error');
      return;
    }

    const subject = encodeURIComponent(`Reminder: ${reminder.property}`);
    const body = encodeURIComponent(`Hello ${reminder.contactName || ''},\n\nThis is a reminder for ${reminder.property}:\n${reminder.message}\nDue: ${reminder.dueDate}\n\nPlease follow up as needed.`);
    window.location.href = `mailto:${reminder.contactEmail}?subject=${subject}&body=${body}`;
  };

  const sendBrowserNotification = (reminder: ReminderItem) => {
    if ('Notification' in window && notificationPermission === 'granted') {
      new Notification(`Reminder for ${reminder.property}`, {
        body: `${reminder.message} (due ${reminder.dueDate})`,
        silent: true
      });
      notify(`Browser reminder sent for ${reminder.property}.`, 'success');
      return;
    }

    notify('Allow browser notifications to use alerts.', 'error');
  };

  const contactOptions = (role: ContactRole) => contacts.filter((item) => item.role === role || item.role === 'other');

  const seedDemoData = () => {
    setTransactions(demoTransactions);
    setContacts(demoContacts);
    resetDealForm();
    resetContactForm();
    setFilter('all');
    setNotification(null);
    notify('Demo data loaded! ⚠️ This is a preview — data will disappear on refresh.', 'success');
  };

  const hasRealData = user && (transactions.length > 0 || contacts.length > 0);

  // ── Setup required screen ──
  if (!supabaseReady) {
    return (
      <div className="page-shell">
        <header>
          <h1>Transaction Suivi</h1>
        </header>
        <section className="card auth-card">
          <h2>Setup Required</h2>
          <p>This app needs Supabase credentials to run.</p>
          <ol style={{ marginTop: 16, lineHeight: 2 }}>
            <li>Create a <strong>.env</strong> file in the project root.</li>
            <li>Add your Supabase project URL and anon key:</li>
          </ol>
          <pre style={{ background: '#f0f4ff', padding: 16, borderRadius: 12, fontSize: '0.9rem', overflow: 'auto' }}>
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
          <p style={{ marginTop: 16 }}>
            You can find these in your Supabase project dashboard under <strong>Settings → API</strong>.
          </p>
        </section>
      </div>
    );
  }

  // ── Auth screen ──
  if (!user) {
    return (
      <div className="page-shell">
        <header>
          <h1>Transaction Suivi</h1>
          <p>Sign in to persist deals and contacts with Supabase.</p>
        </header>

        <section className="card auth-card">
          <h2>{authMode === 'signIn' ? 'Sign in' : 'Create account'}</h2>

          <div className="field-grid">
            <label>
              Email
              <input type="email" value={authForm.email} onChange={(e) => handleAuthFormChange('email', e.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input type="password" value={authForm.password} onChange={(e) => handleAuthFormChange('password', e.target.value)} placeholder="Minimum 6 characters" />
            </label>
          </div>

          <div className="form-actions">
            <button type="button" onClick={loginUser} disabled={loading}>
              {loading ? 'Working...' : authMode === 'signIn' ? 'Sign in' : 'Sign up'}
            </button>
            <button type="button" className="secondary" onClick={() => setAuthMode(authMode === 'signIn' ? 'signUp' : 'signIn')}>
              {authMode === 'signIn' ? 'Create account' : 'Already have an account?'}
            </button>
          </div>
          {notification && <div className={`notification ${notification.type === 'error' ? 'notification-error' : ''}`}>{notification.message}</div>}
        </section>
      </div>
    );
  }

  // ── Main app ──
  return (
    <div className="page-shell">
      <header>
        <h1>Transaction Suivi</h1>
        <p>Manage multiple real estate deals with saved contacts, linked deals, and reminders.</p>
        <div className="user-toolbar">
          <span>Signed in as {user?.email}</span>
          <button type="button" className="secondary" onClick={logout} disabled={loading}>
            Sign out
          </button>
        </div>
        {loading && <div className="notification">Loading...</div>}
        {notification && <div className={`notification ${notification.type === 'error' ? 'notification-error' : ''}`}>{notification.message}</div>}
      </header>

      {/* ── Demo data banner ── */}
      {!hasRealData && (
        <section className="card demo-card">
          <div className="demo-banner">
            <div>
              <h2>👋 Welcome to Transaction Suivi</h2>
              <p>Try it out instantly with sample data — no commitment needed. Or create your first deal below.</p>
            </div>
            <button className="demo-button" onClick={seedDemoData}>
              Load demo data
            </button>
          </div>
          <p className="demo-note">⚠️ Demo data is temporary and will disappear on refresh. Sign up to save your real deals permanently.</p>
        </section>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm deletion</h3>
            <p>Are you sure you want to delete this {deleteConfirm.type === 'deal' ? 'deal' : 'contact'}? This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={cancelDelete}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="card dashboard-card">
        <div className="dashboard-header">
          <div>
            <h2>Deal dashboard</h2>
            <p>Saved transactions persist in your Supabase account.</p>
          </div>
          <div className="filter-buttons">
            {(['all', 'active', 'at risk', 'closing soon', 'completed'] as DealStatus[]).map((status) => (
              <button
                key={status}
                className={filter === status ? 'filter-button active' : 'filter-button'}
                type="button"
                onClick={() => setFilter(status)}
              >
                {status === 'all' ? 'All deals' : status.replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-stats">
          <div><strong>{stats.all}</strong> all</div>
          <div><strong>{stats.active}</strong> active</div>
          <div><strong>{stats.atRisk}</strong> at risk</div>
          <div><strong>{stats.closingSoon}</strong> closing soon</div>
          <div><strong>{stats.completed}</strong> completed</div>
        </div>

        <div className="table-wrap">
          <table className="deal-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Buyer</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Sale date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-row">
                    <div className="empty-state">
                      <strong>No deals yet</strong>
                      <span>Create your first transaction using the form below.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((item) => {
                  const status = getDealStatus(item);
                  const itemMilestones = buildMilestones(item);
                  return (
                    <tr key={item.id}>
                      <td>{item.property}</td>
                      <td>{item.buyer}</td>
                      <td><span className={`status-pill ${statusLabelClass(status)}`}>{status}</span></td>
                      <td>{determineRisk(item)}</td>
                      <td>{itemMilestones.saleDate}</td>
                      <td>
                        <button type="button" className="tiny-button" onClick={() => selectTransaction(item.id)}>
                          Edit
                        </button>
                        <button type="button" className="tiny-button danger" onClick={() => requestDeleteDeal(item.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Transaction form FIRST (before contacts) ── */}
      <section className="card form-card">
        <div className="split-row">
          <div>
            <h2>{selectedDealId ? 'Edit transaction' : 'Create transaction'}</h2>
          </div>
          <div className="form-actions">
            <button type="button" onClick={resetDealForm} className="secondary">
              New deal
            </button>
            {selectedDealId && (
              <button type="button" className="secondary" onClick={cancelDealEdit}>
                Cancel
              </button>
            )}
            <button type="button" onClick={saveTransaction}>
              {selectedDealId ? 'Update deal' : 'Save deal'}
            </button>
          </div>
        </div>

        <div className="field-grid">
          <label>
            Property
            <input value={transaction.property} onChange={(e) => handleChange('property', e.target.value)} placeholder="Address or short name" />
          </label>
          <label>
            Buyer contact
            <select value={transaction.buyerId || ''} onChange={(e) => selectContactForTransaction('buyerId', e.target.value)}>
              <option value="">Choose buyer contact</option>
              {contactOptions('buyer').map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </label>
          <label>
            Buyer name
            <input value={transaction.buyer} onChange={(e) => handleChange('buyer', e.target.value)} placeholder="Buyer name" />
          </label>
          <label>
            Seller contact
            <select value={transaction.sellerId || ''} onChange={(e) => selectContactForTransaction('sellerId', e.target.value)}>
              <option value="">Choose seller contact</option>
              {contactOptions('seller').map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </label>
          <label>
            Seller name
            <input value={transaction.seller} onChange={(e) => handleChange('seller', e.target.value)} placeholder="Seller name" />
          </label>
          <label>
            Compromis date
            <input type="date" value={transaction.compromisDate} onChange={(e) => handleChange('compromisDate', e.target.value)} />
          </label>
          <label>
            Notaire contact
            <select value={transaction.notaireId || ''} onChange={(e) => selectContactForTransaction('notaireId', e.target.value)}>
              <option value="">Choose notaire contact</option>
              {contactOptions('notaire').map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </label>
          <label>
            Notaire name
            <input value={transaction.notaire} onChange={(e) => handleChange('notaire', e.target.value)} placeholder="Optional notaire" />
          </label>
          <label>
            Price (€)
            <input type="number" min="0" value={transaction.price} onChange={(e) => handleChange('price', Number(e.target.value))} />
          </label>
          <label>
            Loan status
            <select value={transaction.loanStatus} onChange={(e) => handleChange('loanStatus', e.target.value as LoanStatus)}>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="refused">refused</option>
            </select>
          </label>
          <label>
            Document status
            <select value={transaction.documentStatus} onChange={(e) => handleChange('documentStatus', e.target.value as DocumentStatus)}>
              <option value="missing">missing</option>
              <option value="complete">complete</option>
            </select>
          </label>
          <label>
            Notaire status
            <select value={transaction.notaireStatus} onChange={(e) => handleChange('notaireStatus', e.target.value as NotaireStatus)}>
              <option value="not ready">not ready</option>
              <option value="ready">ready</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={transaction.completed} onChange={(e) => handleChange('completed', e.target.checked)} />
            Mark deal as completed
          </label>
        </div>
      </section>

      {/* ── Timeline and status ── */}
      <section className="card overview-card">
        <div className="split-row">
          <div>
            <h2>Timeline overview</h2>
            <ul className="timeline-list">
              <li><strong>Legal withdrawal deadline</strong><span>{milestones.withdrawalDeadline}</span></li>
              <li><strong>Loan approval deadline</strong><span>{milestones.loanApprovalDeadline}</span></li>
              <li><strong>Notaire documents deadline</strong><span>{milestones.documentDeadline}</span></li>
              <li><strong>Estimated acte de vente</strong><span>{milestones.saleDate}</span></li>
            </ul>
          </div>
          <div>
            <h2>Status snapshot</h2>
            <div className="status-grid">
              <div><strong>Loan</strong>{statusBadge(transaction.loanStatus)}</div>
              <div><strong>Documents</strong>{statusBadge(transaction.documentStatus)}</div>
              <div><strong>Notaire</strong>{statusBadge(transaction.notaireStatus)}</div>
              <div><strong>Overall</strong>{statusBadge(risk)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Automatic reminders ── */}
      <section className="card reminders-card">
        <h2>Automatic reminders</h2>
        <ul>
          {reminders.length === 0 ? (
            <li style={{ listStyle: 'none', color: '#6b7685' }}>No reminders for the current selection.</li>
          ) : (
            reminders.map((reminder, idx) => (
              <li key={`rm-${idx}`}>{reminder}</li>
            ))
          )}
        </ul>
      </section>

      {/* ── Scheduled reminders ── */}
      <section className="card scheduled-reminders-card">
        <h2>Scheduled reminders</h2>
        {dueReminders.length === 0 ? (
          <p>No scheduled reminders are due right now.</p>
        ) : (
          <div className="reminder-list">
            {dueReminders.map((reminder) => (
              <div key={`${reminder.transactionId}-${reminder.message}`} className="reminder-item">
                <div className="reminder-text">
                  <strong>{reminder.property}</strong>
                  <div>{reminder.message}</div>
                  <small>Due {reminder.dueDate} ({reminder.dueInDays} day(s))</small>
                  <small>Contact: {reminder.contactName || reminder.contactRole} {reminder.contactEmail ? `(${reminder.contactEmail})` : ''}</small>
                </div>
                <div className="reminder-actions">
                  <button type="button" onClick={() => sendReminderEmail(reminder)}>
                    Email reminder
                  </button>
                  <button type="button" className="secondary" onClick={() => sendBrowserNotification(reminder)}>
                    Browser alert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Contact form ── */}
      <section className="card form-card">
        <div className="split-row">
          <div>
            <h2>{selectedContactId ? 'Edit contact' : 'Create contact'}</h2>
            <p>Save your buyer, seller, and notaire details here and link them to deals.</p>
          </div>
          <div className="form-actions">
            <button type="button" onClick={resetContactForm} className="secondary">
              New contact
            </button>
            {selectedContactId && (
              <button type="button" className="secondary" onClick={cancelContactEdit}>
                Cancel
              </button>
            )}
            <button type="button" onClick={saveContactForm}>
              {selectedContactId ? 'Update contact' : 'Save contact'}
            </button>
          </div>
        </div>

        <div className="field-grid">
          <label>
            Name
            <input value={contactForm.name} onChange={(e) => handleContactChange('name', e.target.value)} placeholder="Contact name" />
          </label>
          <label>
            Role
            <select value={contactForm.role} onChange={(e) => handleContactChange('role', e.target.value as ContactRole)}>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="notaire">Notaire</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Email
            <input type="email" value={contactForm.email} onChange={(e) => handleContactChange('email', e.target.value)} placeholder="Email address" />
          </label>
          <label>
            Phone
            <input value={contactForm.phone} onChange={(e) => handleContactChange('phone', e.target.value)} placeholder="Phone number" />
          </label>
        </div>
      </section>

      {/* ── Contact list ── */}
      <section className="card" style={{ paddingBottom: 0 }}>
        <h2>Contact list</h2>
        <div className="table-wrap">
          <table className="deal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-row">
                    <div className="empty-state">
                      <strong>No contacts yet</strong>
                      <span>Save your first contact above and link them to a deal.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>{roleLabel(contact.role)}</td>
                    <td>{contact.email || '-'}</td>
                    <td>{contact.phone || '-'}</td>
                    <td>
                      <button type="button" className="tiny-button" onClick={() => selectContact(contact.id)}>
                        Edit
                      </button>
                      <button type="button" className="tiny-button danger" onClick={() => requestDeleteContact(contact.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Summary export ── */}
      <section className="card export-card">
        <h2>Summary export</h2>
        <p>Copy a quick shareable summary for clients, notaire, or your own follow-up notes.</p>
        <button onClick={copySummary}>Copy summary</button>
      </section>
    </div>
  );
}

export default App;