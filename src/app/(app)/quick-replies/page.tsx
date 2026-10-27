import { redirect } from "next/navigation";

// Respuestas rápidas moved under Plantillas; old links keep working.
export default function OldQuickRepliesPage() {
  redirect("/templates/respuestas");
}
