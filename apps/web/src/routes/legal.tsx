import type { ReactNode } from "react";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-2xl px-6 py-14 text-[14px] leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-fg [&_p]:mb-3 [&_li]:mb-1 [&_ul]:list-disc [&_ul]:pl-5">
        <div className="mb-1 text-xs uppercase tracking-wider text-subtle">Otopio ERP</div>
        <h1 className="mb-6 text-[26px] font-semibold tracking-tight text-fg">{title}</h1>
        {children}
        <p className="mt-10 text-xs text-subtle">Dernière mise à jour : 16 novembre 2026 · Contact : contact@otopio.ca</p>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Politique de confidentialité">
      <p>Otopio ERP (erp.otopio.ca) est l'outil de gestion interne d'Otopio Inc. (Montréal, Québec). Il est réservé aux membres de l'équipe Otopio et n'est pas offert au public.</p>
      <h2>Données Google consultées</h2>
      <p>Lorsqu'un membre de l'équipe connecte un compte Google, l'application peut accéder, avec son consentement explicite, à ses courriels Gmail et à leurs paramètres (libellés, filtres), à ses fichiers Google Drive et à son agenda Google.</p>
      <h2>Utilisation</h2>
      <ul>
        <li>Classer, étiqueter et filtrer les courriels professionnels ;</li>
        <li>Rattacher courriels, documents et rendez-vous aux clients et projets de l'entreprise ;</li>
        <li>Produire des résumés internes pour l'équipe.</li>
      </ul>
      <p>Les données ne sont ni vendues, ni partagées avec des tiers, ni utilisées à des fins publicitaires. L'utilisation des données reçues des API Google respecte la <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, y compris ses exigences d'utilisation limitée (Limited Use).</p>
      <h2>Conservation et sécurité</h2>
      <p>Les jetons d'accès sont chiffrés (AES-256-GCM) et stockés sur l'infrastructure d'Otopio. Ils ne sont accessibles qu'au membre qui a connecté le compte. L'accès peut être révoqué à tout moment dans l'ERP (Paramètres → Comptes Google personnels) ou sur myaccount.google.com/permissions ; les jetons sont alors supprimés.</p>
      <h2>Contact</h2>
      <p>Pour toute question ou demande de suppression : contact@otopio.ca.</p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Conditions d'utilisation">
      <p>Otopio ERP est un outil interne d'Otopio Inc. Son accès est limité aux membres autorisés de l'équipe Otopio.</p>
      <h2>Usage</h2>
      <p>L'outil sert à la gestion des clients, projets, documents, factures et communications de l'entreprise. Chaque utilisateur est responsable des comptes qu'il y connecte et peut les déconnecter à tout moment.</p>
      <h2>Responsabilité</h2>
      <p>L'outil est fourni tel quel, pour un usage interne. Otopio Inc. ne peut être tenue responsable d'une interruption de service des fournisseurs tiers (Google, Cloudflare, etc.).</p>
      <h2>Contact</h2>
      <p>contact@otopio.ca</p>
    </Page>
  );
}
