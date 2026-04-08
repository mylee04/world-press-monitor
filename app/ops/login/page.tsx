import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from '@/components/ops-page.module.css';
import { isOpsConfigured, isValidOpsSessionToken, OPS_DEFAULT_PATH, OPS_SESSION_COOKIE } from '@/lib/ops-auth';

export const metadata: Metadata = {
  title: 'Ops Login | World Press Radar',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type Props = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

function getErrorMessage(code: string | undefined): string | null {
  if (code === 'invalid') return 'Incorrect ops password.';
  if (code === 'config') return 'Ops access is not configured on this deployment yet.';
  return null;
}

export default async function OpsLoginPage({ searchParams }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get(OPS_SESSION_COOKIE)?.value;
  if (isValidOpsSessionToken(token)) {
    redirect(OPS_DEFAULT_PATH);
  }

  const params = (await searchParams) || {};
  const errorMessage = getErrorMessage(params.error);

  return (
    <div className={`page-stack ops-page-root ${styles.root}`}>
      <section className={styles.loginShell}>
        <div className="eyebrow">Private Ops</div>
        <h1>Hidden operations panel.</h1>
        <p>This route is intentionally unlisted. Sign in with the ops password to continue.</p>
        <form className={styles.loginForm} method="post" action="/api/ops/session/">
          <input type="hidden" name="redirectTo" value={OPS_DEFAULT_PATH} />
          <label>
            Ops password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter ops password"
              required
            />
          </label>
          {errorMessage ? <div className={styles.errorText}>{errorMessage}</div> : null}
          {!isOpsConfigured() ? (
            <div className={styles.mutedText}>
              Set <code>WPR_OPS_PASSWORD</code> on the deployment before using this page.
            </div>
          ) : null}
          <button className={styles.loginButton} type="submit">
            Enter Ops
          </button>
        </form>
      </section>
    </div>
  );
}
