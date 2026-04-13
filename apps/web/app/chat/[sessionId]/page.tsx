'use client';

import { Suspense, use } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { DashboardContent } from '@/app/new/dashboard-content';

interface ChatSessionPageProps {
  params: Promise<{ sessionId: string }>;
}

function ChatSessionContent({ params }: ChatSessionPageProps) {
  const { sessionId } = use(params);
  return <DashboardContent initialSessionId={sessionId} />;
}

export default function ChatSessionPage(props: ChatSessionPageProps) {
  return (
    <AuthGuard>
      <Suspense>
        <ChatSessionContent params={props.params} />
      </Suspense>
    </AuthGuard>
  );
}
