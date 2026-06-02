import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
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

// ── Demo data — scénario immobilier réaliste ──
const demoTransactions: Transaction[] = [
  {
    id: 'demo-1',
    property: 'Appartement T3 — 12 rue de la République, Lyon 6e',
    buyer: 'Camille Dubois',
    seller: 'Marc Lefevre',
    compromisDate: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Philippe Garnier',
    price: 420000,
    loanStatus: 'approved',
    documentStatus: 'complete',
    notaireStatus: 'ready',
    completed: false
  },
  {
    id: 'demo-2',
    property: 'Maison 4 pièces — Allée des Tilleuls, Marseille 8e',
    buyer: 'Thomas Rivière',
    seller: 'Sophie Mercier',
    compromisDate: new Date(Date.now() - 38 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Audrey Fontaine',
    price: 585000,
    loanStatus: 'pending',
    documentStatus: 'missing',
    notaireStatus: 'not ready',
    completed: false
  },
  {
    id: 'demo-3',
    property: 'Studio — 8 rue du Faubourg, Paris 11e',
    buyer: 'Lucas Martin',
    seller: 'Isabelle Laurent',
    compromisDate: new Date(Date.now() - 55 * 86400000).toISOString().slice(0, 10),
    notaire: 'Me. Claire Dubois',
    price: 275000,
    loanStatus: 'refused',
    documentStatus: 'missing',
    notaireStatus: 'not ready',
    completed: false
  }
];
const demoContacts: Contact[] = [
  { id: 'demo-c1', name: 'Camille Dubois', role: 'buyer', email: 'camille.dubois@email.fr', phone: '06 23 45 67 89' },
  { id: 'demo-c2', name: 'Sophie Mercier', role: 'seller', email: 'sophie.mercier@email.fr', phone: '06 98 76 54 32' },
  { id: 'demo-c3', name: 'Me. Philippe Garnier', role: 'notaire', email: 'pgarnier@notaires.fr', phone: '04 78 42 18 00' },
  { id: 'demo-c4', name: 'Thomas Rivière', role: 'buyer', email: 'thomas.riviere@email.fr', phone: '06 12 34 56 78' },
  { id: 'demo-c5', name: 'Me. Audrey Fontaine', role: 'notaire', email: 'afontaine@notaires.fr', phone: '04 93 85 12 00' }
];

// ── Story-driven demo steps ──
type DemoStep = {
  id: number;
  title: string;
  description: string;
  status: 'done' | 'active' | 'upcoming';
  icon: string;
  detail: string;
};

const demoStorySteps: DemoStep[] = [
  { id: 1, title: 'Compromis de vente signé', description: 'Le compromis est signé entre M. Lefevre (vendeur) et Mme Dubois (acheteuse) pour l\'appartement de Lyon 6e — 420 000 €.', status: 'done', icon: '✍️', detail: '14 mai 2026 — Toutes les conditions suspensives sont mentionnées.' },
  { id: 2, title: 'Délai de rétractation purgé', description: 'Les 10 jours de rétractation SRU sont écoulés. L\'acheteuse ne s\'est pas rétractée.', status: 'done', icon: '✅', detail: '24 mai 2026 — Le dossier est sécurisé juridiquement.' },
  { id: 3, title: 'Financement bancaire', description: 'L\'acheteuse a obtenu son accord de principe. La banque a émis l\'offre de prêt.', status: 'done', icon: '🏦', detail: '5 juin 2026 — Prêt accepté : 380 000 € sur 20 ans.' },
  { id: 4, title: 'Documents notaire', description: 'Le notaire Me Garnier a reçu toutes les pièces : diagnostics, titre de propriété, PV d\'AG.', status: 'done', icon: '📄', detail: '10 juin 2026 — Dossier complet chez le notaire.' },
  { id: 5, title: 'Signature de l\'acte authentique', description: 'La signature est programmée en l\'étude de Me Garnier.', status: 'active', icon: '🏠', detail: 'Prévue le 12 août 2026 — J-72 avant la signature.' },
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
  const [showFaq, setShowFaq] = useState<number | null>(null);
  const [demoStoryStep, setDemoStoryStep] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'dossiers' | 'contacts' | 'alertes'>('overview');

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
  const generatePDF = () => {
    if (!transaction.property) { notify('Sélectionnez un dossier avec un bien pour générer le PDF.', 'error'); return; }
    try {
      const doc = new jsPDF();
      const mils = buildMilestones(transaction);
      doc.setFontSize(18); doc.text('Suivi Vente Immo — Timeline', 20, 30);
      doc.setFontSize(12); doc.text(`Bien: ${transaction.property}`, 20, 45);
      doc.text(`Prix: ${transaction.price.toLocaleString()} €`, 20, 53);
      doc.text(`Acheteur: ${transaction.buyer}`, 20, 61);
      doc.text(`Vendeur: ${transaction.seller}`, 20, 69);
      doc.setFontSize(14); doc.text('Échéances légales', 20, 85);
      doc.setFontSize(11);
      const items = [
        ['Compromis signé', transaction.compromisDate, '✅'],
        ['Délai de rétractation (J+10)', mils.withdrawalDeadline, '✅'],
        ['Documents notaire (J+30)', mils.documentDeadline, '📄'],
        ['Condition suspensive prêt (J+45)', mils.loanApprovalDeadline, '🏦'],
        ['Signature acte de vente (J+90)', mils.saleDate, '📅'],
      ];
      items.forEach(([label, date, icon], i) => {
        doc.text(`${icon} ${label}: ${date}`, 20, 97 + i * 10);
      });
      doc.setFontSize(10); doc.text('Généré par Suivi Vente Immo — Conforme au droit immobilier français', 20, 170);
      doc.save(`timeline-${transaction.property.slice(0, 15).replace(/\s/g, '_')}.pdf`);
      notify('📄 PDF de la timeline téléchargé !', 'success');
    } catch (e) {
      notify('Erreur lors de la génération du PDF.', 'error');
    }
  };

  const contactOptions = (role: ContactRole) => contacts.filter((item) => item.role === role || item.role === 'other');

  const seedDemoData = () => {
    setTransactions(demoTransactions); setContacts(demoContacts);
    resetDealForm(); resetContactForm(); setFilter('all'); setSearchQuery(''); setNotification(null);
    selectTransaction(demoTransactions[0].id);
    notify('Données de démo chargées ! ⚠️ Elles disparaîtront après rafraîchissement.', 'success');
  };

  const hasRealData = (user && (transactions.length > 0 || contacts.length > 0)) || demoMode;

  // ── LANDING PAGE ──
  if (!user && !demoMode) {
    return (
      <div className="lp">
        <div className="lp-nav">
          <div className="lp-nav-inner">
            <span className="lp-logo">🏠 Suivi Vente Immo</span>
            <button className="lp-nav-login" onClick={() => { setDemoMode(true); seedDemoData(); }}>Connexion</button>
          </div>
        </div>

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-bg" />
          <div className="lp-container">
            <div className="lp-hero-content">
              <div className="lp-hero-badge">Outil métier pour agents immobiliers</div>
              <h1 className="lp-hero-title">Ne perdez plus aucun dossier de vente entre le compromis et l'acte authentique</h1>
              <p className="lp-hero-sub">
                Suivi des ventes immobilières dédié aux agents : chaque étape du compromis à l'acte authentique est tracée, chaque délai est surveillé. Zéro dossier oublié.
              </p>
              <div className="lp-hero-actions">
                <button className="lp-btn lp-btn-primary" onClick={() => { setDemoMode(true); seedDemoData(); }}>
                  🚀 Tester la démo
                </button>
              </div>
              <div className="lp-hero-trust">
                <span>🔒 Conforme RGPD</span>
                <span>🏠 100% immobilier</span>
                <span>🇫🇷 Droit français intégré</span>
              </div>
            </div>
            <div className="lp-mockup">
              <div className="lp-mockup-card">
                <div className="lp-mockup-header">
                  <h3>🏠 Appartement T3 — Lyon 6e — 420 000 €</h3>
                  <span>En cours</span>
                </div>
                <div className="lp-mockup-timeline">
                  <div className="lp-mockup-step past"><div className="lp-mockup-dot" /> <div><strong>Compromis signé</strong><span>14 mai 2026</span></div> <span>✅</span></div>
                  <div className="lp-mockup-step past"><div className="lp-mockup-dot" /> <div><strong>Délai rétractation purgé</strong><span>24 mai 2026</span></div> <span>✅</span></div>
                  <div className="lp-mockup-step past"><div className="lp-mockup-dot" /> <div><strong>Prêt accepté</strong><span>5 juin 2026</span></div> <span>✅</span></div>
                  <div className="lp-mockup-step active"><div className="lp-mockup-dot lp-mockup-pulse" /> <div><strong>Documents notaire</strong><span>Dossier complet</span></div> <span>📄</span></div>
                  <div className="lp-mockup-step"><div className="lp-mockup-dot" /> <div><strong>Signature acte authentique</strong><span>Prévue le 12 août 2026</span></div> <span>📅</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PROBLÈME ── */}
        <section className="lp-section lp-section-white">
          <div className="lp-container">
            <h2 className="lp-section-title">Vos dossiers de vente vous échappent-ils ?</h2>
            <p className="lp-section-sub">Entre le compromis et l'acte authentique, des dizaines de détails à suivre. Un seul oubli peut tout faire capoter.</p>
            <div className="lp-grid-4">
              <div className="lp-pain-card"><span className="lp-pain-icon">📁</span><h3>Dossiers éparpillés</h3><p>Notes sur papier, emails oubliés, suivi Excel. Difficile de s'y retrouver avec plusieurs ventes en parallèle.</p></div>
              <div className="lp-pain-card"><span className="lp-pain-icon">👁️‍🗨️</span><h3>Manque de visibilité</h3><p>Pas de vue globale sur l'avancement de vos ventes. Vous découvrez les problèmes trop tard.</p></div>
              <div className="lp-pain-card"><span className="lp-pain-icon">📊</span><h3>Suivi Excel / notes dispersées</h3><p>Un tableur partagé, des post-it, des relances oubliées. Votre organisation ne suit plus.</p></div>
              <div className="lp-pain-card"><span className="lp-pain-icon">⏰</span><h3>Retards non détectés</h3><p>Un financement qui traîne, un notaire qui ne répond pas — si vous ne le voyez pas à temps, la vente s'effondre.</p></div>
            </div>
          </div>
        </section>

        {/* ── AVANT vs APRÈS ── */}
        <section className="lp-section lp-section-alt">
          <div className="lp-container">
            <h2 className="lp-section-title">Avant vs Après</h2>
            <p className="lp-section-sub">Comment les agents immobiliers passent du chaos à la maîtrise.</p>
            <div className="lp-comparison">
              <div className="lp-comparison-card lp-comparison-before">
                <div className="lp-comparison-label">❌ Avant — Sans outil</div>
                <ul>
                  <li>Fichier Excel avec 15 onglets</li>
                  <li>Relances notaire oubliées</li>
                  <li>Délais de prêt dépassés sans alerte</li>
                  <li>Aucune visibilité sur les dossiers bloqués</li>
                  <li>Dossiers perdus entre agent, notaire et acheteur</li>
                </ul>
              </div>
              <div className="lp-comparison-card lp-comparison-after">
                <div className="lp-comparison-label">✅ Après — Avec Suivi Vente Immo</div>
                <ul>
                  <li>Tous les dossiers centralisés en un endroit</li>
                  <li>Chaque étape du compromis à l'acte est tracée</li>
                  <li>Alertes automatiques sur les délais critiques</li>
                  <li>Vue d'ensemble en temps réel</li>
                  <li>Zéro dossier oublié, zéro retard non détecté</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOLUTION ── */}
        <section className="lp-section lp-section-white">
          <div className="lp-container">
            <h2 className="lp-section-title">La solution pour les agents immobiliers</h2>
            <p className="lp-section-sub">Centralisation, visibilité et suivi de chaque dossier de vente.</p>
            <div className="lp-solution-list">
              <div className="lp-solution-item">
                <span className="lp-solution-icon">📋</span>
                <div>
                  <h3>Centralisation des dossiers de vente</h3>
                  <p>Un seul endroit pour tous vos dossiers : bien, acheteur, vendeur, notaire, prix, étapes. Fini les fichiers éparpillés.</p>
                </div>
              </div>
              <div className="lp-solution-item">
                <span className="lp-solution-icon">🔍</span>
                <div>
                  <h3>Visibilité sur chaque étape du cycle immobilier</h3>
                  <p>Compromis, rétractation, financement, documents notaire, acte authentique — chaque étape est visible et datée.</p>
                </div>
              </div>
              <div className="lp-solution-item">
                <span className="lp-solution-icon">🔔</span>
                <div>
                  <h3>Réduction des oublis entre compromis et acte</h3>
                  <p>Alertes automatiques sur les dossiers en retard, les délais qui approchent et les actions à mener.</p>
                </div>
              </div>
              <div className="lp-solution-item">
                <span className="lp-solution-icon">📊</span>
                <div>
                  <h3>Vue d'ensemble de votre portefeuille</h3>
                  <p>En un coup d'œil : combien de dossiers en cours, lesquels sont bloqués, lesquels arrivent à signature.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── COMMENT ÇA MARCHE ── */}
        <section className="lp-section" style={{ background: 'var(--emerald-bg)' }}>
          <div className="lp-container">
            <h2 className="lp-section-title">Comment ça marche</h2>
            <p className="lp-section-sub">3 étapes pour suivre toutes vos ventes immobilières.</p>
            <div className="lp-grid-3">
              <div className="lp-step-card"><div className="lp-step-num">1</div><h3>Créer un dossier de vente</h3><p>Renseignez le bien immobilier, l'acheteur, le vendeur et la date du compromis. Le suivi démarre immédiatement.</p></div>
              <div className="lp-step-card"><div className="lp-step-num">2</div><h3>Suivre les étapes</h3><p>Compromis → financement → notaire → acte authentique. Chaque étape est tracée avec ses échéances légales.</p></div>
              <div className="lp-step-card"><div className="lp-step-num">3</div><h3>Visualiser l'état global</h3><p>Vue d'ensemble de toutes vos ventes en temps réel avec alertes sur les dossiers bloqués ou en retard.</p></div>
            </div>
          </div>
        </section>

        {/* ── FONCTIONNALITÉS ── */}
        <section id="features" className="lp-section lp-section-white">
          <div className="lp-container">
            <h2 className="lp-section-title">Fonctionnalités conçues pour l'immobilier</h2>
            <p className="lp-section-sub">Pas de gadget. Uniquement ce dont un agent immobilier a besoin.</p>
            <div className="lp-features-grid">
              <div className="lp-feature-card">
                <span className="lp-feature-icon">🔄</span>
                <h3>Suivi du cycle de vente immobilier</h3>
                <p>Chaque dossier suit son propre cycle : compromis, rétractation, financement, notaire, signature de l'acte.</p>
              </div>
              <div className="lp-feature-card">
                <span className="lp-feature-icon">📅</span>
                <h3>Timeline des étapes d'un dossier</h3>
                <p>Visualisez la chronologie complète de chaque vente avec les dates clés et les échéances légales.</p>
              </div>
              <div className="lp-feature-card">
                <span className="lp-feature-icon">🚦</span>
                <h3>Statut des transactions</h3>
                <p>En cours, bloqué, à risque, signé — l'état de chaque dossier en un coup d'œil.</p>
              </div>
              <div className="lp-feature-card">
                <span className="lp-feature-icon">⚠️</span>
                <h3>Alertes sur dossiers en retard</h3>
                <p>Notifications sur les dossiers inactifs, les délais dépassés et les actions urgentes à mener.</p>
              </div>
              <div className="lp-feature-card">
                <span className="lp-feature-icon">📄</span>
                <h3>Export / résumé pour notaire ou client</h3>
                <p>Générez un résumé complet du dossier à partager avec le notaire ou votre client en un clic.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── DÉMO SCÉNARIO ── */}
        <section className="lp-section lp-section-alt">
          <div className="lp-container">
            <h2 className="lp-section-title">Voyez comment ça fonctionne</h2>
            <p className="lp-section-sub">Scénario réel : suivez la vente d'un appartement de Lyon, du compromis à l'acte authentique.</p>
            <div className="lp-demo-story">
              <div className="lp-demo-story-header">
                <div className="lp-demo-story-property">
                  <span className="lp-demo-story-icon">🏠</span>
                  <div>
                    <strong>Appartement T3 — 12 rue de la République, Lyon 6e</strong>
                    <span>Vendeur : M. Lefevre → Acheteuse : Mme Dubois — 420 000 €</span>
                  </div>
                </div>
              </div>
              <div className="lp-demo-steps">
                {demoStorySteps.map((step, i) => (
                  <div key={step.id} className={`lp-demo-step lp-demo-step-${step.status}`} onClick={() => setDemoStoryStep(i)}>
                    <div className="lp-demo-step-marker">
                      <div className="lp-demo-step-dot">{step.icon}</div>
                      {i < demoStorySteps.length - 1 && <div className="lp-demo-step-line" />}
                    </div>
                    <div className="lp-demo-step-content">
                      <div className="lp-demo-step-title">{step.title}</div>
                      <div className="lp-demo-step-desc">{step.description}</div>
                      <div className="lp-demo-step-detail">{step.detail}</div>
                      {step.status === 'active' && <div className="lp-demo-step-badge">⏳ Étape en cours</div>}
                      {step.status === 'done' && <div className="lp-demo-step-badge lp-demo-step-badge-done">✅ Terminé</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="lp-demo-story-cta">
                <button className="lp-btn lp-btn-primary" onClick={() => { setDemoMode(true); seedDemoData(); }}>
                  🚀 Tester avec vos propres dossiers
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF (mock data) ── */}
        <section id="testimonials" className="lp-section lp-section-white">
          <div className="lp-container">
            <h2 className="lp-section-title">Résultats constatés</h2>
            <div className="lp-stats-row">
              <div className="lp-stat-card">
                <div className="lp-stat-number">+X</div>
                <div className="lp-stat-label">agences utilisent déjà le suivi</div>
                <div className="lp-stat-mock">donnée mock — en cours de collecte</div>
              </div>
              <div className="lp-stat-card">
                <div className="lp-stat-number">−X%</div>
                <div className="lp-stat-label">de dossiers oubliés entre compromis et acte</div>
                <div className="lp-stat-mock">donnée mock — estimation interne</div>
              </div>
              <div className="lp-stat-card">
                <div className="lp-stat-number">X min</div>
                <div className="lp-stat-label">pour créer un dossier de vente complet</div>
                <div className="lp-stat-mock">donnée mock — estimation interne</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="lp-section lp-section-alt">
          <div className="lp-container">
            <h2 className="lp-section-title">Tarifs simples et transparents</h2>
            <p className="lp-section-sub">Commencez gratuitement. Pas de carte bancaire requise.</p>
            <div className="lp-pricing">
              <div className="lp-pricing-card">
                <h3>Gratuit</h3>
                <div className="lp-price">0 €<span>/mois</span></div>
                <ul>
                  <li>✅ 1 dossier de vente suivi</li>
                  <li>✅ Calcul automatique des délais légaux</li>
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
        <section id="faq" className="lp-section lp-section-white">
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

        {/* ── FINAL CTA ── */}
        <section className="lp-final-cta">
          <div className="lp-container">
            <h2 className="lp-final-title">Meilleure visibilité sur vos ventes. Moins de dossiers perdus.</h2>
            <p className="lp-final-sub">Suivi simple de chaque dossier, du compromis de vente à l'acte authentique. Rejoignez les agents qui ne laissent plus rien au hasard.</p>
            <div className="lp-hero-actions" style={{ justifyContent: 'center' }}>
              <button className="lp-btn lp-btn-primary lp-btn-large" onClick={() => { setDemoMode(true); seedDemoData(); }}>
                🚀 Essayer la démo gratuite
              </button>
            </div>
            <div className="lp-final-benefits">
              <span>✅ Meilleure visibilité sur les ventes</span>
              <span>✅ Moins de dossiers perdus</span>
              <span>✅ Suivi simple du compromis à l'acte</span>
            </div>
            <div className="lp-hero-trust" style={{ justifyContent: 'center', marginTop: 24 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>🔒 Données sécurisées et chiffrées</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>⚖️ Conforme RGPD et droit français</span>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <div className="lp-footer">
          <div className="lp-container">Suivi Vente Immo © 2026 — L'outil de suivi des dossiers de vente pour les agents immobiliers. 🇫🇷</div>
        </div>
      </div>
    );
  }

  // ── MAIN APP (Dashboard with Sidebar) ──
  const pageTitle = activeTab === 'overview' ? 'Vue d\'ensemble' : activeTab === 'dossiers' ? 'Mes Dossiers' : activeTab === 'contacts' ? 'Contacts' : 'Échéances & Alertes';

  const renderOverview = () => (
    <>
      {/* ── Story-driven demo walkthrough ── */}
      {demoMode && !user && (
        <section className="card story-card">
          <div className="story-header">
            <h2>📖 Scénario : Vente d'un appartement à Lyon</h2>
            <p>Suivez le cycle complet d'une vente immobilière, du compromis à l'acte authentique.</p>
          </div>
          <div className="story-property-bar">
            <span className="story-property-icon">🏠</span>
            <div>
              <strong>Appartement T3 — 12 rue de la République, Lyon 6e</strong>
              <span>Vendeur : M. Lefevre → Acheteuse : Mme Dubois — 420 000 € — Notaire : Me Garnier</span>
            </div>
          </div>
          <div className="story-timeline">
            {demoStorySteps.map((step, i) => (
              <div
                key={step.id}
                className={`story-step story-step-${step.status} ${demoStoryStep === i ? 'story-step-selected' : ''}`}
                onClick={() => setDemoStoryStep(i)}
              >
                <div className="story-step-marker">
                  <div className="story-step-dot">{step.icon}</div>
                  {i < demoStorySteps.length - 1 && <div className="story-step-line" />}
                </div>
                <div className="story-step-body">
                  <div className="story-step-title">{step.title}</div>
                  <div className="story-step-detail">{step.detail}</div>
                  {step.status === 'active' && <span className="story-step-tag story-tag-active">⏳ En cours</span>}
                  {step.status === 'done' && <span className="story-step-tag story-tag-done">✅ Terminé</span>}
                  {step.status === 'upcoming' && <span className="story-step-tag story-tag-upcoming">À venir</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Quick Stats ── */}
      {filteredTransactions.length > 0 && (
        <section className="card health-banner">
          <div className="health-bar">
            <div className="health-item health-good" style={{ flex: stats.active + stats.completed }}><strong>{stats.active + stats.completed}</strong> en ordre</div>
            <div className="health-item health-warning" style={{ flex: stats.closingSoon }}><strong>{stats.closingSoon}</strong> signature proche</div>
            {stats.atRisk > 0 && <div className="health-item health-critical" style={{ flex: stats.atRisk, animation: 'pulse 2s infinite' }}>⚠️ <strong>{stats.atRisk}</strong> urgent !</div>}
          </div>
        </section>
      )}

      <section className="card overview-card">
        <div className="split-row">
          <div>
            <h2>📅 Échéances légales</h2>
            {selectedDealId ? (
              <ul className="timeline-list">
                <li><strong>Fin rétractation (J+10)</strong><span>{milestones.withdrawalDeadline}</span></li>
                <li><strong>Condition suspensive prêt (J+45)</strong><span>{milestones.loanApprovalDeadline}</span></li>
                <li><strong>Documents notaire (J+30)</strong><span>{milestones.documentDeadline}</span></li>
                <li><strong>Signature acte authentique (J+90)</strong><span>{milestones.saleDate}</span></li>
              </ul>
            ) : (
              <p className="empty-state" style={{ textAlign: 'left', padding: 0 }}>Sélectionnez un dossier pour voir ses échéances.</p>
            )}
          </div>
          <div>
            <h2>🚦 Statut du dossier</h2>
            {selectedDealId ? (
              <div className="status-grid">
                <div><strong>Prêt</strong>{statusBadge(transaction.loanStatus)}</div>
                <div><strong>Documents</strong>{statusBadge(transaction.documentStatus)}</div>
                <div><strong>Notaire</strong>{statusBadge(transaction.notaireStatus)}</div>
                <div><strong>Global</strong>{statusBadge(risk)}</div>
              </div>
            ) : (
              <p className="empty-state" style={{ textAlign: 'left', padding: 0 }}>Sélectionnez un dossier pour voir son statut.</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Top 3 critical alerts ── */}
      <section className="card reminders-card">
        <h2>⚠️ Alertes critiques</h2>
        {reminders.length === 0 ? (
          <p style={{ color: '#6b7685' }}>Aucune alerte pour le moment.</p>
        ) : (
          <ul>
            {reminders.slice(0, 3).map((r, idx) => <li key={`rm-${idx}`} style={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--gray-100)' }}>{r}</li>)}
            {reminders.length > 3 && <li style={{ listStyle: 'none', padding: '14px 0', color: 'var(--gray-500)', fontStyle: 'italic' }}>+{reminders.length - 3} autres alertes — <span style={{ cursor: 'pointer', color: 'var(--emerald)', fontWeight: 600 }} onClick={() => setActiveTab('alertes')}>Voir tout</span></li>}
          </ul>
        )}
      </section>
    </>
  );

  const renderDossiers = () => (
    <>
      <section className="card quick-add-card">
        <div className="quick-add-header"><h2>⚡ Nouveau dossier de vente</h2><span className="quick-add-hint">Bien, acheteur, vendeur — le nécessaire pour démarrer le suivi.</span></div>
        <div className="quick-add-fields">
          <input value={quickData.property} onChange={(e) => setQuickData({ ...quickData, property: e.target.value })} placeholder="Adresse du bien" />
          <input value={quickData.buyer} onChange={(e) => setQuickData({ ...quickData, buyer: e.target.value })} placeholder="Nom de l'acheteur" />
          <input value={quickData.seller} onChange={(e) => setQuickData({ ...quickData, seller: e.target.value })} placeholder="Nom du vendeur" />
          <input type="number" min="0" value={quickData.price === 0 ? 0 : quickData.price || ''} onChange={(e) => setQuickData({ ...quickData, price: Number(e.target.value) })} placeholder="Prix (€)" />
          <button type="button" onClick={saveQuickDeal} disabled={loading || !quickData.property.trim() || !quickData.buyer.trim() || !quickData.seller.trim()}>+ Ajouter</button>
        </div>
      </section>

      <section className="card dashboard-card">
        <div className="dashboard-header">
          <div><h2>Dossiers de vente</h2></div>
          <div className="dashboard-controls">
            <input className="search-input" type="text" placeholder="🔍 Rechercher un bien, acheteur..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="filter-buttons">
              {(['all', 'active', 'at risk', 'closing soon', 'completed'] as DealStatus[]).map((status) => (
                <button key={status} className={filter === status ? 'filter-button active' : 'filter-button'} type="button" onClick={() => setFilter(status)}>
                  {status === 'all' ? 'Tous' : status === 'active' ? 'En cours' : status === 'at risk' ? 'Bloqué' : status === 'closing soon' ? 'Signature proche' : 'Signé'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="deal-table">
            <thead><tr><th>Bien immobilier</th><th>Statut</th><th>Prêt</th><th>Docs notaire</th><th>Notaire</th><th>Signature acte</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="empty-row"><div className="empty-state"><strong>{searchQuery || filter !== 'all' ? 'Aucun résultat' : 'Pas encore de dossiers'}</strong><span>{searchQuery || filter !== 'all' ? 'Essayez une autre recherche.' : 'Ajoutez votre premier dossier de vente ci-dessus.'}</span></div></td></tr>
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
                        <span className={`status-pill ${statusLabelClass(status)}`}>{status === 'active' ? 'En cours' : status === 'at risk' ? 'Bloqué' : status === 'closing soon' ? 'Signature proche' : 'Signé'}</span>
                        {riskStatus === 'at risk' && <span className="status-pill badge-danger" style={{ display: 'block', marginTop: 4 }}>⚠️ Action requise</span>}
                      </td>
                      <td><select className="inline-select" value={item.loanStatus} onChange={(e) => setField('loanStatus', e.target.value)}><option value="pending">⏳ En cours</option><option value="approved">✅ Accepté</option><option value="refused">❌ Refusé</option></select></td>
                      <td><select className="inline-select" value={item.documentStatus} onChange={(e) => setField('documentStatus', e.target.value)}><option value="missing">❌ Manquant</option><option value="complete">✅ Complet</option></select></td>
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
          <div><h2>{selectedDealId ? 'Modifier le dossier' : 'Nouveau dossier de vente'}</h2><p>Bien immobilier, parties, notaire et statuts.</p></div>
          <div className="form-actions">
            <button type="button" onClick={resetDealForm} className="secondary">Nouveau dossier</button>
            {selectedDealId && <button type="button" className="secondary" onClick={cancelDealEdit}>Annuler</button>}
            <button type="button" onClick={saveTransaction}>{selectedDealId ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </div>
        {!selectedDealId && <p className="empty-state" style={{ marginTop: 12, textAlign: 'left', padding: 0 }}>Sélectionnez un dossier ou remplissez les champs ci-dessous.</p>}
        {(!selectedDealId || transaction.property || transaction.buyer || transaction.seller) && (
          <div className="field-grid">
            <label>Bien immobilier<input value={transaction.property} onChange={(e) => handleChange('property', e.target.value)} placeholder="Adresse du bien" /></label>
            <label>Contact acheteur<select value={transaction.buyerId || ''} onChange={(e) => selectContactForTransaction('buyerId', e.target.value)}><option value="">Choisir</option>{contactOptions('buyer').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom acheteur<input value={transaction.buyer} onChange={(e) => handleChange('buyer', e.target.value)} placeholder="Acheteur" /></label>
            <label>Contact vendeur<select value={transaction.sellerId || ''} onChange={(e) => selectContactForTransaction('sellerId', e.target.value)}><option value="">Choisir</option>{contactOptions('seller').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom vendeur<input value={transaction.seller} onChange={(e) => handleChange('seller', e.target.value)} placeholder="Vendeur" /></label>
            <label>Date du compromis<input type="date" value={transaction.compromisDate} onChange={(e) => handleChange('compromisDate', e.target.value)} /></label>
            <label>Contact notaire<select value={transaction.notaireId || ''} onChange={(e) => selectContactForTransaction('notaireId', e.target.value)}><option value="">Choisir</option>{contactOptions('notaire').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Nom notaire<input value={transaction.notaire} onChange={(e) => handleChange('notaire', e.target.value)} placeholder="Notaire" /></label>
            <label>Prix (€)<input type="number" min="0" value={transaction.price} onChange={(e) => handleChange('price', Number(e.target.value))} /></label>
            <label>Prêt<select value={transaction.loanStatus} onChange={(e) => handleChange('loanStatus', e.target.value as LoanStatus)}><option value="pending">En cours</option><option value="approved">Accepté</option><option value="refused">Refusé</option></select></label>
            <label>Documents notaire<select value={transaction.documentStatus} onChange={(e) => handleChange('documentStatus', e.target.value as DocumentStatus)}><option value="missing">Manquants</option><option value="complete">Complets</option></select></label>
            <label>Notaire<select value={transaction.notaireStatus} onChange={(e) => handleChange('notaireStatus', e.target.value as NotaireStatus)}><option value="not ready">Pas prêt</option><option value="ready">Prêt</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={transaction.completed} onChange={(e) => handleChange('completed', e.target.checked)} /> Acte authentique signé</label>
          </div>
        )}
      </section>

      <section className="card export-card"><h2>📄 Export dossier</h2><p>Copiez un résumé ou générez un PDF de la timeline pour votre client ou notaire.</p><div className="form-actions" style={{ justifyContent: 'flex-start' }}><button onClick={copySummary}>📋 Copier le résumé</button><button onClick={generatePDF} className="secondary">📄 Télécharger la timeline (PDF)</button></div></section>
    </>
  );

  const renderContacts = () => (
    <>
      <section className="card form-card">
        <div className="split-row">
          <div><h2>{selectedContactId ? 'Modifier contact' : 'Nouveau contact'}</h2><p>Acheteurs, vendeurs, notaires — enregistrez vos contacts et liez-les aux dossiers.</p></div>
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
    </>
  );

  const renderAlertes = () => (
    <>
      <section className="card overview-card">
        <div className="split-row">
          <div>
            <h2>📅 Échéances légales</h2>
            {selectedDealId ? (
              <ul className="timeline-list">
                <li><strong>Fin rétractation (J+10)</strong><span>{milestones.withdrawalDeadline}</span></li>
                <li><strong>Condition suspensive prêt (J+45)</strong><span>{milestones.loanApprovalDeadline}</span></li>
                <li><strong>Documents notaire (J+30)</strong><span>{milestones.documentDeadline}</span></li>
                <li><strong>Signature acte authentique (J+90)</strong><span>{milestones.saleDate}</span></li>
              </ul>
            ) : (
              <p className="empty-state" style={{ textAlign: 'left', padding: 0 }}>Sélectionnez un dossier dans "Mes Dossiers" pour voir ses échéances.</p>
            )}
          </div>
          <div>
            <h2>🚦 Statut du dossier</h2>
            {selectedDealId ? (
              <div className="status-grid">
                <div><strong>Prêt</strong>{statusBadge(transaction.loanStatus)}</div>
                <div><strong>Documents</strong>{statusBadge(transaction.documentStatus)}</div>
                <div><strong>Notaire</strong>{statusBadge(transaction.notaireStatus)}</div>
                <div><strong>Global</strong>{statusBadge(risk)}</div>
              </div>
            ) : (
              <p className="empty-state" style={{ textAlign: 'left', padding: 0 }}>Sélectionnez un dossier pour voir son statut.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card scheduled-reminders-card">
        <h2>🔔 Rappels programmés</h2>
        {dueReminders.length === 0 ? <p>Aucun rappel pour le moment.</p> : (
          <div className="reminder-list">{dueReminders.map((reminder) => (
            <div key={`${reminder.transactionId}-${reminder.message}`} className="reminder-item">
              <div className="reminder-text"><strong>{reminder.property}</strong><div>{reminder.message}</div><small>Échéance {reminder.dueDate} ({reminder.dueInDays} jour(s))</small><small>Contact: {reminder.contactName || reminder.contactRole} {reminder.contactEmail ? `(${reminder.contactEmail})` : ''}</small></div>
              <div className="reminder-actions"><button type="button" onClick={() => sendReminderEmail(reminder)}>📧 Relancer</button><button type="button" className="secondary" onClick={() => sendBrowserNotification(reminder)}>🔔 Alerte</button></div>
            </div>
          ))}</div>
        )}
      </section>
    </>
  );

  const sidebarLinks: { id: typeof activeTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: '📊' },
    { id: 'dossiers', label: 'Mes Dossiers', icon: '📁' },
    { id: 'contacts', label: 'Contacts', icon: '👥' },
    { id: 'alertes', label: 'Échéances & Alertes', icon: '🔔' },
  ];

  return (
    <div className="demo-layout">
      {!hasRealData && (
        <section className="card demo-card" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, borderRadius: 0, margin: 0 }}>
          <div className="demo-banner">
            <div><h2>👋 Bienvenue sur Suivi Vente Immo</h2><p>Essayez l'application avec un scénario immobilier réaliste — aucune inscription nécessaire.</p></div>
            <button className="demo-button" onClick={seedDemoData}>Charger la démo</button>
          </div>
          <p className="demo-note" style={{ marginTop: 8, marginBottom: 0 }}>⚠️ Les données de démo disparaîtront après rafraîchissement. Créez un compte pour sauvegarder vos vrais dossiers.</p>
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

      {/* ── Sidebar ── */}
      <aside className="demo-sidebar">
        <div className="demo-sidebar-logo">
          <span className="demo-sidebar-logo-icon">🏠</span>
          <span className="demo-sidebar-logo-text">Suivi Vente Immo</span>
        </div>
        <nav className="demo-sidebar-nav">
          {sidebarLinks.map((link) => (
            <button
              key={link.id}
              className={`demo-sidebar-link ${activeTab === link.id ? 'demo-sidebar-link-active' : ''}`}
              onClick={() => setActiveTab(link.id)}
            >
              <span className="demo-sidebar-link-icon">{link.icon}</span>
              <span>{link.label}</span>
            </button>
          ))}
        </nav>
        <div className="demo-sidebar-footer">
          <button className="demo-sidebar-reset" onClick={() => { seedDemoData(); setActiveTab('overview'); }}>
            🔄 Réinitialiser la démo
          </button>
          <div className="demo-sidebar-demo-badge">⚡ Mode démo</div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="demo-main">
        {/* ── Top header bar ── */}
        <header className="demo-header">
          <div className="demo-header-left">
            <h1 className="demo-header-title">{pageTitle}</h1>
          </div>
          <div className="demo-header-right">
            {notification && <div className={`notification ${notification.type === 'error' ? 'notification-error' : ''}`} style={{ margin: 0, padding: '8px 14px', fontSize: '0.85rem' }}>{notification.message}</div>}
            <div className="demo-avatar" title="Utilisateur démo">
              <span>👤</span>
            </div>
            <button type="button" className="secondary" onClick={logout} disabled={loading} style={{ padding: '8px 14px', fontSize: '0.85rem' }}>Quitter</button>
          </div>
        </header>

        {/* ── Dynamic content ── */}
        <div className="demo-content">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'dossiers' && renderDossiers()}
          {activeTab === 'contacts' && renderContacts()}
          {activeTab === 'alertes' && renderAlertes()}
        </div>
      </main>
    </div>
  );
}

export default App;