import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <Sidebar businessName={business.name} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
