import type { ContactRole, DealStatus, Milestones, Transaction, TransactionRisk } from './types';

/**
 * Format a Date as YYYY-MM-DD in the *local* timezone.
 * Avoids the off-by-one bug caused by `toISOString().slice(0,10)` for
 * users in negative UTC offsets (e.g. UTC-1 in France during winter).
 */
export const formatISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Add `days` to a date string (YYYY-MM-DD) and return a YYYY-MM-DD string.
 * Uses the local timezone, never UTC.
 */
export const addDays = (date: string, days: number): string => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatISODate(d);
};

const daysBetween = (date: string) => {
  const now = new Date();
  const target = new Date(date + 'T00:00:00');
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const buildMilestones = (transaction: Transaction): Milestones => {
  return {
    withdrawalDeadline: addDays(transaction.compromisDate, 10),
    loanApprovalDeadline: addDays(transaction.compromisDate, 45),
    documentDeadline: addDays(transaction.compromisDate, 30),
    saleDate: transaction.signingScheduledDate || addDays(transaction.compromisDate, 90)
  };
};

export const buildReminders = (transaction: Transaction) => {
  const reminders: string[] = [];

  const addIf = (condition: boolean, message: string) => {
    if (condition) reminders.push(message);
  };

  const milestones = buildMilestones(transaction);
  const daysToWithdrawal = daysBetween(milestones.withdrawalDeadline);
  const daysToLoan = daysBetween(milestones.loanApprovalDeadline);
  const daysToDocs = daysBetween(milestones.documentDeadline);
  const daysToSigning = daysBetween(milestones.saleDate);

  // 🔴 Critical - Deal at risk
  addIf(transaction.loanStatus === 'refused', '🔴 PRÊT REFUSÉ — Le deal est en danger. Trouver un financement alternatif immédiatement.');
  addIf(transaction.loanStatus === 'pending' && daysToLoan < 0, `🔴 CONDITION SUSPENSIVE EXPIRÉE depuis ${Math.abs(daysToLoan)} jour(s) — Acte annulé si non régularisé.`);
  addIf(transaction.loanStatus === 'pending' && daysToLoan <= 2 && daysToLoan >= 0, `🔴 J-${daysToLoan} avant caducité de la condition suspensive — Agissez MAINTENANT.`);
  addIf(transaction.documentStatus === 'missing' && daysToDocs < 0, `🔴 DOCUMENTS EN RETARD de ${Math.abs(daysToDocs)} jour(s) — Notaire bloqué.`);
  addIf(transaction.notaireStatus === 'not started', '🔴 Notaire : dossier non commencé. Relancer d\'urgence.');

  // 🟡 Warning - Approaching deadlines
  addIf(transaction.withdrawalStatus === 'in progress' && daysToWithdrawal <= 3 && daysToWithdrawal >= 0, `🟡 Délai rétractation expires dans ${daysToWithdrawal} jour(s).`);
  addIf(transaction.loanStatus === 'pending' && daysToLoan <= 7 && daysToLoan > 2, `🟡 Prêt J-${daysToLoan}. Suivi bancaire urgent.`);
  addIf(transaction.documentStatus === 'incomplete' && daysToDocs <= 7 && daysToDocs >= 0, `🟡 Documents J-${daysToDocs}. Envoyer au notaire.`);
  addIf(daysToSigning <= 14 && daysToSigning >= 0, `🟡 Signature prévue J-${daysToSigning}. Préparer les documents.`);

  // ✅ On track
  addIf(transaction.loanStatus === 'approved', '✅ Prêt approuvé. Condition sécurisée.');
  addIf(transaction.withdrawalStatus === 'complete', `✅ Délai rétractation purgé. Deal sécurisé légalement.`);
  addIf(transaction.documentStatus === 'complete' && transaction.notaireStatus === 'ready', '✅ Documents complets. Notaire prêt.');
  addIf(transaction.signingStatus === 'completed', '✅ Acte signé. Transaction finalisée.');

  // No "fake alert" — when nothing is wrong, return an empty array
  // so the UI can show a proper green empty state instead of a misleading alert.
  // (The previous code pushed "✅ Aucune urgence" here, which looked like an alert
  //  but was actually the absence of one — confusing for agents.)

  return reminders;
};

export const determineRisk = (transaction: Transaction): TransactionRisk => {
  if (transaction.completed) return 'on track';

  const daysTo = (dateString: string) => {
    const target = new Date(dateString + 'T00:00:00');
    return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const milestones = buildMilestones(transaction);
  const daysToLoan = daysTo(milestones.loanApprovalDeadline);
  const daysToDocs = daysTo(milestones.documentDeadline);
  const daysToWithdrawal = daysTo(milestones.withdrawalDeadline);

  // 🔴 Critical — Deal-threatening situations
  const isCritical =
    transaction.loanStatus === 'refused' || // Prêt refusé = deal en danger
    (transaction.loanStatus === 'pending' && daysToLoan < 0) || // Condition suspensive expirée
    (transaction.documentStatus !== 'complete' && daysToDocs < 0) || // Docs en retard
    (transaction.documentStatus === 'missing' && daysToDocs <= 7) || // Docs manquants et proche deadline
    (transaction.notaireStatus === 'not started' && daysToDocs <= 14); // Notaire n'a pas commencé

  if (isCritical) return 'critical';

  // 🟡 At risk — Approaching deadlines or stuck workflow
  const isAtRisk =
    (transaction.loanStatus === 'pending' && daysToLoan <= 14) || // Prêt pas encore accepté
    (transaction.documentStatus !== 'complete' && daysToDocs <= 14) || // Docs pas complets
    (transaction.notaireStatus === 'pending' && daysToDocs <= 7) || // Notaire en cours mais deadline proche
    (transaction.withdrawalStatus === 'in progress' && daysToWithdrawal <= 3) || // Rétractation imminente
    (transaction.notaireStatus === 'not started'); // Notaire pas commencé (surveillance)

  if (isAtRisk) return 'at risk';

  return 'on track';
};

export const getDealStatus = (transaction: Transaction): DealStatus => {
  if (transaction.completed) return 'completed';
  const risk = determineRisk(transaction);
  if (risk === 'critical') return 'at risk';
  if (risk === 'at risk') return 'at risk';

  const signingDate = transaction.signingScheduledDate || addDays(transaction.compromisDate, 90);
  const daysToSigning = Math.ceil(
    (new Date(signingDate + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysToSigning <= 14) return 'closing soon';
  return 'active';
};

export const statusLabelClass = (status: DealStatus) => {
  if (status === 'at risk') return 'badge-danger';
  if (status === 'closing soon') return 'badge-warning';
  if (status === 'completed') return 'badge-good';
  return 'badge-info';
};

// ── French labels for status values (used by buildSummary + statusBadge) ──
export const dealStatusLabel = (status: DealStatus): string => {
  switch (status) {
    case 'all': return 'Tous';
    case 'active': return 'En cours';
    case 'at risk': return 'Bloqué';
    case 'closing soon': return 'Signature proche';
    case 'completed': return 'Signé';
  }
};

export const loanStatusLabel = (status: Transaction['loanStatus']): string => {
  switch (status) {
    case 'pending': return 'En cours';
    case 'approved': return 'Accepté';
    case 'refused': return 'Refusé';
    case 'withdrawn': return 'Retiré';
  }
};

export const documentStatusLabel = (status: Transaction['documentStatus']): string => {
  switch (status) {
    case 'missing': return 'Manquants';
    case 'incomplete': return 'En partie';
    case 'complete': return 'Complets';
  }
};

export const notaireStatusLabel = (status: Transaction['notaireStatus']): string => {
  switch (status) {
    case 'not started': return 'Non commencé';
    case 'pending': return 'En cours';
    case 'ready': return 'Prêt';
  }
};

export const withdrawalStatusLabel = (status: Transaction['withdrawalStatus']): string => {
  switch (status) {
    case 'in progress': return 'En cours';
    case 'complete': return 'Purgé';
  }
};

/** French label for a contact role.
 *  Previously the app capitalised the English value ("Buyer", "Seller")
 *  which felt jarring in a French-first UI. */
export const contactRoleLabel = (role: ContactRole): string => {
  switch (role) {
    case 'buyer': return 'Acheteur';
    case 'seller': return 'Vendeur';
    case 'notaire': return 'Notaire';
    case 'other': return 'Autre';
  }
};

/**
 * Build a fully-French plain-text summary of a transaction. Previously this
 * function returned English values like "Loan: pending" while the rest of
 * the app is French — confusing for users who copied the summary.
 */
export const buildSummary = (transaction: Transaction) => {
  const milestones = buildMilestones(transaction);
  const risk = determineRisk(transaction);
  const riskLabel =
    risk === 'on track' ? 'En ordre' :
    risk === 'at risk' ? 'À risque' :
    'Critique';
  const reminders = buildReminders(transaction);

  return `Résumé du dossier

Bien : ${transaction.property}
Acheteur : ${transaction.buyer}
Vendeur : ${transaction.seller}
Notaire : ${transaction.notaire || 'Non renseigné'}
Prix : ${transaction.price.toLocaleString('fr-FR')} €
Date du compromis : ${transaction.compromisDate}
Finalisé : ${transaction.completed ? 'Oui' : 'Non'}

Échéances légales :
- Fin du délai de rétractation (J+10) : ${milestones.withdrawalDeadline}
- Condition suspensive de prêt (J+45) : ${milestones.loanApprovalDeadline}
- Documents notaire (J+30) : ${milestones.documentDeadline}
- Signature de l'acte authentique : ${milestones.saleDate}

Statut :
- Prêt : ${loanStatusLabel(transaction.loanStatus)}
- Documents : ${documentStatusLabel(transaction.documentStatus)}
- Notaire : ${notaireStatusLabel(transaction.notaireStatus)}
- Rétractation : ${withdrawalStatusLabel(transaction.withdrawalStatus)}
- Risque global : ${riskLabel}

${reminders.length > 0 ? `Alertes :\n${reminders.map((item) => `- ${item}`).join('\n')}` : 'Aucune alerte — dossier en bonne voie.'}`;
};
