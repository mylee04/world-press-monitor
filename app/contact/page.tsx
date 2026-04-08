import { LandingContactPanel } from '@/components/landing-contact-panel';

export default function ContactPage() {
  const githubUrl = 'https://github.com/mylee04/world-press-radar';
  const linkedInUrl = process.env.NEXT_PUBLIC_WPR_LINKEDIN_URL || 'https://www.linkedin.com/company/world-press-radar/';

  return (
    <div className="page-stack contact-page-root">
      <LandingContactPanel
        githubUrl={githubUrl}
        linkedInUrl={linkedInUrl}
        originLabel="World Press Radar contact page"
      />
    </div>
  );
}
