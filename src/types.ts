export type LoanStatus = 'pending' | 'approved' | 'refused';
export type DocumentStatus = 'missing' | 'complete';
export type NotaireStatus = 'ready' | 'not ready';
export type TransactionRisk = 'on track' | 'at risk';
export type DealStatus = 'all' | 'active' | 'at risk' | 'closing soon' | 'completed';
export type ContactRole = 'buyer' | 'seller' | 'notaire' | 'other';

export interface Contact {
  id: string;
  name: string;
  role: ContactRole;
  email: string;
  phone: string;
}

export interface ReminderItem {
  transactionId: string;
  property: string;
  message: string;
  dueInDays: number;
  dueDate: string;
  contactRole: ContactRole;
  contactName?: string;
  contactEmail?: string;
}

export interface Transaction {
  id: string;
  property: string;
  buyer: string;
  buyerId?: string;
  seller: string;
  sellerId?: string;
  compromisDate: string;
  notaire?: string;
  notaireId?: string;
  price: number;
  loanStatus: LoanStatus;
  documentStatus: DocumentStatus;
  notaireStatus: NotaireStatus;
  completed: boolean;
}

export interface Milestones {
  withdrawalDeadline: string;
  loanApprovalDeadline: string;
  documentDeadline: string;
  saleDate: string;
}
