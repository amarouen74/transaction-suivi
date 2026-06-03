import type { Contact, ReminderItem, Transaction } from './types';
import { buildMilestones } from './utils';

const daysBetween = (date: string) => {
  const now = new Date();
  const target = new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const getContact = (contacts: Contact[], id?: string) => contacts.find((item) => item.id === id);

const normalizeReminder = (
  transaction: Transaction,
  message: string,
  dueDate: string,
  role: 'buyer' | 'seller' | 'notaire' | 'other',
  contactName?: string,
  contactEmail?: string
): ReminderItem => ({
  transactionId: transaction.id,
  property: transaction.property,
  message,
  dueInDays: daysBetween(dueDate),
  dueDate,
  contactRole: role,
  contactName,
  contactEmail
});

export const getReminderItems = (transaction: Transaction, contacts: Contact[]): ReminderItem[] => {
  const milestones = buildMilestones(transaction);
  const items: ReminderItem[] = [];

  const buyer = getContact(contacts, transaction.buyerId);
  const seller = getContact(contacts, transaction.sellerId);
  const notaire = getContact(contacts, transaction.notaireId);

  const daysToLoan = daysBetween(milestones.loanApprovalDeadline);
  const daysToDocs = daysBetween(milestones.documentDeadline);
  const daysToSale = daysBetween(milestones.saleDate);
  const daysToWithdrawal = daysBetween(milestones.withdrawalDeadline);

  // 🔴 Critical overdue warnings
  if (transaction.loanStatus === 'refused') {
    items.push(normalizeReminder(
      transaction,
      `🔴 Prêt REFUSÉ — Trouver un financement alternatif ou le deal est perdu`,
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.loanStatus === 'pending' && daysToLoan < 0) {
    items.push(normalizeReminder(
      transaction,
      `🔴 Condition suspensive de prêt EXPIRÉE depuis ${Math.abs(daysToLoan)} jour(s) — Acte annulé si non régularisé`,
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.loanStatus === 'pending' && daysToLoan <= 2 && daysToLoan >= 0) {
    items.push(normalizeReminder(
      transaction,
      `🔴 J-${daysToLoan} avant caducité du prêt — Agissez immédiatement !`,
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.documentStatus !== 'complete' && daysToDocs < 0) {
    items.push(normalizeReminder(
      transaction,
      `🔴 Documents notaire EN RETARD de ${Math.abs(daysToDocs)} jour(s) — Relancez immédiatement`,
      milestones.documentDeadline,
      'notaire',
      notaire?.name,
      notaire?.email
    ));
  }

  if (daysToSale < 0) {
    items.push(normalizeReminder(
      transaction,
      `🔴 Date de signature chez le notaire DÉPASSÉE (${milestones.saleDate})`,
      milestones.saleDate,
      'seller',
      seller?.name,
      seller?.email
    ));
  }

  // 🟡 Upcoming warnings / approaching deadlines
  if (transaction.loanStatus === 'pending' && daysToLoan <= 7 && daysToLoan > 2) {
    items.push(normalizeReminder(
      transaction,
      `🟡 Condition suspensive de prêt échéance dans ${daysToLoan} jour(s) — Suivi bancaire urgent`,
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.documentStatus === 'incomplete' && daysToDocs <= 7 && daysToDocs >= 0) {
    items.push(normalizeReminder(
      transaction,
      `🟡 Documents notaire en partie reçus — échéance dans ${daysToDocs} jour(s)`,
      milestones.documentDeadline,
      'notaire',
      notaire?.name,
      notaire?.email
    ));
  }

  if (transaction.documentStatus === 'missing') {
    items.push(normalizeReminder(
      transaction,
      `🟡 Documents manquants — à envoyer au notaire avant le ${milestones.documentDeadline}`,
      milestones.documentDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (daysToSale <= 14 && daysToSale >= 0) {
    items.push(normalizeReminder(
      transaction,
      `🟡 Signature acte de vente prévue dans ${daysToSale} jour(s)`,
      milestones.saleDate,
      'seller',
      seller?.name,
      seller?.email
    ));
  }

  if (daysToWithdrawal <= 3 && daysToWithdrawal >= 0) {
    items.push(normalizeReminder(
      transaction,
      `🟡 Fin du délai de rétractation dans ${daysToWithdrawal} jour(s)`,
      milestones.withdrawalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.notaireStatus === 'not started') {
    items.push(normalizeReminder(
      transaction,
      `🟡 Notaire : dossier non commencé — relancer avant le ${milestones.documentDeadline}`,
      milestones.documentDeadline,
      'notaire',
      notaire?.name,
      notaire?.email
    ));
  }

  return items;
};

export const collectReminders = (transactions: Transaction[], contacts: Contact[]): ReminderItem[] =>
  transactions.flatMap((transaction) => getReminderItems(transaction, contacts));