import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ChatView } from "@/app/(app)/chat/ChatView";
import { ChekeoView } from "@/app/(app)/chekeo/ChekeoView";
import { ContactsView } from "@/app/(app)/contacts/ContactsView";
import { TemplatesView } from "@/app/(app)/templates/TemplatesView";
import { InventoryView } from "@/app/(app)/inventory/InventoryView";
import { TeamView } from "@/app/(app)/team/TeamView";
import { NotificationsView } from "@/app/(app)/notifications/NotificationsView";
import { AnalyticsView } from "@/app/(app)/analytics/AnalyticsView";
import { PageStub } from "@/components/PageStub";
import { buildDemoData, DEMO_BASE } from "@/lib/demoData";

export const metadata: Metadata = { title: "cheke.io — demo", robots: { index: false, follow: false } };

// The real app screens, fed fictional data and living inside the real shell,
// so the /demo phone frame shows exactly what a client would see. Saving or
// sending does nothing here (server actions need a signed-in business).
export default async function DemoScreen({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  // eslint-disable-next-line react-hooks/purity -- request-time sample data so "hace 12 min" etc. are relative to now
  const d = buildDemoData(Date.now());

  const views: Record<string, React.ReactNode> = {
    chat: <ChatView businessId="demo" conversations={d.conversations} products={d.products} templates={d.templates} initialSelectedId="conv-1" initialMessages={d.messages} />,
    chekeo: <ChekeoView conversations={d.conversations} />,
    contacts: <ContactsView contacts={d.contacts} />,
    templates: <TemplatesView templates={d.templates} />,
    inventory: <InventoryView products={d.products} conversations={d.conversations} />,
    team: <TeamView business={d.business} members={d.members} currentUserId="u1" />,
    notifications: <NotificationsView notifications={d.notifications} />,
    analytics: <AnalyticsView conversations={d.conversations} products={d.products} />,
    comments: <PageStub title="Comentarios" subtitle="Comentarios en tus publicaciones de Instagram y Facebook" phase="Fase 7 — Comentarios (comentario a mensaje directo)" />,
  };

  return (
    <AppShell businessName={d.business.name} notificationCount={d.notifications.length} basePath={DEMO_BASE}>
      {views[view] ?? <div className="p-8 text-ink-muted">Pantalla no encontrada.</div>}
    </AppShell>
  );
}
