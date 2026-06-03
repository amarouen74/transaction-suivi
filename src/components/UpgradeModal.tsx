import { useState } from 'react';

interface UpgradeModalProps {
  onClose: () => void;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

const stripePublishableKey = (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY;
const stripeEnabled = typeof stripePublishableKey === 'string' && stripePublishableKey.startsWith('pk_');

/**
 * Upgrade-to-Pro modal. Stub for Stripe Checkout integration.
 * When VITE_STRIPE_PUBLISHABLE_KEY is set, this would call
 * stripe.redirectToCheckout({ sessionId }).
 * Without the key, it explains what's needed to enable payments.
 */
export function UpgradeModal({ onClose, onNotify }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!stripeEnabled) {
      onNotify(
        '💳 Stripe non configuré. Ajoutez VITE_STRIPE_PUBLISHABLE_KEY dans .env et créez un endpoint /api/create-checkout-session pour activer le paiement.',
        'error'
      );
      return;
    }
    setLoading(true);
    try {
      // TODO: call your backend to create a Stripe Checkout Session
      // const res = await fetch('/api/create-checkout-session', { method: 'POST' });
      // const { sessionId, url } = await res.json();
      // window.location.href = url;
      onNotify('Paiement Stripe bientôt disponible — backend requis.', 'success');
    } catch (e: any) {
      onNotify(`Erreur: ${e?.message || e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button">×</button>
        <div className="upgrade-header">
          <span className="upgrade-crown">👑</span>
          <h2>Passer au plan Pro</h2>
          <p>Débloquez toutes les fonctionnalités pour 19 €/mois</p>
        </div>
        <ul className="upgrade-features">
          <li>✅ Dossiers de vente illimités</li>
          <li>✅ Upload de documents (compromis, diagnostics, etc.)</li>
          <li>✅ Templates d'emails juridiques (prêt, notaire, vendeur)</li>
          <li>✅ Vue Gantt + Kanban pour vos dossiers</li>
          <li>✅ Export PDF de la timeline</li>
          <li>✅ Support prioritaire sous 24h</li>
        </ul>
        <div className="upgrade-price">
          <span className="upgrade-price-amount">19 €</span>
          <span className="upgrade-price-period">/ mois HT</span>
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose}>Plus tard</button>
          <button type="button" onClick={handleCheckout} disabled={loading}>
            {loading ? '⏳ Redirection...' : stripeEnabled ? '💳 Procéder au paiement' : '💳 Paiement bientôt disponible'}
          </button>
        </div>
        {!stripeEnabled && (
          <p className="upgrade-note">
            🔧 Pour activer le paiement, configurez Stripe (voir <code>.env.example</code>).
          </p>
        )}
      </div>
    </div>
  );
}
