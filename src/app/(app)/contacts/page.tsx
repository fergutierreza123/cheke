import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getContacts } from "@/lib/contacts";
import { ContactsView } from "./ContactsView";

export default async function ContactsPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const contacts = await getContacts(business.id);

  return <ContactsView contacts={contacts} />;
}
