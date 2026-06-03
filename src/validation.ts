import type { Transaction } from './types';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Check if transaction has all critical information filled
 * Returns validation errors if any required fields are missing or invalid
 */
export const validateTransaction = (transaction: Transaction): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Core transaction info - always required
  if (!transaction.property?.trim()) {
    errors.push({ field: 'property', message: 'Le bien immobilier est requis' });
  }
  if (!transaction.buyer?.trim()) {
    errors.push({ field: 'buyer', message: 'Le nom de l\'acheteur est requis' });
  }
  if (!transaction.seller?.trim()) {
    errors.push({ field: 'seller', message: 'Le nom du vendeur est requis' });
  }
  if (transaction.price <= 0) {
    errors.push({ field: 'price', message: 'Le prix doit être supérieur à 0' });
  }

  // Dates
  if (!transaction.compromisDate) {
    errors.push({ field: 'compromisDate', message: 'La date du compromis est requise' });
  }

  return errors;
};

/**
 * Determine what information is missing for a complete transaction profile
 * This helps agents see what needs to be filled to mark a deal as "complete"
 */
export const getIncompleteFields = (transaction: Transaction): string[] => {
  const incomplete: string[] = [];

  // Basic required info
  if (!transaction.property?.trim()) incomplete.push('Bien immobilier');
  if (!transaction.buyer?.trim()) incomplete.push('Acheteur');
  if (!transaction.seller?.trim()) incomplete.push('Vendeur');
  if (transaction.price <= 0) incomplete.push('Prix de vente');
  if (!transaction.notaire?.trim()) incomplete.push('Notaire');

  // Contact links
  if (!transaction.buyerId) incomplete.push('Contact acheteur lié');
  if (!transaction.sellerId) incomplete.push('Contact vendeur lié');
  if (!transaction.notaireId) incomplete.push('Contact notaire lié');

  // Workflow states
  if (!transaction.compromisDate) incomplete.push('Date du compromis');
  if (!transaction.loanRequestDate && transaction.loanStatus !== 'refused') {
    incomplete.push('Date demande prêt');
  }
  if (!transaction.signingScheduledDate && !transaction.completed) {
    incomplete.push('Date signature prévue');
  }

  // For deals approaching closing, more fields become critical
  const daysToSigning = transaction.signingScheduledDate
    ? Math.ceil(
        (new Date(transaction.signingScheduledDate).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : 999;

  if (daysToSigning <= 14) {
    if (transaction.documentStatus === 'missing') {
      incomplete.push('Documents complétés');
    }
    if (transaction.loanStatus === 'pending') {
      incomplete.push('Accord de prêt confirmé');
    }
    if (transaction.notaireStatus === 'not started') {
      incomplete.push('Notaire ayant commencé le dossier');
    }
  }

  return incomplete;
};

/**
 * Check if a transaction can be considered "ready" for signing
 * Returns true if all critical information is present and timeline is clear
 */
export const isReadyForSigning = (transaction: Transaction): boolean => {
  return (
    transaction.property?.trim() !== '' &&
    transaction.buyer?.trim() !== '' &&
    transaction.seller?.trim() !== '' &&
    transaction.notaire?.trim() !== '' &&
    transaction.price > 0 &&
    transaction.compromisDate !== '' &&
    transaction.loanStatus !== 'refused' &&
    (transaction.loanStatus === 'approved' || transaction.loanStatus === 'withdrawn') &&
    (transaction.documentStatus === 'complete' || transaction.documentStatus === 'incomplete') &&
    (transaction.notaireStatus === 'ready' || transaction.notaireStatus === 'pending') &&
    transaction.signingScheduledDate !== undefined &&
    transaction.signingScheduledDate !== ''
  );
};

/**
 * Check if transaction appears "stuck" with no progress
 */
export const isTransactionStuck = (transaction: Transaction, daysOldThreshold: number = 30): boolean => {
  if (transaction.completed) return false;

  const createdDate = new Date(transaction.createdAt);
  const daysSinceCreation = Math.floor(
    (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCreation < daysOldThreshold) return false;

  // Check if no progress has been made
  const hasProgress =
    transaction.withdrawalStatus === 'complete' ||
    transaction.loanStatus !== 'pending' ||
    transaction.documentStatus !== 'missing' ||
    transaction.notaireStatus !== 'not started' ||
    transaction.signingStatus === 'completed';

  return !hasProgress;
};
