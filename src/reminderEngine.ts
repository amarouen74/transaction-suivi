import type { Contact, ReminderItem, Transaction } from './types';
import { buildMilestones } from './utils';

const daysBetween = (date: string) => {
  const now = new Date();
  const target = new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const getContact = (contacts: Contact[], id?: string) => contacts.find((item) => item.id === id);

const getContactRoleForMessage = (message: string) => {
  if (message.includes('Notaire documents')) return 'notaire';
  if (message.includes('Loan')) return 'buyer';
  if (message.includes('Missing bank') || message.includes('review deal')) return 'buyer';
  return 'buyer';
};

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

  if (transaction.loanStatus === 'pending' && daysToLoan <= 7 && daysToLoan >= 0) {
    items.push(normalizeReminder(
      transaction,
      `Loan deadline in ${daysToLoan} day(s)`,
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.loanStatus === 'refused') {
    items.push(normalizeReminder(
      transaction,
      'Loan has been refused — review deal or find alternatives',
      milestones.loanApprovalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (transaction.documentStatus === 'missing') {
    items.push(normalizeReminder(
      transaction,
      'Missing bank or notaire documents',
      milestones.documentDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  if (daysToDocs <= 7 && daysToDocs >= 0) {
    items.push(normalizeReminder(
      transaction,
      `Notaire documents deadline in ${daysToDocs} day(s)`,
      milestones.documentDeadline,
      'notaire',
      notaire?.name,
      notaire?.email
    ));
  }

  if (daysToSale <= 14 && daysToSale >= 0) {
    items.push(normalizeReminder(
      transaction,
      `Acte de vente scheduled in ${daysToSale} day(s)`,
      milestones.saleDate,
      'seller',
      seller?.name,
      seller?.email
    ));
  }

  if (daysToWithdrawal <= 3 && daysToWithdrawal >= 0) {
    items.push(normalizeReminder(
      transaction,
      `Legal withdrawal deadline in ${daysToWithdrawal} day(s)`,
      milestones.withdrawalDeadline,
      'buyer',
      buyer?.name,
      buyer?.email
    ));
  }

  return items;
};

export const collectReminders = (transactions: Transaction[], contacts: Contact[]): ReminderItem[] =>
  transactions.flatMap((transaction) => getReminderItems(transaction, contacts));
