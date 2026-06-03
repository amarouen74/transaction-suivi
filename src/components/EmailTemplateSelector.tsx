import { useState } from 'react';
import type { Transaction, Contact } from '../types';
import { buildEmailTemplates, type EmailTemplate } from '../lib/emailTemplates';

interface EmailTemplateSelectorProps {
  transaction: Transaction;
  contacts: Contact[];
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

const noEmailLabel = "pas d'email";

/**
 * UI to select a pre-written legal email template, preview it,
 * and copy to clipboard or open the user's mail client.
 */
export function EmailTemplateSelector({ transaction, contacts, onNotify }: EmailTemplateSelectorProps) {
  const templates = buildEmailTemplates(transaction, contacts);
  const [active, setActive] = useState<EmailTemplate | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => onNotify('📋 Email copié dans le presse-papiers', 'success'),
      () => onNotify('Erreur lors de la copie', 'error')
    );
  };

  const openMailClient = (template: EmailTemplate) => {
    const to = template.to.contact?.email;
    if (!to) {
      onNotify(`Aucun email pour le contact (${template.to.role})`, 'error');
      return;
    }
    const subject = encodeURIComponent(template.subject);
    const body = encodeURIComponent(template.body);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  if (templates.length === 0) {
    return (
      <div className="email-templates">
        <div className="email-templates-header">
          <h3>✉️ Templates d'emails juridiques</h3>
          <span className="email-templates-hint">Prêts à l'emploi, conformes au droit français</span>
        </div>
        <div className="email-templates-empty">
          ✅ Aucun template de relance nécessaire pour ce dossier — il est en bonne voie.
        </div>
      </div>
    );
  }

  return (
    <div className="email-templates">
      <div className="email-templates-header">
        <h3>✉️ Templates d'emails juridiques</h3>
        <span className="email-templates-hint">
          {templates.length} template{templates.length > 1 ? 's' : ''} disponible{templates.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="email-templates-list">
        {templates.map((t) => (
          <button key={t.id} className="email-template-card" onClick={() => setActive(t)} type="button">
            <div className="email-template-icon">
              {t.to.role === 'buyer' ? '🛒' : t.to.role === 'seller' ? '🏷️' : '⚖️'}
            </div>
            <div className="email-template-body">
              <strong>{t.label}</strong>
              <small>{t.description}</small>
              {t.to.contact && (
                <small className="email-template-to">
                  → {t.to.contact.name} ({t.to.contact.email || noEmailLabel})
                </small>
              )}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="modal-overlay" onClick={() => setActive(null)}>
          <div className="modal-box email-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{active.label}</h3>
            <div className="email-preview">
              <div className="email-preview-field">
                <label>À :</label>
                <strong>
                  {active.to.contact?.name || active.to.role} (
                  {active.to.contact?.email || noEmailLabel})
                </strong>
              </div>
              <div className="email-preview-field">
                <label>Objet :</label>
                <strong>{active.subject}</strong>
              </div>
              <div className="email-preview-body">
                {active.body}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setActive(null)}>Fermer</button>
              <button type="button" onClick={() => copyToClipboard(`Objet: ${active.subject}\n\n${active.body}`)}>
                📋 Copier
              </button>
              {active.to.contact?.email && (
                <button type="button" onClick={() => openMailClient(active)}>📧 Ouvrir dans mon client</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
