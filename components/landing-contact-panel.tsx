'use client';

import { useState, type FormEvent } from 'react';
import styles from '@/components/landing-page.module.css';

type RequestMode = 'access' | 'demo' | 'contact';

type LandingContactPanelProps = {
  githubUrl: string;
  linkedInUrl: string;
  originLabel?: string;
};

const requestOptions: Array<{
  mode: RequestMode;
  label: string;
  subject: string;
  eyebrow: string;
  blurb: string;
}> = [
  {
    mode: 'access',
    label: 'Request Access',
    subject: 'Request Access',
    eyebrow: 'Access',
    blurb: 'Get portal access and coverage details for your newsroom or team.',
  },
  {
    mode: 'demo',
    label: 'Book a Demo',
    subject: 'Book a Demo',
    eyebrow: 'Demo',
    blurb: 'See the dashboard, benchmark, and map with a guided walkthrough.',
  },
  {
    mode: 'contact',
    label: 'Contact',
    subject: 'General Contact',
    eyebrow: 'Contact',
    blurb: 'Reach out for partnerships, product questions, or media conversations.',
  },
];

const CONTACT_EMAIL = 'worldpressradar@gmail.com';

function getRequestOption(mode: RequestMode) {
  return requestOptions.find((option) => option.mode === mode) || requestOptions[0];
}

export function LandingContactPanel({
  githubUrl,
  linkedInUrl,
  originLabel = 'World Press Radar contact page',
}: LandingContactPanelProps) {
  const [requestMode, setRequestMode] = useState<RequestMode>('access');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const activeOption = getRequestOption(requestMode);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const subjectLead = company.trim() || name.trim() || email.trim();
    const subject = `[WPR] ${activeOption.subject}${subjectLead ? ` - ${subjectLead}` : ''}`;
    const body = [
      `Request type: ${activeOption.label}`,
      `Name: ${name.trim() || '-'}`,
      `Company: ${company.trim() || '-'}`,
      `Work email: ${email.trim() || '-'}`,
      '',
      'Message:',
      notes.trim() || '-',
      '',
      `Sent from the ${originLabel}.`,
    ].join('\n');

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <section className={styles.contactSection} id="contact">
      <div className={styles.contactGrid}>
        <div className={styles.contactLead}>
          <div className="eyebrow">Connect</div>
          <h2>
            <span className={styles.contactHeadingLine}>Request access, book a demo, or</span>
            <span className={styles.contactHeadingLine}>start a conversation.</span>
          </h2>
          <p>
            Use the short form below. We&apos;ll reply with access details, demo scheduling, or the right next step for your team.
          </p>

          <div className={styles.requestPills}>
            {requestOptions.map((option) => {
              const active = option.mode === requestMode;
              return (
                <button
                  type="button"
                  key={option.mode}
                  className={`${styles.requestPill}${active ? ` ${styles.requestPillActive}` : ''}`}
                  onClick={() => setRequestMode(option.mode)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className={styles.requestSummary}>
            <span>{activeOption.eyebrow}</span>
            <strong>{activeOption.label}</strong>
            <p>{activeOption.blurb}</p>
          </div>
        </div>

        <form className={styles.contactForm} onSubmit={handleSubmit}>
          <label className={styles.formField}>
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
            />
          </label>

          <label className={styles.formField}>
            <span>Company</span>
            <input
              type="text"
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Organization or newsroom"
            />
          </label>

          <label className={styles.formField}>
            <span>Work Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
            />
          </label>

          <label className={`${styles.formField} ${styles.formFieldFull}`}>
            <span>What do you need?</span>
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="A short note is enough."
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit" className={styles.formSubmit}>
              {activeOption.label}
            </button>
          </div>
        </form>
      </div>

      <footer className={styles.contactFooter}>
        <a href={linkedInUrl} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </section>
  );
}
