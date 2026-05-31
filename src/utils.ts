import type { DealStatus, Milestones, Transaction } from './types';

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

export const buildMilestones = (transaction: Transaction): Milestones => {
  const base = new Date(transaction.compromisDate);
  const withdrawal = new Date(base);
  withdrawal.setDate(base.getDate() + 10);

  const loanApproval = new Date(base);
  loanApproval.setDate(base.getDate() + 45);

  const documentDeadline = new Date(base);
  documentDeadline.setDate(base.getDate() + 30);

  const saleDate = new Date(base);
  saleDate.setDate(base.getDate() + 90);

  return {
    withdrawalDeadline: formatDate(withdrawal),
    loanApprovalDeadline: formatDate(loanApproval),
    documentDeadline: formatDate(documentDeadline),
    saleDate: formatDate(saleDate)
  };
};

const daysBetween = (date: string) => {
  const now = new Date();
  const target = new Date(date);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const buildReminders = (transaction: Transaction) => {
  const milestones = buildMilestones(transaction);
  const reminders: string[] = [];

  const addIf = (condition: boolean, message: string) => {
    if (condition) reminders.push(message);
  };

  const daysToLoan = daysBetween(milestones.loanApprovalDeadline);
  const daysToSale = daysBetween(milestones.saleDate);
  const daysToWithdrawal = daysBetween(milestones.withdrawalDeadline);
  const daysToDocs = daysBetween(milestones.documentDeadline);

  // 🔴 Critical overdue warnings
  addIf(transaction.loanStatus === 'pending' && daysToLoan < 0, `🔴 Condition suspensive de prêt EXPIRÉE depuis ${Math.abs(daysToLoan)} jour(s) — Votre commission est menacée !`);
  addIf(transaction.documentStatus === 'missing' && daysToDocs < 0, `🔴 Documents notaire EN RETARD de ${Math.abs(daysToDocs)} jour(s)`);
  addIf(daysToWithdrawal < 0, `✅ Délai de rétractation purgé depuis ${Math.abs(daysToWithdrawal)} jour(s) — Le deal est sécurisé`);
  addIf(daysToSale < 0, `🔴 Date de signature chez le notaire DÉPASSÉE (${milestones.saleDate})`);

  // 🟡 Approaching deadlines
  addIf(transaction.loanStatus === 'pending' && daysToLoan <= 7 && daysToLoan >= 0, `🟡 Condition suspensive de prêt échéance dans ${daysToLoan} jour(s)`);
  addIf(transaction.loanStatus === 'pending' && daysToLoan <= 2 && daysToLoan >= 0, `🔴 J-${daysToLoan} avant caducité du prêt — Agissez immédiatement !`);
  addIf(transaction.loanStatus === 'refused', '🔴 Prêt refusé — Trouver une alternative ou le deal est perdu');
  addIf(transaction.loanStatus === 'approved' && daysToLoan > 0, '✅ Accord de principe obtenu — Continuer le suivi');
  addIf(transaction.documentStatus === 'missing', '🟡 Documents bancaires ou notaire manquants');
  addIf(daysToDocs <= 7 && daysToDocs >= 0, `🟡 Échéance documents notaire dans ${daysToDocs} jour(s)`);
  addIf(daysToSale <= 14 && daysToSale >= 0, `🟡 Signature acte de vente prévue dans ${daysToSale} jour(s)`);
  addIf(daysToWithdrawal <= 3 && daysToWithdrawal >= 0, `🟡 Fin du délai de rétractation dans ${daysToWithdrawal} jour(s)`);

  return reminders.length ? reminders : ['✅ Aucune urgence — Transaction stable.'];
};

export const determineRisk = (transaction: Transaction) => {
  const terms = buildMilestones(transaction);
  const today = new Date();
  const warnThreshold = (dateString: string) => {
    const target = new Date(dateString);
    return (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 7;
  };

  const atRisk =
    transaction.loanStatus === 'refused' ||
    transaction.documentStatus === 'missing' ||
    transaction.notaireStatus === 'not ready' ||
    warnThreshold(terms.loanApprovalDeadline) ||
    warnThreshold(terms.documentDeadline) ||
    warnThreshold(terms.withdrawalDeadline);

  return atRisk ? 'at risk' : 'on track';
};

export const getDealStatus = (transaction: Transaction): DealStatus => {
  if (transaction.completed) return 'completed';
  if (determineRisk(transaction) === 'at risk') return 'at risk';

  const saleDate = new Date(buildMilestones(transaction).saleDate);
  const daysToSale = Math.ceil((saleDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  if (daysToSale <= 14) return 'closing soon';
  return 'active';
};

export const statusLabelClass = (status: DealStatus) => {
  if (status === 'at risk') return 'badge-danger';
  if (status === 'closing soon') return 'badge-warning';
  if (status === 'completed') return 'badge-good';
  return 'badge-good';
};

export const buildSummary = (transaction: Transaction) => {
  const milestones = buildMilestones(transaction);
  const status = determineRisk(transaction);
  const reminders = buildReminders(transaction);

  return `Transaction Summary\n\nProperty: ${transaction.property}\nBuyer: ${transaction.buyer}\nSeller: ${transaction.seller}\nCompromis Date: ${transaction.compromisDate}\nNotaire: ${transaction.notaire || 'Not specified'}\nPrice: €${transaction.price.toLocaleString()}\nCompleted: ${transaction.completed ? 'Yes' : 'No'}\n\nMilestones:\n- Withdrawal deadline: ${milestones.withdrawalDeadline}\n- Loan approval deadline: ${milestones.loanApprovalDeadline}\n- Documents deadline: ${milestones.documentDeadline}\n- Estimated acte de vente: ${milestones.saleDate}\n\nStatus:\n- Loan: ${transaction.loanStatus}\n- Documents: ${transaction.documentStatus}\n- Notaire: ${transaction.notaireStatus}\n- Overall: ${status}\n\nUpcoming reminders:\n${reminders.map((item) => `- ${item}`).join('\n')}`;
};
