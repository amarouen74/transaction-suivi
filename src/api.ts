import type { Contact, Transaction } from './types';
import { supabase, supabaseReady } from './supabaseClient';

class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    this.name = 'SupabaseNotConfiguredError';
  }
}

const requireSupabase = () => {
  if (!supabaseReady || !supabase) throw new SupabaseNotConfiguredError();
  return supabase;
};

const mapTransaction = (row: any): Transaction => ({
  id: row.id,
  property: row.property,
  buyer: row.buyer,
  buyerId: row.buyer_id,
  seller: row.seller,
  sellerId: row.seller_id,
  notaire: row.notaire,
  notaireId: row.notaire_id,
  price: row.price,
  compromisDate: row.compromis_date,
  compromisCompleted: row.compromis_completed ?? false,
  withdrawalDeadline: row.withdrawal_deadline,
  withdrawalStatus: row.withdrawal_status ?? 'in progress',
  loanRequestDate: row.loan_request_date,
  loanApprovalDeadline: row.loan_approval_deadline,
  loanStatus: row.loan_status ?? 'pending',
  loanAmount: row.loan_amount,
  documentDeadline: row.document_deadline,
  documentStatus: row.document_status ?? 'missing',
  documentsSubmittedDate: row.documents_submitted_date,
  notaireStatus: row.notaire_status ?? 'not started',
  notaireReadyDate: row.notaire_ready_date,
  signingScheduledDate: row.signing_scheduled_date,
  signingStatus: row.signing_status ?? 'scheduled',
  fundsTransferredDate: row.funds_transferred_date,
  keysHandedDate: row.keys_handed_date,
  currentStage: row.current_stage ?? 'compromis',
  completed: row.completed ?? false,
  completionDate: row.completion_date,
  cancelledDate: row.cancelled_date,
  cancellationReason: row.cancellation_reason,
  lastUpdated: row.last_updated,
  createdAt: row.created_at
});

const mapContact = (row: any): Contact => ({
  id: row.id,
  name: row.name,
  role: row.role,
  email: row.email,
  phone: row.phone
});

const transactionPayload = (transaction: Transaction) => ({
  property: transaction.property,
  buyer: transaction.buyer,
  buyer_id: transaction.buyerId,
  seller: transaction.seller,
  seller_id: transaction.sellerId,
  notaire: transaction.notaire,
  notaire_id: transaction.notaireId,
  price: transaction.price,
  compromis_date: transaction.compromisDate,
  compromis_completed: transaction.compromisCompleted,
  withdrawal_deadline: transaction.withdrawalDeadline,
  withdrawal_status: transaction.withdrawalStatus,
  loan_request_date: transaction.loanRequestDate,
  loan_approval_deadline: transaction.loanApprovalDeadline,
  loan_status: transaction.loanStatus,
  loan_amount: transaction.loanAmount,
  document_deadline: transaction.documentDeadline,
  document_status: transaction.documentStatus,
  documents_submitted_date: transaction.documentsSubmittedDate,
  notaire_status: transaction.notaireStatus,
  notaire_ready_date: transaction.notaireReadyDate,
  signing_scheduled_date: transaction.signingScheduledDate,
  signing_status: transaction.signingStatus,
  funds_transferred_date: transaction.fundsTransferredDate,
  keys_handed_date: transaction.keysHandedDate,
  current_stage: transaction.currentStage,
  completed: transaction.completed,
  completion_date: transaction.completionDate,
  cancelled_date: transaction.cancelledDate,
  cancellation_reason: transaction.cancellationReason,
  last_updated: new Date().toISOString()
});

export const signIn = async (email: string, password: string) => {
  return requireSupabase().auth.signInWithPassword({ email, password });
};

export const signUp = async (email: string, password: string) => {
  return requireSupabase().auth.signUp({ email, password });
};

export const signOut = async () => {
  return requireSupabase().auth.signOut();
};

export const getSession = async () => {
  const sb = requireSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
};

export const onAuthStateChange = (handler: (event: string, session: any) => void) => {
  return requireSupabase().auth.onAuthStateChange((event, session) => handler(event, session));
};

export const fetchDeals = async (userId: string) => {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapTransaction);
};

export const saveDeal = async (deal: Transaction, userId: string) => {
  const sb = requireSupabase();
  const payload = { ...transactionPayload(deal), user_id: userId };
  const query = deal.id
    ? sb.from('transactions').update(payload).eq('id', deal.id).eq('user_id', userId).select().single()
    : sb.from('transactions').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return mapTransaction(data);
};

export const deleteDeal = async (id: string, userId: string) => {
  const sb = requireSupabase();
  const { error } = await sb.from('transactions').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
};

export const fetchContacts = async (userId: string) => {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapContact);
};

const contactPayload = (contact: Contact) => {
  const { id, ...rest } = contact;
  return rest;
};

export const saveContact = async (contact: Contact, userId: string) => {
  const sb = requireSupabase();
  const query = contact.id
    ? sb.from('contacts').update({ ...contactPayload(contact), user_id: userId }).eq('id', contact.id).eq('user_id', userId).select().single()
    : sb.from('contacts').insert({ ...contactPayload(contact), user_id: userId }).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return mapContact(data);
};

export const deleteContact = async (id: string, userId: string) => {
  const sb = requireSupabase();
  const { error } = await sb.from('contacts').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
};
