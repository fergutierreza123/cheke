import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getConversations, getMessages } from "@/lib/conversations";
import { ChatView } from "./ChatView";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const conversations = await getConversations(business.id);
  const { c } = await searchParams;
  const requested = c && conversations.some((conv) => conv.id === c) ? c : null;
  const firstId = requested ?? conversations[0]?.id ?? null;
  const initialMessages = firstId ? await getMessages(firstId) : [];

  return (
    <ChatView
      businessId={business.id}
      conversations={conversations}
      initialSelectedId={firstId}
      initialMessages={initialMessages}
    />
  );
}
