import { useRef, useState } from 'react';
import { uploadDealDocument, listDealDocuments, deleteDealDocument, getDocumentPublicUrl } from '../lib/storage';
import { supabaseReady } from '../supabaseClient';

interface DealDocument {
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

interface FileUploadProps {
  dealId: string;
  documents: DealDocument[];
  onDocumentsChange: (docs: DealDocument[]) => void;
}

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * File upload widget for deal documents (compromis, diagnostics, etc.)
 * Uses Supabase Storage when configured, falls back to in-memory list.
 */
export function FileUpload({ dealId, documents, onDocumentsChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const newDocs: DealDocument[] = [...documents];
      for (const file of Array.from(files)) {
        if (file.size > MAX_SIZE) {
          setError(`${file.name} dépasse la taille maximale (10 MB)`);
          continue;
        }
        let url = '';
        if (supabaseReady) {
          const path = `${dealId}/${Date.now()}-${file.name}`;
          await uploadDealDocument(path, file);
          url = getDocumentPublicUrl(path);
        } else {
          // Fallback: object URL (lost on reload)
          url = URL.createObjectURL(file);
        }
        newDocs.push({
          name: file.name,
          url,
          size: file.size,
          uploadedAt: new Date().toISOString()
        });
      }
      onDocumentsChange(newDocs);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de l\'upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (doc: DealDocument) => {
    if (!confirm(`Supprimer ${doc.name} ?`)) return;
    try {
      if (supabaseReady && doc.url.includes('supabase')) {
        const path = `${dealId}/${doc.name}`;
        await deleteDealDocument(path);
      }
      onDocumentsChange(documents.filter((d) => d.url !== doc.url));
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la suppression');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="file-upload">
      <div className="file-upload-header">
        <h3>📎 Documents du dossier</h3>
        <span className="file-upload-hint">PDF, images, Word — max 10 MB / fichier</span>
      </div>
      <div
        className={`file-upload-drop ${dragOver ? 'file-upload-drop-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="file-upload-loading">⏳ Upload en cours...</div>
        ) : (
          <>
            <div className="file-upload-icon">📤</div>
            <strong>Glissez vos fichiers ici</strong>
            <small>ou cliquez pour parcourir</small>
            <small className="file-upload-types">Compromis, diagnostics, titre de propriété, PV d'AG,RIB...</small>
          </>
        )}
      </div>
      {error && <div className="file-upload-error">{error}</div>}
      {!supabaseReady && documents.length > 0 && (
        <div className="file-upload-warning">
          ⚠️ Supabase non configuré : les fichiers ne seront pas persistés après rafraîchissement.
        </div>
      )}
      {documents.length > 0 && (
        <ul className="file-list">
          {documents.map((doc, i) => (
            <li key={i} className="file-item">
              <span className="file-icon">{doc.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
              <div className="file-info">
                <a href={doc.url} target="_blank" rel="noopener noreferrer"><strong>{doc.name}</strong></a>
                <small>{formatSize(doc.size)} — {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}</small>
              </div>
              <button type="button" className="tiny-button danger" onClick={() => handleDelete(doc)}>Suppr</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function loadDocumentsForDeal(dealId: string): Promise<DealDocument[]> {
  if (!supabaseReady) return [];
  try {
    const paths: string[] = await listDealDocuments(dealId);
    return paths.map((p: string) => ({
      name: p.split('/').pop() || p,
      url: getDocumentPublicUrl(p),
      size: 0,
      uploadedAt: new Date().toISOString()
    }));
  } catch {
    return [];
  }
}
