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
  compromisDate: row.compromis_date,
  price: row.price,
  loanStatus: row.loan_status,
  documentStatus: row.document_status,
  notaireStatus: row.notaire_status,
  completed: row.completed
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
  compromis_date: transaction.compromisDate,
  price: transaction.price,
  loan_status: transaction.loanStatus,
  document_status: transaction.documentStatus,
  notaire_status: transaction.notaireStatus,
  completed: transaction.completed
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
