import { useMemo, useState } from 'react';
import type { Transaction, TransactionStage } from '../types';
import { getDealStatus, statusLabelClass } from '../utils';

interface KanbanBoardProps {
  transactions: Transaction[];
  onSelect: (id: string) => void;
  onUpdateStage?: (id: string, stage: TransactionStage) => void;
}

const COLUMNS: { stage: TransactionStage; label: string; icon: string; color: string }[] = [
  { stage: 'compromis', label: 'Compromis', icon: '✍️', color: '#3b82f6' },
  { stage: 'withdrawal', label: 'Rétractation', icon: '✅', color: '#8b5cf6' },
  { stage: 'loan', label: 'Prêt en cours', icon: '🏦', color: '#f59e0b' },
  { stage: 'documents', label: 'Documents', icon: '📄', color: '#06b6d4' },
  { stage: 'signing_prep', label: 'Prépa signature', icon: '🔧', color: '#10b981' },
  { stage: 'signing', label: 'Signature', icon: '🏠', color: '#16a34a' },
  { stage: 'completed', label: 'Signés', icon: '🎉', color: '#6b7280' }
];

/**
 * Drag-and-drop Kanban view of all deals grouped by current stage.
 * Uses native HTML5 drag-and-drop API — no external dependencies.
 */
export function KanbanBoard({ transactions, onSelect, onUpdateStage }: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TransactionStage | null>(null);

  const dealsByStage = useMemo(() => {
    const map: Partial<Record<TransactionStage, Transaction[]>> = {};
    for (const col of COLUMNS) {
      map[col.stage] = transactions.filter((t) => {
        if (t.completed) return col.stage === 'completed';
        if (col.stage === 'withdrawal' && t.currentStage === 'withdrawal') return true;
        if (col.stage === 'signing_prep' && t.currentStage === 'signing_prep') return true;
        return t.currentStage === col.stage;
      });
    }
    return map;
  }, [transactions]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, stage: TransactionStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(stage);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = (e: React.DragEvent, stage: TransactionStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id && onUpdateStage) onUpdateStage(id, stage);
    setDraggedId(null);
    setDragOverCol(null);
  };

  const totalValue = (stage: TransactionStage) =>
    (dealsByStage[stage] ?? []).reduce((sum, t) => sum + (t.price || 0), 0);

  return (
    <div className="kanban-board">
      <div className="kanban-header">
        <h3>📋 Vue Kanban des dossiers</h3>
        <span className="kanban-sub">Glissez-déposez pour changer l'étape d'un dossier</span>
      </div>
      <div className="kanban-columns">
        {COLUMNS.map((col) => {
          const cards = dealsByStage[col.stage] ?? [];
          return (
            <div
              key={col.stage}
              className={`kanban-col ${dragOverCol === col.stage ? 'kanban-col-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, col.stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.stage)}
            >
              <div className="kanban-col-header" style={{ borderTopColor: col.color }}>
                <span className="kanban-col-icon">{col.icon}</span>
                <strong>{col.label}</strong>
                <span className="kanban-col-count">{cards.length}</span>
              </div>
              {cards.length > 0 && (
                <div className="kanban-col-total">{totalValue(col.stage).toLocaleString('fr-FR')} €</div>
              )}
              <div className="kanban-cards">
                {cards.length === 0 ? (
                  <div className="kanban-empty">Aucun dossier</div>
                ) : (
                  cards.map((t) => {
                    const status = getDealStatus(t);
                    return (
                      <div
                        key={t.id}
                        className={`kanban-card ${draggedId === t.id ? 'kanban-card-dragging' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onClick={() => onSelect(t.id)}
                      >
                        <div className="kanban-card-title">{t.property}</div>
                        <div className="kanban-card-meta">
                          <span className="kanban-card-price">{t.price.toLocaleString('fr-FR')} €</span>
                          <span className={`status-pill ${statusLabelClass(status)}`}>
                            {status === 'active' ? 'En cours' : status === 'at risk' ? 'Bloqué' : status === 'closing soon' ? 'Proche' : 'Signé'}
                          </span>
                        </div>
                        <div className="kanban-card-people">
                          👤 {t.buyer} → {t.seller}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
