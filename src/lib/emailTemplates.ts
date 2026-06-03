import type { Transaction, Contact } from '../types';
import { buildMilestones } from '../utils';

export interface EmailTemplate {
  id: string;
  label: string;
  description: string;
  to: { role: 'buyer' | 'seller' | 'notaire'; contact?: Contact };
  subject: string;
  body: string;
}

const formatDate = (iso?: string): string => {
  if (!iso) return '[date]';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const findContact = (contacts: Contact[], id?: string) => contacts.find((c) => c.id === id);

/**
 * Pre-written legal email templates for French real estate deal follow-up.
 * Each template generates a subject + body ready to copy-paste or send.
 */
export function buildEmailTemplates(transaction: Transaction, contacts: Contact[]): EmailTemplate[] {
  const milestones = buildMilestones(transaction);
  const buyer = findContact(contacts, transaction.buyerId);
  const seller = findContact(contacts, transaction.sellerId);
  const notaire = findContact(contacts, transaction.notaireId);

  const templates: EmailTemplate[] = [];

  // 1) Relance acheteur pour le prêt
  if (transaction.loanStatus === 'pending') {
    templates.push({
      id: 'buyer-loan',
      label: 'Relance acheteur — prêt en attente',
      description: 'Demander où en est le dossier bancaire de l\'acheteur',
      to: { role: 'buyer', contact: buyer },
      subject: `[${transaction.property}] Suivi de votre demande de prêt`,
      body: `Bonjour ${buyer?.name || 'Madame, Monsieur'},

Je reviens vers vous concernant votre demande de prêt pour l'acquisition du bien situé au ${transaction.property}.

L'échéance de la condition suspensive de prêt est fixée au ${formatDate(milestones.loanApprovalDeadline)}. Pourriez-vous me tenir informé(e) de l'avancement de votre dossier bancaire et, le cas échéant, me transmettre votre offre de prêt dès réception ?

Cette information est importante pour permettre à l'étude notariale de ${notaire?.name || 'votre notaire'} de planifier la signature de l'acte authentique dans les meilleurs délais.

Je reste disponible pour tout échange.

Cordialement,
Votre agent immobilier`
    });
  }

  // 2) Relance acheteur — documents manquants
  if (transaction.documentStatus !== 'complete') {
    templates.push({
      id: 'buyer-docs',
      label: 'Relance acheteur — documents manquants',
      description: 'Demander les pièces manquantes pour le dossier notaire',
      to: { role: 'buyer', contact: buyer },
      subject: `[${transaction.property}] Pièces manquantes pour le dossier notaire`,
      body: `Bonjour ${buyer?.name || 'Madame, Monsieur'},

Dans le cadre de notre transaction pour le bien situé au ${transaction.property}, et afin de permettre à l'étude de ${notaire?.name || 'votre notaire'} de finaliser le dossier en vue de la signature, je vous remercie de bien vouloir me transmettre dans les meilleurs délais les pièces qui pourraient encore manquer.

L'échéance réglementaire de transmission des pièces au notaire est fixée au ${formatDate(milestones.documentDeadline)}.

Pourriez-vous me confirmer par retour de mail la liste des documents que vous pensez avoir déjà envoyés, et ceux qu'il vous reste à fournir ?

Je reste à votre disposition pour toute question.

Cordialement,
Votre agent immobilier`
    });
  }

  // 3) Relance acheteur — prêt refusé
  if (transaction.loanStatus === 'refused') {
    templates.push({
      id: 'buyer-loan-refused',
      label: 'Urgence — prêt refusé',
      description: 'Proposer des solutions alternatives suite à un refus bancaire',
      to: { role: 'buyer', contact: buyer },
      subject: `[URGENT — ${transaction.property}] Recherche d'un financement alternatif`,
      body: `Bonjour ${buyer?.name || 'Madame, Monsieur'},

Suite au refus de votre demande de prêt par votre banque, je me permets de revenir vers vous pour évoquer ensemble les solutions envisageables afin de ne pas perdre cette opportunité d'acquisition.

Plusieurs pistes peuvent être explorées :
- Solliciter un autre établissement bancaire (banque en ligne, courtier)
- Faire une nouvelle demande avec un apport plus important
- Étudier les prêts aidés (PTZ, prêt Action Logement)

L'échéance de la condition suspensive est ${formatDate(milestones.loanApprovalDeadline)}. Au-delà de cette date et sans accord de prêt, le compromis sera caduc et la vente annulée.

Je vous propose de nous rencontrer rapidement pour faire le point. Êtes-vous disponible cette semaine ?

Cordialement,
Votre agent immobilier`
    });
  }

  // 4) Relance notaire — documents en attente
  if (transaction.documentStatus !== 'complete' || transaction.notaireStatus === 'not started') {
    templates.push({
      id: 'notaire-docs',
      label: 'Relance notaire — état du dossier',
      description: 'Demander au notaire où en est le dossier',
      to: { role: 'notaire', contact: notaire },
      subject: `Dossier ${transaction.property} — ${transaction.buyer} / ${transaction.seller}`,
      body: `Maître ${notaire?.name || ''},

Je me permets de revenir vers vous concernant le dossier de ${transaction.buyer} et ${transaction.seller} pour le bien situé au ${transaction.property}.

Pourriez-vous m'indiquer où en est l'avancement de ce dossier et, le cas échéant, la liste des pièces qu'il vous manque encore ?

L'échéance réglementaire de transmission des pièces est fixée au ${formatDate(milestones.documentDeadline)}, et la signature de l'acte authentique est envisagée le ${formatDate(milestones.saleDate)}.

Je vous remercie par avance pour votre retour.

Confraternellement,
Votre agent immobilier`
    });
  }

  // 5) Confirmation signature au vendeur
  if (transaction.signingScheduledDate && !transaction.completed) {
    templates.push({
      id: 'seller-signing',
      label: 'Confirmation signature au vendeur',
      description: 'Confirmer la date de signature au vendeur',
      to: { role: 'seller', contact: seller },
      subject: `[${transaction.property}] Confirmation de la date de signature`,
      body: `Bonjour ${seller?.name || 'Madame, Monsieur'},

Je reviens vers vous pour vous confirmer que la signature de l'acte authentique de vente de votre bien situé au ${transaction.property} est prévue le ${formatDate(transaction.signingScheduledDate)} en l'étude de Maître ${notaire?.name || ''}.

Merci de bien vouloir vous munir des pièces suivantes le jour J :
- Pièce d'identité en cours de validité
- Livret de famille (le cas échéant)
- Justificatif de domicile récent
- Taxe foncière

Pourriez-vous me confirmer votre disponibilité pour cette date ?

Cordialement,
Votre agent immobilier`
    });
  }

  return templates;
}
