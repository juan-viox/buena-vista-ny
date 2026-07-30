// ============================================================
// /login — operator sign-in for VioX AI OS.
// Renders as a full-screen overlay above the Shell chrome (the
// root layout wraps every route), so no layout restructuring is
// needed and flag-off deployments are untouched.
// ============================================================

import type { Metadata } from 'next';
import { AuthPanel } from '@viox/ui';

export const metadata: Metadata = {
  title: 'Sign in — VioX AI OS',
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--bg)] px-4 py-10">
      <AuthPanel productName="VioX AI OS" subtitle="Buena Vista Restaurant & Bar" />
    </div>
  );
}
