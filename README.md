# Transaction Suivi App

Application de suivi des ventes immobilières pour agents français, du compromis à l'acte authentique.

🌐 **Démo en ligne** : [transaction-suivi-oezn.vercel.app](https://transaction-suivi-oezn.vercel.app/?demo)

---

## ✨ Fonctionnalités

### Pour les agents immobiliers
- **Suivi complet du cycle de vente** : compromis → rétractation → financement → documents notaire → signature acte authentique
- **Calcul automatique des délais légaux français** :
  - J+10 : délai de rétractation SRU
  - J+30 : transmission des pièces au notaire
  - J+45 : condition suspensive de prêt
  - J+90 : date estimée de signature
- **Alertes critiques** en temps réel sur les dossiers en retard
- **Vue Gantt chart** de chaque dossier avec position "Aujourd'hui"
- **Vue Kanban** drag-and-drop pour visualiser tous les dossiers par étape
- **Upload de documents** (compromis, diagnostics, etc.) via Supabase Storage
- **Templates d'emails juridiques** pré-écrits (relance acheteur, notaire, vendeur)
- **Export PDF** de la timeline d'un dossier
- **Dashboard analytique** : santé globale du portefeuille, alertes, échéances

### Démo & onboarding
- **Mode démo** sans inscription : 3 dossiers réalistes pré-chargés (Lyon, Marseille, Paris)
- **Story-driven walkthrough** : scénario interactif de l'appartement de Lyon, du compromis à l'acte
- **Migration automatique** : un seul clic pour passer du mode démo à un compte Supabase (avec sauvegarde des dossiers)

### Compte & tarification
- **Authentification Supabase** (email + password)
- **Mode multi-utilisateurs** avec isolation des données (RLS Supabase)
- **Plan Gratuit** : 1 dossier suivi
- **Plan Pro** (19 €/mois HT) : dossiers illimités, upload, templates, PDF, support prioritaire

---

## 🏗 Architecture technique

- **Frontend** : React 18 + TypeScript + Vite
- **Backend / DB** : Supabase (PostgreSQL + Auth + Storage)
- **PDF** : jsPDF
- **Routing interne** : state-based (single page, no React Router)
- **State** : hooks natifs (useState, useMemo, useEffect)

### Structure des fichiers
```
src/
├── App.tsx                  # Composant racine (UI + state)
├── main.tsx                 # Entry point
├── api.ts                   # Wrapper Supabase (auth, CRUD)
├── supabaseClient.ts        # Init Supabase
├── types.ts                 # Types TypeScript
├── utils.ts                 # Helpers (buildMilestones, getDealStatus, etc.)
├── reminderEngine.ts        # Génération des alertes
├── validation.ts            # Validation (Zod-ready)
├── data/
│   └── demoData.ts          # 3 transactions + 9 contacts + FAQ
├── components/
│   ├── GanttChart.tsx       # Timeline visuelle d'un dossier
│   ├── KanbanBoard.tsx      # Vue Kanban drag-and-drop
│   ├── FileUpload.tsx       # Upload Supabase Storage
│   ├── EmailTemplateSelector.tsx  # Templates d'emails juridiques
│   └── UpgradeModal.tsx     # Modal d'upgrade Pro (Stripe stub)
├── lib/
│   ├── storage.ts           # Helpers Supabase Storage
│   └── emailTemplates.ts    # Templates pré-écrits (droit français)
└── styles.css               # CSS global
```

---

## 🚀 Run locally

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env
# → Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 3. Créer les tables Supabase
# → Copier le contenu de supabase/schema.sql dans l'éditeur SQL Supabase
# → Activer Row Level Security

# 4. (Optionnel) Créer le bucket Storage "deal-documents"

# 5. Lancer le dev server
npm run dev
```

L'app est accessible sur `http://localhost:5173`. Ajouter `?demo` pour démarrer directement en mode démo.

---

## 📦 Déploiement (Vercel)

```bash
# Variables d'environnement à définir :
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...   # Optionnel, pour le paiement Pro
```

Build command : `npm run build` — Output : `dist/`

---

## 💳 Activer Stripe (plan Pro)

1. Créer un compte [Stripe](https://stripe.com)
2. Dans `.env`, ajouter `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`
3. Créer un endpoint backend `/api/create-checkout-session` qui crée une Stripe Checkout Session
4. L'UpgradeModal appellera automatiquement Stripe au clic sur "Procéder au paiement"

Pour l'instant, l'UpgradeModal affiche un message d'instruction si Stripe n'est pas configuré.

---

## 📋 Roadmap

- [x] **Phase 1 (juin 2026)** : Refactoring architectural, Gantt chart, Kanban, upload docs, templates emails, stub Stripe
- [ ] **Phase 2** : Multi-tenant agences, invitations, rôles, logs d'activité
- [ ] **Phase 3** : Signature électronique intégrée (Yousign / DocuSign)
- [ ] **Phase 4** : OCR automatique des compromis PDF
- [ ] **Phase 5** : Intégrations portails (SeLoger, LeBonCoin, Bien'ici)
- [ ] **Phase 6** : App mobile (React Native)

---

## 🔒 Conformité & sécurité

- ✅ **RGPD** : données stockées en Europe (Supabase EU)
- ✅ **Droit français** : délais légaux SRU intégrés
- ✅ **Row Level Security** : isolation des données par utilisateur
- ✅ **Pas de faux chiffres** sur la landing page (conformité publicité)
- ⚠️ Les données de démo disparaissent au rafraîchissement (par design)

---

## 📄 Licence

Propriétaire © 2026 — Tous droits réservés.
