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
import { ChannelsView } from "@/app/(app)/channels/ChannelsView";
import { PageStub } from "@/components/PageStub";
import { WelcomeSplash } from "@/components/WelcomeSplash";
import { AccountView } from "@/app/(app)/account/AccountView";
import { buildDemoData, DEMO_BASE } from "@/lib/demoData";

export const metadata: Metadata = { title: "cheke.io — demo", robots: { index: false, follow: false } };

// The real app screens, fed fictional data and living inside the real shell,
// so the /demo phone frame shows exactly what a client would see. Saving or
// sending does nothing here (server actions need a signed-in business).
export default async function DemoScreen({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ c?: string; welcome?: string }>;
}) {
  const { view } = await params;
  const { c, welcome } = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- request-time sample data so "hace 12 min" etc. are relative to now
  const nowMs = Date.now();
  const d = buildDemoData(nowMs);

  const views: Record<string, React.ReactNode> = {
    chat: <ChatView businessId="demo" storeIds={d.business.scopeStoreIds} conversations={d.conversations} products={d.products} templates={d.templates} initialSelectedId="conv-1" initialMessages={d.messages} startInThread={Boolean(c)} />,
    chekeo: <ChekeoView conversations={d.conversations} />,
    contacts: <ContactsView contacts={d.contacts} />,
    templates: <TemplatesView templates={d.templates} />,
    inventory: <InventoryView products={d.products} conversations={d.conversations} />,
    team: <TeamView business={d.business} members={d.members} currentUserId="u1" demo />,
    notifications: <NotificationsView notifications={d.notifications} />,
    channels: (
      <ChannelsView
        channels={d.channels}
        sections={[{ storeId: d.business.scopeStoreIds[0], name: d.business.name, canManage: false }]}
        isOwner={false}
        meta={null}
        messaging={null}
      />
    ),
    analytics: <AnalyticsView conversations={d.conversations} />,
    account: (
      <AccountView
        user={{ name: "Fernando Gutiérrez", email: "fernando@cheke.io", phone: "+504 9999-0000" }}
        lastSignIn={new Date(nowMs - 3_600_000).toISOString()}
        business={{ name: d.business.name, plan: "pro", role: "owner" }}
        demo
      />
    ),
    comments: <PageStub title="Comentarios" subtitle="Comentarios en tus publicaciones de Instagram y Facebook" phase="Fase 7 — Comentarios (comentario a mensaje directo)" />,
  };

  return (
    <AppShell
      businessName={d.business.name}
      notificationCount={d.notifications.length}
      basePath={DEMO_BASE}
      user={{ name: "Fernando Gutiérrez", email: "fernando@cheke.io" }}
    >
      {welcome && <WelcomeSplash firstName="Fernando" businessName={d.business.name} />}
      {views[view] ?? <div className="p-8 text-ink-muted">Pantalla no encontrada.</div>}
    </AppShell>
  );
}
