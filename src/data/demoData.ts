import type { Contact, Transaction } from '../types';

export const dayMs = 86400000;
export const daysAgo = (n: number) => new Date(Date.now() - n * dayMs).toISOString().slice(0, 10);
export const daysFromNow = (n: number) => new Date(Date.now() + n * dayMs).toISOString().slice(0, 10);

export const demoContacts: Contact[] = [
  { id: 'demo-c1', name: 'Camille Dubois', role: 'buyer', email: 'camille.dubois@email.fr', phone: '06 23 45 67 89' },
  { id: 'demo-c2', name: 'Marc Lefevre', role: 'seller', email: 'marc.lefevre@email.fr', phone: '06 98 76 54 32' },
  { id: 'demo-c3', name: 'Me. Philippe Garnier', role: 'notaire', email: 'pgarnier@notaires.fr', phone: '04 78 42 18 00' },
  { id: 'demo-c4', name: 'Thomas Rivière', role: 'buyer', email: 'thomas.riviere@email.fr', phone: '06 12 34 56 78' },
  { id: 'demo-c5', name: 'Sophie Mercier', role: 'seller', email: 'sophie.mercier@email.fr', phone: '06 55 12 87 44' },
  { id: 'demo-c6', name: 'Me. Audrey Fontaine', role: 'notaire', email: 'afontaine@notaires.fr', phone: '04 93 85 12 00' },
  { id: 'demo-c7', name: 'Lucas Martin', role: 'buyer', email: 'lucas.martin@email.fr', phone: '06 71 23 84 56' },
  { id: 'demo-c8', name: 'Isabelle Laurent', role: 'seller', email: 'isabelle.laurent@email.fr', phone: '06 34 89 12 67' },
  { id: 'demo-c9', name: 'Me. Claire Dubois', role: 'notaire', email: 'cdubois@notaires.fr', phone: '01 43 56 78 90' }
];

export const demoTransactions: Transaction[] = [
  {
    id: 'demo-1',
    property: 'Appartement T3 — 12 rue de la République, Lyon 6e',
    buyer: 'Camille Dubois', buyerId: 'demo-c1',
    seller: 'Marc Lefevre', sellerId: 'demo-c2',
    notaire: 'Me. Philippe Garnier', notaireId: 'demo-c3',
    price: 420000,
    compromisDate: daysAgo(20), compromisCompleted: true,
    withdrawalDeadline: daysAgo(10), withdrawalStatus: 'complete',
    loanRequestDate: daysAgo(18), loanApprovalDeadline: daysFromNow(25),
    loanStatus: 'approved', loanAmount: 380000,
    documentDeadline: daysAgo(10), documentStatus: 'complete',
    documentsSubmittedDate: daysAgo(8),
    notaireStatus: 'ready', notaireReadyDate: daysAgo(8),
    signingScheduledDate: daysFromNow(70), signingStatus: 'scheduled',
    currentStage: 'signing_prep', completed: false,
    lastUpdated: new Date().toISOString(), createdAt: daysAgo(20)
  },
  {
    id: 'demo-2',
    property: 'Maison 4 pièces — Allée des Tilleuls, Marseille 8e',
    buyer: 'Thomas Rivière', buyerId: 'demo-c4',
    seller: 'Sophie Mercier', sellerId: 'demo-c5',
    notaire: 'Me. Audrey Fontaine', notaireId: 'demo-c6',
    price: 585000,
    compromisDate: daysAgo(38), compromisCompleted: true,
    withdrawalDeadline: daysAgo(28), withdrawalStatus: 'complete',
    loanRequestDate: daysAgo(35), loanApprovalDeadline: daysFromNow(7),
    loanStatus: 'pending',
    documentDeadline: daysAgo(8), documentStatus: 'incomplete',
    notaireStatus: 'pending',
    signingScheduledDate: undefined, signingStatus: 'scheduled',
    currentStage: 'loan', completed: false,
    lastUpdated: new Date().toISOString(), createdAt: daysAgo(38)
  },
  {
    id: 'demo-3',
    property: 'Studio — 8 rue du Faubourg, Paris 11e',
    buyer: 'Lucas Martin', buyerId: 'demo-c7',
    seller: 'Isabelle Laurent', sellerId: 'demo-c8',
    notaire: 'Me. Claire Dubois', notaireId: 'demo-c9',
    price: 275000,
    compromisDate: daysAgo(55), compromisCompleted: true,
    withdrawalDeadline: daysAgo(45), withdrawalStatus: 'complete',
    loanRequestDate: daysAgo(52), loanApprovalDeadline: daysAgo(10),
    loanStatus: 'refused',
    documentDeadline: daysAgo(25), documentStatus: 'missing',
    notaireStatus: 'not started',
    signingStatus: 'scheduled',
    currentStage: 'compromis', completed: false,
    lastUpdated: new Date().toISOString(), createdAt: daysAgo(55)
  }
];

export const faqData = [
  { q: 'Quels types de biens puis-je suivre ?', a: 'Appartements, maisons, terrains, locaux commerciaux — tout type de transaction immobilière avec un compromis de vente.' },
  { q: 'Les données sont-elles sécurisées ?', a: 'Oui. Conforme RGPD et hébergé en France. Vos données ne sont jamais partagées avec des tiers.' },
  { q: 'Puis-je ajouter mon notaire ou mon banquier ?', a: 'Oui. Créez des contacts avec email et numéro de téléphone pour relancer directement depuis l\'application.' },
  { q: 'Que se passe-t-il si un délai expire ?', a: 'Une notification apparaît en rouge dans le tableau de bord, et vous recevez une alerte avec les coordonnées du contact à relancer.' },
  { q: 'Comment fonctionne le plan Pro ?', a: 'Le plan Pro débloque les dossiers illimités, l\'upload de documents, les templates juridiques et l\'export PDF. Paiement sécurisé via Stripe.' },
  { q: 'Comment sont calculés les délais ?', a: 'Basés sur le droit français : 10 jours de rétractation, 45 jours pour la condition suspensive de prêt, 30 jours pour les documents notaire.' }
];
