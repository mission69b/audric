'use client';

import { Suspense } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { DashboardContent } from './dashboard-content';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Suspense>
        <DashboardContent />
      </Suspense>
    </AuthGuard>
  );
}
