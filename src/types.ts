export type LoanStatus = 'pending' | 'approved' | 'refused' | 'withdrawn';
export type DocumentStatus = 'missing' | 'incomplete' | 'complete';
export type NotaireStatus = 'not started' | 'pending' | 'ready';
export type WithdrawalStatus = 'in progress' | 'complete';
export type SigningStatus = 'scheduled' | 'completed' | 'cancelled';
export type TransactionRisk = 'on track' | 'at risk' | 'critical';
export type TransactionStage = 'compromis' | 'withdrawal' | 'loan' | 'documents' | 'signing_prep' | 'signing' | 'post_closing' | 'completed';
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
  // Basic info
  id: string;
  property: string;
  buyer: string;
  buyerId?: string;
  seller: string;
  sellerId?: string;
  notaire?: string;
  notaireId?: string;
  price: number;
  
  // Stage tracking with dates
  compromisDate: string; // Legal: Day 0
  compromisCompleted: boolean;
  
  withdrawalDeadline: string; // Legal: Day 10
  withdrawalStatus: WithdrawalStatus; // 'in progress' | 'complete'
  
  loanRequestDate?: string;
  loanApprovalDeadline: string; // Legal: Day 45
  loanStatus: LoanStatus; // 'pending' | 'approved' | 'refused' | 'withdrawn'
  loanAmount?: number; // Optional: amount approved
  
  documentDeadline: string; // Legal: Day 30
  documentStatus: DocumentStatus; // 'missing' | 'incomplete' | 'complete'
  documentsSubmittedDate?: string;
  
  notaireStatus: NotaireStatus; // 'not started' | 'pending' | 'ready'
  notaireReadyDate?: string;
  
  signingScheduledDate?: string;
  signingStatus: SigningStatus; // 'scheduled' | 'completed' | 'cancelled'
  
  fundsTransferredDate?: string;
  keysHandedDate?: string;
  
  // Overall status
  currentStage: TransactionStage;
  completed: boolean;
  completionDate?: string;
  cancelledDate?: string;
  cancellationReason?: string;
  
  // Internal tracking
  lastUpdated: string;
  createdAt: string;
}

export interface Milestones {
  withdrawalDeadline: string;
  loanApprovalDeadline: string;
  documentDeadline: string;
  saleDate: string;
}
