import { useMemo } from 'react';
import type { Transaction } from '../types';
import { buildMilestones } from '../utils';

interface GanttChartProps {
  transaction: Transaction;
}

const STAGES = [
  { key: 'compromis', label: 'Compromis', day: 0, icon: '✍️' },
  { key: 'retractation', label: 'Rétractation', day: 10, icon: '✅' },
  { key: 'documents', label: 'Documents notaire', day: 30, icon: '📄' },
  { key: 'loan', label: 'Prêt bancaire', day: 45, icon: '🏦' },
  { key: 'signing', label: 'Signature acte', day: 90, icon: '🏠' }
] as const;

/**
 * Horizontal Gantt-style timeline showing the legal milestones
 * from the compromis date to the acte authentique signing.
 * Pure CSS/SVG — no external dependencies.
 */
export function GanttChart({ transaction }: GanttChartProps) {
  const milestones = useMemo(() => buildMilestones(transaction), [transaction]);
  const totalDays = 90;
  const compromis = new Date(transaction.compromisDate).getTime();

  const stageDates = {
    compromis: new Date(transaction.compromisDate).toISOString().slice(0, 10),
    retractation: milestones.withdrawalDeadline,
    documents: milestones.documentDeadline,
    loan: milestones.loanApprovalDeadline,
    signing: milestones.saleDate
  };

  const getStageStatus = (key: typeof STAGES[number]['key']): 'done' | 'active' | 'upcoming' => {
    const now = Date.now();
    const stageDay = STAGES.find((s) => s.key === key)!.day;
    const dayMs = 86400000;
    const stageDate = new Date(compromis + stageDay * dayMs).getTime();
    if (transaction.completed) return 'done';
    if (key === 'compromis' && transaction.compromisCompleted) return 'done';
    if (key === 'retractation' && transaction.withdrawalStatus === 'complete') return 'done';
    if (key === 'documents' && transaction.documentStatus === 'complete') return 'done';
    if (key === 'loan' && transaction.loanStatus === 'approved') return 'done';
    if (key === 'signing' && transaction.signingStatus === 'completed') return 'done';
    if (stageDate < now) return 'active';
    return 'upcoming';
  };

  const nowOffset = ((Date.now() - compromis) / (totalDays * 86400000)) * 100;

  return (
    <div className="gantt-chart">
      <div className="gantt-header">
        <h3>📅 Timeline juridique du dossier</h3>
        <span className="gantt-sub">Du compromis à l'acte authentique</span>
      </div>

      <div className="gantt-bars">
        {STAGES.map((stage, i) => {
          const status = getStageStatus(stage.key);
          const startPct = (stage.day / totalDays) * 100;
          const endDay = i + 1 < STAGES.length ? STAGES[i + 1].day : totalDays;
          const widthPct = ((endDay - stage.day) / totalDays) * 100;
          return (
            <div key={stage.key} className="gantt-row">
              <div className="gantt-label">
                <span className="gantt-icon">{stage.icon}</span>
                <strong>{stage.label}</strong>
                <small>{stageDates[stage.key]}</small>
              </div>
              <div className="gantt-track">
                <div className={`gantt-bar gantt-bar-${status}`} style={{ left: `${startPct}%`, width: `${widthPct}%` }}>
                  <span className="gantt-bar-label">J+{stage.day}</span>
                </div>
                {status === 'active' && nowOffset >= startPct && nowOffset <= startPct + widthPct && (
                  <div className="gantt-now-marker" style={{ left: `${nowOffset}%` }} title="Aujourd'hui">
                    <div className="gantt-now-line" />
                    <div className="gantt-now-label">Aujourd'hui</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="gantt-axis">
        <span>J+0</span>
        <span>J+30</span>
        <span>J+60</span>
        <span>J+90</span>
      </div>
    </div>
  );
}
