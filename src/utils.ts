import type { DealStatus, Milestones, Transaction, TransactionRisk } from './types';

export const buildMilestones = (transaction: Transaction): Milestones => {
  return {
    withdrawalDeadline: addDays(transaction.compromisDate, 10),
    loanApprovalDeadline: addDays(transaction.compromisDate, 45),
    documentDeadline: addDays(transaction.compromisDate, 30),
    saleDate: transaction.signingScheduledDate || addDays(transaction.compromisDate, 90)
  };
};

const addDays = (date: string, days: number): string => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (date: string) => {
  const now = new Date();
  const target = new Date(date);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

  // Default message if no alerts
  if (reminders.length === 0) {
    reminders.push('✅ Aucune urgence — Suivi en cours normalement.');
  }

  return reminders;
};

export const determineRisk = (transaction: Transaction): TransactionRisk => {
  if (transaction.completed) return 'on track';

  const daysTo = (dateString: string) => {
    const target = new Date(dateString);
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
  const daysToSigning = Math.ceil((new Date(signingDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  if (daysToSigning <= 14) return 'closing soon';
  return 'active';
};

export const statusLabelClass = (status: DealStatus) => {
  if (status === 'at risk') return 'badge-danger';
  if (status === 'closing soon') return 'badge-warning';
  if (status === 'completed') return 'badge-good';
  return 'badge-info';
};

export const buildSummary = (transaction: Transaction) => {
  const milestones = buildMilestones(transaction);
  const risk = determineRisk(transaction);
  const reminders = buildReminders(transaction);

  return `Transaction Summary\n\nProperty: ${transaction.property}\nBuyer: ${transaction.buyer}\nSeller: ${transaction.seller}\nCompromis Date: ${transaction.compromisDate}\nNotaire: ${transaction.notaire || 'Not specified'}\nPrice: €${transaction.price.toLocaleString()}\nCompleted: ${transaction.completed ? 'Yes' : 'No'}\n\nMilestones:\n- Withdrawal deadline: ${milestones.withdrawalDeadline}\n- Loan approval deadline: ${milestones.loanApprovalDeadline}\n- Documents deadline: ${milestones.documentDeadline}\n- Signing date: ${milestones.saleDate}\n\nStatus:\n- Loan: ${transaction.loanStatus}\n- Documents: ${transaction.documentStatus}\n- Notaire: ${transaction.notaireStatus}\n- Withdrawal: ${transaction.withdrawalStatus}\n- Overall Risk: ${risk}\n\nUpcoming reminders:\n${reminders.map((item) => `- ${item}`).join('\n')}`;
};
