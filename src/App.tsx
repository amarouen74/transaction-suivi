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
  id: '', property: '', buyer: '', buyerId: undefined, seller: '', sellerId: undefined,
  compromisDate: todayStr(), notaire: '', notaireId: undefined, price: 0,
  loanStatus: 'pending', documentStatus: 'missing', notaireStatus: 'not ready', completed: false
});

const emptyContact: Contact = { id: '', name: '', role: 'buyer', email: '', phone: '' };

const statusBadge = (value: string) => {
  const color = value.includes('approved') || value.includes('complete') || value.includes('ready') || value === 'on track' ? 'badge-good' : 'badge-warning';
  return <span className={`status-badge ${color}`}>{value}</span>;
};
const roleLabel = (role: ContactRole) => role.replace(/\b\w/g, (c) => c.toUpperCase());

// ── Demo data ──
const demoTransactions: Transaction[] = [
  { id: 'demo-1', property: 'Appartement 3 pièces — 15 Bd des Anglais, Nice', buyer: 'Thomas Rivière', seller: 'Sophie Mercier', compromisDate: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), notaire: 'Me. Audrey Fontaine', price: 420000, loanStatus: 'pending', documentStatus: 'missing', notaireStatus: 'not ready', completed: false },
  { id: 'demo-2', property: 'Maison 5 pièces — 8 Rue du Vieux Moulin, Lyon 5e', buyer: 'Camille Dubois', seller: 'Marc Lefevre', compromisDate: new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10), notaire: 'Me. Philippe Garnier', price: 585000, loanStatus: 'approved', documentStatus: 'complete', notaireStatus: 'ready', completed: false },
  { id: 'demo-3', property: 'Studio rénové — 22 Rue de Turbigo, Paris 3e', buyer: 'Lucas Martin', seller: 'Isabelle Laurent', compromisDate: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10), notaire: 'Me. Claire Dubois', price: 275000, loanStatus: 'refused', documentStatus: 'missing', notaireStatus: 'not ready', completed: false }
];
const demoContacts: Contact[] = [
  { id: 'demo-c1', name: 'Thomas Rivière', role: 'buyer', email: 'thomas.riviere@email.fr', phone: '06 12 34 56 78' },
  { id: 'demo-c2', name: 'Sophie Mercier', role: 'seller', email: 'sophie.mercier@email.fr', phone: '06 98 76 54 32' },
  { id: 'demo-c3', name: 'Me. Audrey Fontaine', role: 'notaire', email: 'afontaine@notaires.fr', phone: '04 93 85 12 00' },
  { id: 'demo-c4', name: 'Camille Dubois', role: 'buyer', email: 'camille.dubois@email.fr', phone: '06 23 45 67 89' },
  { id: 'demo-c5', name: 'Philippe Garnier', role: 'notaire', email: 'pgarnier@notaires.fr', phone: '04 78 42 18 00' }
];

const testimonialData = [
  { name: 'Caroline M.', role: 'Agent immobilier — Paris 16e', text: 'Je perds le fil avec 15 dossiers en parallèle. Maintenant je vois en un coup d\'œil où j\'en suis et surtout ce qui va exploser.', avatar: 'CM' },
  { name: 'Karim B.', role: 'Agent — Lyon 6e', text: 'L\'échéance de prêt de mon client est passée inaperçue l\'an dernier — j\'ai perdu 22 000 € de commission. Avec Transaction Suivi, plus jamais.', avatar: 'KB' },
  { name: 'Sophie L.', role: 'Agent — Nice', text: 'Le rappel automatique J-7 avant l\'échéance des docs notaire m\'a sauvé une signature. Client et notaire étaient contents du professionnalisme.', avatar: 'SL' }
];

const faqData = [
  { q: 'Quels types de biens puis-je suivre ?', a: 'Appartements, maisons, terrains, locaux commerciaux — tout type de transaction immobilière avec un compromis de vente.' },
  { q: 'Les données sont-elles sécurisées ?', a: 'Oui. Conforme RGPD et hébergé en France. Vos données ne sont jamais partagées avec des tiers.' },
  { q: 'Puis-je ajouter mon notaire ou mon banquier ?', a: 'Oui. Créez des contacts avec email et numéro de téléphone pour relancer directement depuis l\'application.' },
  { q: 'Que se passe-t-il si un délai expire ?', a: 'Une notification apparaît en rouge dans le tableau de bord, et vous recevez une alerte avec les coordonnées du contact à relancer.' },
  { q: 'Est-ce que je peux essayer gratuitement ?', a: 'Oui. Le plan Gratuit vous permet de suivre 1 dossier. Le plan Pro à 19€/mois est sans limite.' },
  { q: 'Comment sont calculés les délais ?', a: 'Basés sur le droit français : 10 jours de rétractation, 45 jours pour la condition suspensive de prêt, 30 jours pour les documents notaire.' }
];

function App() {
  const [user, setUser] = useState<any | null>(null);
  const params = new URLSearchParams(window.location.search);
  const [demoMode, setDemoMode] = useState(params.has('demo'));
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
  const [searchQuery, setSearchQuery] = useState('');
  const [quickData, setQuickData] = useState({ property: '', buyer: '', seller: '', price: 0 });
  const [showPricing, setShowPricing] = useState(false);
  const [showFaq, setShowFaq] = useState<number | null>(null);

  const loadData = async (userId: string) => {
    setLoading(true); setNotification(null);
    try {
      const [deals, savedContacts] = await Promise.all([fetchDeals(userId), fetchContacts(userId)]);
      setTransactions(deals); setContacts(savedContacts);
    } catch (error: any) {
      const message = error?.message || error?.error_description || JSON.stringify(error);
      notify(`Impossible de charger les données: ${message}`, 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!supabaseReady) return;
    getSession().then((session) => { if (session?.user) { setUser(session.user); loadData(session.user.id); } });
    const authListener = onAuthStateChange((event, session) => {
      if (session?.user) { setUser(session.user); loadData(session.user.id); if (event === 'SIGNED_IN') notify('Connecté avec succès.', 'success'); }
      else if (event === 'SIGNED_OUT') { setUser(null); setTransactions([]); setContacts([]); }
    });
    return () => authListener?.data?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    const updateReminders = () => setDueReminders(collectReminders(transactions, contacts));
    updateReminders(); const timer = window.setInterval(updateReminders, REMINDER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [transactions, contacts]);

  useEffect(() => {
    if (demoMode && transactions.length === 0) { seedDemoData(); }
  }, []);

  useEffect(() => {
    if ('Notification' in window) { Notification.requestPermission().then((permission) => setNotificationPermission(permission)); }
  }, []);

  const milestones = useMemo(() => buildMilestones(transaction), [transaction]);
  const reminders = useMemo(() => {
    if (selectedDealId) return buildReminders(transaction);
    return transactions.flatMap((t) => buildReminders(t));
  }, [selectedDealId, transaction, transactions]);
  const risk = useMemo(() => determineRisk(transaction), [transaction]);

  const filteredTransactions = useMemo(() => {
    let items = transactions;
    if (filter !== 'all') items = items.filter((item) => getDealStatus(item) === filter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); items = items.filter((item) => item.property.toLowerCase().includes(q) || item.buyer.toLowerCase().includes(q) || item.seller.toLowerCase().includes(q) || (item.notaire || '').toLowerCase().includes(q)); }
    return items;
  }, [filter, transactions, searchQuery]);

  const stats = useMemo(() => ({
    all: transactions.length, active: transactions.filter((item) => getDealStatus(item) === 'active').length,
    atRisk: transactions.filter((item) => getDealStatus(item) === 'at risk').length,
    closingSoon: transactions.filter((item) => getDealStatus(item) === 'closing soon').length,
    completed: transactions.filter((item) => getDealStatus(item) === 'completed').length
  }), [transactions]);

  const handleChange = (field: keyof Transaction, value: string | number | boolean | undefined) => setTransaction((current) => ({ ...current, [field]: value }));
  const handleContactChange = (field: keyof Contact, value: string) => setContactForm((current) => ({ ...current, [field]: value }));
  const selectContactForTransaction = (field: 'buyerId' | 'sellerId' | 'notaireId', contactId: string) => {
    const contact = contacts.find((item) => item.id === contactId);
    setTransaction((current) => ({ ...current, [field]: contactId || undefined, [field === 'buyerId' ? 'buyer' : field === 'sellerId' ? 'seller' : 'notaire']: contact ? contact.name : current[field === 'buyerId' ? 'buyer' : field === 'sellerId' ? 'seller' : 'notaire'] }));
  };
  const resetDealForm = () => { setSelectedDealId(null); setTransaction(makeEmptyTransaction()); };
  const resetContactForm = () => { setSelectedContactId(null); setContactForm(emptyContact); };
  const notify = (message: string, type: 'success' | 'error' = 'success') => { setNotification({ message, type }); window.setTimeout(() => setNotification(null), type === 'error' ? 5000 : 3000); };
  const handleAuthFormChange = (field: 'email' | 'password', value: string) => setAuthForm((current) => ({ ...current, [field]: value }));

  const loginUser = async () => {
    if (!authForm.email.trim() || !authForm.password.trim()) { notify('Email et mot de passe requis.', 'error'); return; }
    setLoading(true); setNotification(null);
    try {
      const response = authMode === 'signIn' ? await signIn(authForm.email, authForm.password) : await signUp(authForm.email, authForm.password);
      if (response.error) throw response.error;
      if (authMode === 'signUp') notify('Vérifiez vos emails pour confirmer l\'inscription.', 'success');
    } catch (error) { notify(`Erreur d'authentification: ${error}`, 'error'); } finally { setLoading(false); }
  };

  const logout = async () => {
    if (supabaseReady && user) await signOut();
    setUser(null); setDemoMode(false); setTransactions([]); setContacts([]);
    setTransaction(makeEmptyTransaction()); setContactForm(emptyContact); setNotification(null); setDeleteConfirm(null);
  };

  const saveTransaction = async () => {
    if (!transaction.property.trim() || !transaction.buyer.trim() || !transaction.seller.trim()) { notify('Le bien, l\'acheteur et le vendeur sont requis.', 'error'); return; }
    setLoading(true); setNotification(null);
    try {
      if (user && !demoMode) {
        const result = await saveDeal(transaction, user.id);
        setTransactions((current) => selectedDealId ? current.map((item) => (item.id === selectedDealId ? result : item)) : [result, ...current]);
      } else {
        const localId = transaction.id || `demo-${Date.now()}`;
        setTransactions((current) => selectedDealId ? current.map((item) => (item.id === selectedDealId ? { ...transaction, id: localId } : item)) : [{ ...transaction, id: localId }, ...current]);
      }
      notify(selectedDealId ? 'Dossier mis à jour.' : 'Dossier enregistré.', 'success');
      resetDealForm();
    } catch (error) { notify(`Erreur: ${error}`, 'error'); } finally { setLoading(false); }
  };

  const saveQuickDeal = async () => {
    if (!quickData.property.trim() || !quickData.buyer.trim() || !quickData.seller.trim()) { notify('Bien, acheteur et vendeur requis.', 'error'); return; }
    setLoading(true);
    try {
      if (user && !demoMode) {
        const result = await saveDeal({ ...makeEmptyTransaction(), property: quickData.property, buyer: quickData.buyer, seller: quickData.seller, price: quickData.price }, user.id);
        setTransactions((current) => [result, ...current]);
      } else {
        setTransactions((current) => [{ ...makeEmptyTransaction(), id: `demo-${Date.now()}`, property: quickData.property, buyer: quickData.buyer, seller: quickData.seller, price: quickData.price }, ...current]);
      }
      setQuickData({ property: '', buyer: '', seller: '', price: 0 });
      notify('Dossier ajouté !', 'success');
    } catch (error) { notify(`Erreur: ${error}`, 'error'); } finally { setLoading(false); }
  };

  const saveContactForm = async () => {
    if (!contactForm.name.trim()) { notify('Le nom du contact est requis.', 'error'); return; }
    setLoading(true); setNotification(null);
    try {
      if (user && !demoMode) {
        const result = await saveContactApi(contactForm, user.id);
        setContacts((current) => selectedContactId ? current.map((item) => (item.id === selectedContactId ? result : item)) : [result, ...current]);
      } else {
        const localId = contactForm.id || `demo-contact-${Date.now()}`;
        setContacts((current) => selectedContactId ? current.map((item) => (item.id === selectedContactId ? { ...contactForm, id: localId } : item)) : [{ ...contactForm, id: localId }, ...current]);
      }
      notify(selectedContactId ? 'Contact mis à jour.' : 'Contact enregistré.', 'success');
      resetContactForm();
    } catch (error) { notify(`Erreur: ${error}`, 'error'); } finally { setLoading(false); }
  };

  const selectTransaction = (id: string) => { const selected = transactions.find((item) => item.id === id); if (!selected) return; setSelectedDealId(id); setTransaction(selected); };
  const requestDeleteDeal = (id: string) => setDeleteConfirm({ type: 'deal', id });
  const requestDeleteContact = (id: string) => setDeleteConfirm({ type: 'contact', id });
  const cancelDelete = () => setDeleteConfirm(null);
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'deal') {
        if (user && !demoMode) await deleteDealApi(deleteConfirm.id, user.id);
        setTransactions((current) => current.filter((item) => item.id !== deleteConfirm.id));
        if (selectedDealId === deleteConfirm.id) resetDealForm();
        notify('Dossier supprimé.', 'success');
      } else {
        if (user && !demoMode) await deleteContactApi(deleteConfirm.id, user.id);
        setContacts((current) => current.filter((item) => item.id !== deleteConfirm.id));
        if (selectedContactId === deleteConfirm.id) resetContactForm();
        notify('Contact supprimé.', 'success');
      }
    } catch (error) { notify(`Erreur: ${error}`, 'error'); } finally { setDeleteConfirm(null); }
  };
  const selectContact = (id: string) => { const selected = contacts.find((item) => item.id === id); if (!selected) return; setSelectedContactId(id); setContactForm(selected); };
  const cancelDealEdit = () => { resetDealForm(); notify('Annulé.', 'success'); };
  const cancelContactEdit = () => { resetContactForm(); notify('Annulé.', 'success'); };
  const copySummary = () => { navigator.clipboard.writeText(buildSummary(transaction)).then(() => notify('Résumé copié.', 'success')); };
  const sendReminderEmail = (reminder: ReminderItem) => {
    if (!reminder.contactEmail) { notify(`Pas d'email pour ${reminder.contactRole}.`, 'error'); return; }
    const subject = encodeURIComponent(`Rappel: ${reminder.property}`);
    const body = encodeURIComponent(`Bonjour ${reminder.contactName || ''},\n\nCeci est un rappel pour ${reminder.property}:\n${reminder.message}\nÉchéance: ${reminder.dueDate}\n\nMerci de votre suivi.`);
    window.location.href = `mailto:${reminder.contactEmail}?subject=${subject}&body=${body}`;
  };
  const sendBrowserNotification = (reminder: ReminderItem) => {
    if ('Notification' in window && notificationPermission === 'granted') { new Notification(`Rappel: ${reminder.property}`, { body: `${reminder.message} (échéance ${reminder.dueDate})`, silent: true }); notify('Notification envoyée.', 'success'); return; }
    notify('Autorisez les notifications pour utiliser cette fonction.', 'error');
  };
  const contactOptions = (role: ContactRole) => contacts.filter((item) => item.role === role || item.role === 'other');

  const seedDemoData = () => {
    setTransactions(demoTransactions); setContacts(demoContacts);
    resetDealForm(); resetContactForm(); setFilter('all'); setSearchQuery(''); setNotification(null);
    notify('Données de démo chargées ! ⚠️ Elles disparaîtront après rafraîchissement.', 'success');
  };

  const hasRealData = (user && (transactions.length > 0 || contacts.length > 0)) || demoMode;

  // ── LANDING PAGE (always shown first, unless already logged in or demo) ──
  if (!user && !demoMode) {
    return (
      <div className="lp">
        <div className="lp-nav">
          <div className="lp-nav-inner">
            <span className="lp-logo">🏡 Transaction Suivi</span>
            <div className="lp-nav-links">
              <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({behavior:'smooth'}); }}>Fonctionnalités</a>
              <a href="#testimonials" onClick={(e) => { e.preventDefault(); document.getElementById('testimonials')?.scrollIntoView({behavior:'smooth'}); }}>Témoignages</a>
              <a href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'}); }}>Tarifs</a>
              <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({behavior:'smooth'}); }}>FAQ</a>
            </div>
          </div>
        </div>

        {/* ── Hero ── */}
        <section className="lp-hero">
          <div className="lp-hero-bg" />
          <div className="lp-container">
            <div className="lp-hero-content">
              <div className="lp-hero-badge">Conforme au droit immobilier français</div>
              <h1 className="lp-hero-title">Ne perdez plus jamais une commission à cause d'un délai manqué</h1>
              <p className="lp-hero-sub">
                Du compromis de vente à l'acte définitif : calcul automatique des délais légaux, rappels intelligents et timeline claire. Protégez vos transactions en un clic.
              </p>
              <div className="lp-hero-actions">
                <button className="lp-btn lp-btn-primary" onClick={() => { setDemoMode(true); seedDemoData(); }}>
                  🚀 Essayer la démo gratuite
                </button>
                <button className="lp-btn lp-btn-secondary" onClick={() => { setDemoMode(true); seedDemoData(); }}>
                  Créer mon compte gratuit
                </button>
              </div>
              <div className="lp-hero-trust">
                <span>🔒 Données sécurisées</span>
                <span>⚖️ Conforme RGPD</span>
                <span>🇫🇷 Droit français</span>
              </div>
            </div>
            <div className="lp-hero-visual">
              <div className="lp-timeline-card">
                <div className="lp-timeline-header">📋 Appartement Nice — 420 000 €</div>
                <div className="lp-timeline-step lp-step-past"><div className="lp-step-dot" /> <div><strong>Compromis signé</strong><span>14 mai 2026</span></div> <span className="lp-step-status">✅</span></div>
                <div className="lp-timeline-step lp-step-past"><div className="lp-step-dot" /> <div><strong>Délai rétractation purgé</strong><span>24 mai 2026</span></div> <span className="lp-step-status">✅</span></div>
                <div className="lp-timeline-step lp-step-active"><div className="lp-step-dot lp-pulse" /> <div><strong>Prêt — Condition suspensive</strong><span>Échéance dans 31 jours</span></div> <span className="lp-step-status">🟡</span></div>
                <div className="lp-timeline-step"><div className="lp-step-dot" /> <div><strong>Documents notaire</strong><span>Échéance dans 16 jours</span></div> <span className="lp-step-status">⏳</span></div>
                <div className="lp-timeline-step"><div className="lp-step-dot" /> <div><strong>Signature acte de vente</strong><span>Prévue le 12 août 2026</span></div> <span className="lp-step-status">📅</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── La Douleur ── */}
        <section style={{ padding: '80px 0', background: '#fff' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Les 3 mois les plus stressants de votre métier</h2>
            <p className="lp-section-sub">Entre le compromis et l'acte, des dizaines de délais critiques à surveiller. Un seul oubli peut coûter cher.</p>
            <div className="lp-grid-3">
              <div className="lp-pain-card"><div className="lp-pain-icon">⏰</div><h3>J-10 : Délai de rétractation</h3><p>L'acheteur peut renoncer sans pénalité. Passé ce délai, la vente est ferme — si vous n'avez pas oublié de le surveiller.</p></div>
              <div className="lp-pain-card"><div className="lp-pain-icon">🏦</div><h3>J-45 : Condition suspensive de prêt</h3><p>Le délai le plus dangereux. Si le prêt n'est pas obtenu à temps, la vente tombe — et votre commission avec elle. <strong>20% des agents ont déjà perdu une commission comme ça.</strong></p></div>
              <div className="lp-pain-card"><div className="lp-pain-icon">📄</div><h3>J-30 : Documents notaire</h3><p>Les pièces doivent être chez le notaire avant la signature. Un retard = une signature reportée = un client mécontent.</p></div>
            </div>
          </div>
        </section>

        {/* ── Comment ça marche ── */}
        <section style={{ padding: '80px 0', background: 'var(--emerald-bg)' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Comment ça marche</h2>
            <p className="lp-section-sub">3 secondes pour créer un dossier, 3 mois de tranquillité.</p>
            <div className="lp-grid-4">
              <div className="lp-step-card"><div className="lp-step-num">1</div><h3>Ajoutez un dossier</h3><p>Entrez l'adresse du bien, l'acheteur, le vendeur et le prix. C'est tout.</p></div>
              <div className="lp-step-card"><div className="lp-step-num">2</div><h3>Les délais se calculent seuls</h3><p>Notre moteur basé sur le droit français génère automatiquement le planning complet.</p></div>
              <div className="lp-step-card"><div className="lp-step-num">3</div><h3>Suivez en 1 coup d'œil</h3><p>Tableau de bord, code couleur, rappels automatiques. Vous voyez tout immédiatement.</p></div>
              <div className="lp-step-card"><div className="lp-step-num">4</div><h3>Relancez en 1 clic</h3><p>Email pré-rempli vers l'acheteur, le vendeur ou le notaire. Modèles juridiquement conformes.</p></div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" style={{ padding: '80px 0', background: '#fff' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Fonctionnalités clés</h2>
            <p className="lp-section-sub">Tout ce dont vous avez besoin pour gérer vos transactions sereinement.</p>
            <div className="lp-features-grid">
              <div className="lp-feature-card"><span className="lp-feature-icon">📊</span><h3>Tableau de bord santé</h3><p>Visualisez instantanément l'état de tous vos dossiers : vert (OK), orange (attention), rouge (urgence).</p></div>
              <div className="lp-feature-card"><span className="lp-feature-icon">⏱️</span><h3>Calcul automatique des délais</h3><p>Rétractation 10j, prêt 45j, notaire 30j, signature 90j — tout est calculé depuis la date du compromis.</p></div>
              <div className="lp-feature-card"><span className="lp-feature-icon">🔔</span><h3>Rappels intelligents</h3><p>Notifications automatiques quand un délai approche. Plus besoin de compter les jours sur un calendrier.</p></div>
              <div className="lp-feature-card"><span className="lp-feature-icon">👥</span><h3>Carnet de contacts</h3><p>Acheteurs, vendeurs, notaires — enregistrez leurs coordonnées et reliez-les aux dossiers.</p></div>
              <div className="lp-feature-card"><span className="lp-feature-icon">📧</span><h3>Relance en 1 clic</h3><p>Email pré-rempli avec template professionnel pour relancer acheteur, notaire ou banque.</p></div>
              <div className="lp-feature-card"><span className="lp-feature-icon">📋</span><h3>Résumé exportable</h3><p>Copiez un récapitulatif complet à partager avec votre client ou le notaire en un clic.</p></div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section id="testimonials" style={{ padding: '80px 0', background: '#f8fafc' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Ils utilisent Transaction Suivi</h2>
            <div className="lp-testimonials">
              {testimonialData.map((t, i) => (
                <div key={i} className="lp-testimonial-card">
                  <div className="lp-test-avatar">{t.avatar}</div>
                  <p className="lp-test-text">"{t.text}"</p>
                  <div className="lp-test-author">{t.name}</div>
                  <div className="lp-test-role">{t.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" style={{ padding: '80px 0', background: '#fff' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Tarifs simples et transparents</h2>
            <p className="lp-section-sub">Commencez gratuitement. Pas de carte bancaire requise.</p>
            <div className="lp-pricing">
              <div className="lp-pricing-card">
                <h3>Gratuit</h3>
                <div className="lp-price">0 €<span>/mois</span></div>
                <ul>
                  <li>✅ 1 dossier suivi</li>
                  <li>✅ Calcul automatique des délais</li>
                  <li>✅ Rappels par notification</li>
                  <li>✅ Export de résumé</li>
                </ul>
                <button className="lp-btn lp-btn-outline" onClick={() => { setDemoMode(true); seedDemoData(); }}>Essayer gratuit</button>
              </div>
              <div className="lp-pricing-card lp-pricing-featured">
                <div className="lp-pricing-badge">Populaire</div>
                <h3>Pro</h3>
                <div className="lp-price">19 €<span>/mois</span></div>
                <ul>
                  <li>✅ Dossiers illimités</li>
                  <li>✅ Rappels email automatiques</li>
                  <li>✅ Templates de relance juridiques</li>
                  <li>✅ Export PDF</li>
                  <li>✅ Support prioritaire</li>
                </ul>
                <button className="lp-btn lp-btn-primary" onClick={() => { setDemoMode(true); seedDemoData(); }}>Commencer</button>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" style={{ padding: '80px 0', background: '#f8fafc' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Questions fréquentes</h2>
            <div className="lp-faq">
              {faqData.map((item, i) => (
                <div key={i} className={`lp-faq-item ${showFaq === i ? 'lp-faq-open' : ''}`}>
                  <button className="lp-faq-q" onClick={() => setShowFaq(showFaq === i ? null : i)}>
                    {item.q} <span>{showFaq === i ? '−' : '+'}</span>
                  </button>
                  {showFaq === i && <div className="lp-faq-a">{item.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section style={{ padding: '80px 0', background: 'var(--navy)', color: '#fff', textAlign: 'center' }}>
          <div className="lp-container">
            <h2 style={{ fontSize: '2.2rem', margin: '0 0 16px' }}>Prêt à sécuriser vos commissions ?</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 auto 32px', fontSize: '1.1rem' }}>Rejoignez les agents qui ne laissent plus rien au hasard.</p>
            <div className="lp-hero-actions" style={{ justifyContent: 'center' }}>
              <button className="lp-btn lp-btn-primary" style={{ background: 'var(--emerald)', borderColor: 'var(--emerald)', fontSize: '1.15rem', padding: '16px 40px' }} onClick={() => { setDemoMode(true); seedDemoData(); }}>
                🚀 Essayer la démo gratuite
              </button>
            </div>
            <div className="lp-hero-trust" style={{ justifyContent: 'center', marginTop: 24 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>🔒 Données sécurisées et chiffrées</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>⚖️ Conforme RGPD et droit français</span>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <div style={{ padding: '32px 0', background: '#0a1a2e', color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: '0.85rem' }}>
          <div className="lp-container">Transaction Suivi © 2026 — Construit pour les agents immobiliers par des agents immobiliers. 🇫🇷</div>
        </div>
      </div>
    );
  }

  // ── MAIN APP ──
  return (
    <div className="page-shell">
      <header>
        <h1>🏡 Transaction Suivi</h1>
        <p>Gérez vos transactions immobilières avec vos contacts et vos rappels.</p>
        <div className="user-toolbar">
          {user ? <span>Connecté en tant que {user?.email}</span> : demoMode ? <span className="badge-warning" style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.85rem', fontWeight: 700 }}>⚡ Mode démo</span> : null}
          <button type="button" className="secondary" onClick={logout} disabled={loading}>Quitter la démo</button>
        </div>
        {loading && <div className="notification">Chargement...</div>}
        {notification && <div className={`notification ${notification.type === 'error' ? 'notification-error' : ''}`}>{notification.message}</div>}
      </header>

      {!hasRealData && (
        <section className="card demo-card">
          <div className="demo-banner">
            <div><h2>👋 Bienvenue sur Transaction Suivi</h2><p>Essayez l'application avec des données exemple — aucune inscription nécessaire.</p></div>
            <button className="demo-button" onClick={seedDemoData}>Charger la démo</button>
          </div>
          <p className="demo-note">⚠️ Les données de démo disparaîtront après rafraîchissement. Créez un compte pour sauvegarder vos vrais dossiers.</p>
        </section>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p>Êtes-vous sûr de vouloir supprimer ce {deleteConfirm.type === 'deal' ? 'dossier' : 'contact'} ? Cette action est irréversible.</p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={cancelDelete}>Annuler</button>
              <button type="button" className="danger" onClick={confirmDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <section className="card quick-add-card">
        <div className="quick-add-header"><h2>⚡ Ajout rapide</h2><span className="quick-add-hint">Bien, acheteur, vendeur — le nécessaire. Modifiez les détails après.</span></div>
        <div className="quick-add-fields">
          <input value={quickData.property} onChange={(e) => setQuickData({ ...quickData, property: e.target.value })} placeholder="Adresse du bien" />
          <input value={quickData.buyer} onChange={(e) => setQuickData({ ...quickData, buyer: e.target.value })} placeholder="Nom de l'acheteur" />
          <input value={quickData.seller} onChange={(e) => setQuickData({ ...quickData, seller: e.target.value })} placeholder="Nom du vendeur" />
          <input type="number" min="0" value={quickData.price === 0 ? 0 : quickData.price || ''} onChange={(e) => setQuickData({ ...quickData, price: Number(e.target.value) })} placeholder="Prix (€)" />
          <button type="button" onClick={saveQuickDeal} disabled={loading || !quickData.property.trim() || !quickData.buyer.trim() || !quickData.seller.trim()}>+ Ajouter</button>
        </div>
      </section>

      {filteredTransactions.length > 0 && (
        <section className="card health-banner">
          <div className="health-bar">
            <div className="health-item health-good" style={{ flex: stats.active + stats.completed }}><strong>{stats.active + stats.completed}</strong> en ordre</div>
            <div className="health-item health-warning" style={{ flex: stats.closingSoon }}><strong>{stats.closingSoon}</strong> signature proche</div>
            {stats.atRisk > 0 && <div className="health-item health-critical" style={{ flex: stats.atRisk, animation: 'pulse 2s infinite' }}>⚠️ <strong>{stats.atRisk}</strong> urgent !</div>}
          </div>
        </section>
      )}

      <section className="card dashboard-card">
        <div className="dashboard-header">
          <div><h2>Tableau de bord</h2></div>
          <div className="dashboard-controls">
            <input className="search-input" type="text" placeholder="🔍 Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="filter-buttons">
              {(['all', 'active', 'at risk', 'closing soon', 'completed'] as DealStatus[]).map((status) => (
                <button key={status} className={filter === status ? 'filter-button active' : 'filter-button'} type="button" onClick={() => setFilter(status)}>
                  {status === 'all' ? 'Tous' : status === 'active' ? 'Actif' : status === 'at risk' ? 'Urgent' : status === 'closing soon' ? 'Signature' : 'Terminé'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="deal-table">
            <thead><tr><th>Bien</th><th>Santé</th><th>Prêt</th><th>Docs</th><th>Notaire</th><th>Signature</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="empty-row"><div className="empty-state"><strong>{searchQuery || filter !== 'all' ? 'Aucun résultat' : 'Pas encore de dossiers'}</strong><span>{searchQuery || filter !== 'all' ? 'Essayez une autre recherche.' : 'Ajoutez votre premier dossier ci-dessus.'}</span></div></td></tr>
              ) : (
                filteredTransactions.map((item) => {
                  const status = getDealStatus(item);
                  const itemMilestones = buildMilestones(item);
                  const riskStatus = determineRisk(item);
                  const setField = (field: keyof Transaction, value: any) => {
                    const updated = { ...item, [field]: value };
                    setTransactions((current) => current.map((t) => t.id === item.id ? updated : t));
                    if (selectedDealId === item.id) setTransaction(updated);
                  };
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.property}</td>
                      <td>
                        <span className={`status-pill ${statusLabelClass(status)}`}>{status === 'active' ? 'OK' : status === 'at risk' ? 'Urgent' : status === 'closing soon' ? 'Bientôt' : 'Fait'}</span>
                        {riskStatus === 'at risk' && <span className="status-pill badge-danger" style={{ display: 'block', marginTop: 4 }}>⚠️ Urgent</span>}
                      </td>
                      <td><select className="inline-select" value={item.loanStatus} onChange={(e) => setField('loanStatus', e.target.value)}><option value="pending">⏳ En cours</option><option value="approved">✅ OK</option><option value="refused">❌ Refusé</option></select></td>
                      <td><select className="inline-select" value={item.documentStatus} onChange={(e) => setField('documentStatus', e.target.value)}><option value="missing">❌ Manquant</option><option value="complete">✅ OK</option></select></td>
                      <td><select className="inline-select" value={item.notaireStatus} onChange={(e) => setField('notaireStatus', e.target.value)}><option value="not ready">⏳ Pas prêt</option><option value="ready">✅ Prêt</option></select></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{itemMilestones.saleDate}<br /><small style={{ color: '#6b7685' }}>Compromis: {item.compromisDate}</small></td>
                      <td><button type="button" className="tiny-button" onClick={() => selectTransaction(item.id)}>Éditer</button><button type="button" className="tiny-button danger" onClick={() => requestDeleteDeal(item.id)}>Suppr</button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card form-card">
        <div className="split-row">
          <div><h2>{selectedDealId ? 'Modifier le dossier' : 'Nouveau dossier'}</h2><p>Statuts, dates et contacts liés.</p></div>
          <div className="form-actions">
            <button type="button" onClick={resetDealForm} className="secondary">Nouveau dossier</button>
            {selectedDealId && <button type="button" className="secondary" onClick={cancelDealEdit}>Annuler</button>}
            <button type="button" onClick={saveTransaction}>{selectedDealId ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </div>
        {!selectedDealId && <p className="empty-state" style={{ marginTop: 12, textAlign: 'left', padding: 0 }}>Sélectionnez un dossier ou remplissez les champs ci-dessous.</p>}
        {(!selectedDealId || transaction.property || transaction.buyer || transaction.seller) && (
          <div className="field-grid">
            <label>Bien<input value={transaction.property} onChange={(e) => handleChange('property', e.target.value)} placeholder="Adresse" /></label>
            <label>Contact acheteur<select value={transaction.buyerId || ''} onChange={(e) => selectContactForTransaction('buyerId', e.target.value)}><option value="">Choisir</option>{contactOptions('buyer').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom acheteur<input value={transaction.buyer} onChange={(e) => handleChange('buyer', e.target.value)} placeholder="Acheteur" /></label>
            <label>Contact vendeur<select value={transaction.sellerId || ''} onChange={(e) => selectContactForTransaction('sellerId', e.target.value)}><option value="">Choisir</option>{contactOptions('seller').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom vendeur<input value={transaction.seller} onChange={(e) => handleChange('seller', e.target.value)} placeholder="Vendeur" /></label>
            <label>Date du compromis<input type="date" value={transaction.compromisDate} onChange={(e) => handleChange('compromisDate', e.target.value)} /></label>
            <label>Contact notaire<select value={transaction.notaireId || ''} onChange={(e) => selectContactForTransaction('notaireId', e.target.value)}><option value="">Choisir</option>{contactOptions('notaire').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom notaire<input value={transaction.notaire} onChange={(e) => handleChange('notaire', e.target.value)} placeholder="Notaire" /></label>
            <label>Prix (€)<input type="number" min="0" value={transaction.price} onChange={(e) => handleChange('price', Number(e.target.value))} /></label>
            <label>Prêt<select value={transaction.loanStatus} onChange={(e) => handleChange('loanStatus', e.target.value as LoanStatus)}><option value="pending">En cours</option><option value="approved">Accepté</option><option value="refused">Refusé</option></select></label>
            <label>Documents<select value={transaction.documentStatus} onChange={(e) => handleChange('documentStatus', e.target.value as DocumentStatus)}><option value="missing">Manquants</option><option value="complete">Complets</option></select></label>
            <label>Notaire<select value={transaction.notaireStatus} onChange={(e) => handleChange('notaireStatus', e.target.value as NotaireStatus)}><option value="not ready">Pas prêt</option><option value="ready">Prêt</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={transaction.completed} onChange={(e) => handleChange('completed', e.target.checked)} /> Vente finalisée</label>
          </div>
        )}
      </section>

      <section className="card overview-card">
        <div className="split-row">
          <div><h2>Calendrier</h2><ul className="timeline-list"><li><strong>Fin rétractation</strong><span>{milestones.withdrawalDeadline}</span></li><li><strong>Condition suspensive prêt</strong><span>{milestones.loanApprovalDeadline}</span></li><li><strong>Documents notaire</strong><span>{milestones.documentDeadline}</span></li><li><strong>Signature acte</strong><span>{milestones.saleDate}</span></li></ul></div>
          <div><h2>Statut</h2><div className="status-grid"><div><strong>Prêt</strong>{statusBadge(transaction.loanStatus)}</div><div><strong>Documents</strong>{statusBadge(transaction.documentStatus)}</div><div><strong>Notaire</strong>{statusBadge(transaction.notaireStatus)}</div><div><strong>Global</strong>{statusBadge(risk)}</div></div></div>
        </div>
      </section>

      <section className="card reminders-card">
        <h2>Rappels automatiques</h2>
        <ul>{reminders.length === 0 ? <li style={{ listStyle: 'none', color: '#6b7685' }}>Aucun rappel pour ce dossier.</li> : reminders.map((r, idx) => <li key={`rm-${idx}`}>{r}</li>)}</ul>
      </section>

      <section className="card scheduled-reminders-card">
        <h2>Rappels programmés</h2>
        {dueReminders.length === 0 ? <p>Aucun rappel pour le moment.</p> : (
          <div className="reminder-list">{dueReminders.map((reminder) => (
            <div key={`${reminder.transactionId}-${reminder.message}`} className="reminder-item">
              <div className="reminder-text"><strong>{reminder.property}</strong><div>{reminder.message}</div><small>Échéance {reminder.dueDate} ({reminder.dueInDays} jour(s))</small><small>Contact: {reminder.contactName || reminder.contactRole} {reminder.contactEmail ? `(${reminder.contactEmail})` : ''}</small></div>
              <div className="reminder-actions"><button type="button" onClick={() => sendReminderEmail(reminder)}>📧 Relancer</button><button type="button" className="secondary" onClick={() => sendBrowserNotification(reminder)}>🔔 Alerte</button></div>
            </div>
          ))}</div>
        )}
      </section>

      <section className="card form-card">
        <div className="split-row">
          <div><h2>{selectedContactId ? 'Modifier contact' : 'Nouveau contact'}</h2><p>Enregistrez vos contacts et liez-les aux dossiers.</p></div>
          <div className="form-actions">
            <button type="button" onClick={resetContactForm} className="secondary">Nouveau contact</button>
            {selectedContactId && <button type="button" className="secondary" onClick={cancelContactEdit}>Annuler</button>}
            <button type="button" onClick={saveContactForm}>{selectedContactId ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </div>
        <div className="field-grid">
          <label>Nom<input value={contactForm.name} onChange={(e) => handleContactChange('name', e.target.value)} placeholder="Nom" /></label>
          <label>Rôle<select value={contactForm.role} onChange={(e) => handleContactChange('role', e.target.value as ContactRole)}><option value="buyer">Acheteur</option><option value="seller">Vendeur</option><option value="notaire">Notaire</option><option value="other">Autre</option></select></label>
          <label>Email<input type="email" value={contactForm.email} onChange={(e) => handleContactChange('email', e.target.value)} placeholder="Email" /></label>
          <label>Téléphone<input value={contactForm.phone} onChange={(e) => handleContactChange('phone', e.target.value)} placeholder="Téléphone" /></label>
        </div>
      </section>

      <section className="card" style={{ paddingBottom: 0 }}>
        <h2>Contacts</h2>
        <div className="table-wrap">
          <table className="deal-table">
            <thead><tr><th>Nom</th><th>Rôle</th><th>Email</th><th>Téléphone</th><th>Actions</th></tr></thead>
            <tbody>{contacts.length === 0 ? <tr><td colSpan={5} className="empty-row"><div className="empty-state"><strong>Pas encore de contacts</strong><span>Ajoutez votre premier contact ci-dessus.</span></div></td></tr> : contacts.map((contact) => (
              <tr key={contact.id}><td>{contact.name}</td><td>{roleLabel(contact.role)}</td><td>{contact.email || '-'}</td><td>{contact.phone || '-'}</td><td><button type="button" className="tiny-button" onClick={() => selectContact(contact.id)}>Éditer</button><button type="button" className="tiny-button danger" onClick={() => requestDeleteContact(contact.id)}>Suppr</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card export-card"><h2>Export</h2><p>Copiez un résumé pour votre client ou notaire.</p><button onClick={copySummary}>📋 Copier le résumé</button></section>
    </div>
  );
}

export default App;