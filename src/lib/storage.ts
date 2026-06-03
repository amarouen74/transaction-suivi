import { supabase, supabaseReady } from '../supabaseClient';

const BUCKET = 'deal-documents';

/**
 * Upload a document to Supabase Storage for a specific deal.
 * Path convention: {dealId}/{timestamp}-{filename}
 */
export async function uploadDealDocument(path: string, file: File): Promise<string> {
  if (!supabaseReady || !supabase) {
    throw new Error('Supabase non configuré');
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  return path;
}

/**
 * List all document paths for a specific deal (folder).
 */
export async function listDealDocuments(dealId: string): Promise<string[]> {
  if (!supabaseReady || !supabase) return [];
  const { data, error } = await supabase.storage.from(BUCKET).list(dealId, {
    sortBy: { column: 'created_at', order: 'desc' }
  });
  if (error) throw error;
  return (data ?? []).map((f) => `${dealId}/${f.name}`);
}

/**
 * Get a public URL for a document. Use signed URLs for private files in production.
 */
export function getDocumentPublicUrl(path: string): string {
  if (!supabaseReady || !supabase) return '';
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Generate a signed URL valid for 1 hour (for private documents).
 */
export async function getDocumentSignedUrl(path: string): Promise<string> {
  if (!supabaseReady || !supabase) return '';
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a document from storage.
 */
export async function deleteDealDocument(path: string): Promise<void> {
  if (!supabaseReady || !supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
