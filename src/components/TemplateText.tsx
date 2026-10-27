import { variableLabel } from "@/lib/whatsappTemplates";

// A Plantilla's text with {{producto}}, {{1}} or {nombre} shown as chips that
// say what goes there ("Producto", "Dato 1") instead of the raw code.
export function TemplateText({ text }: { text: string }) {
  // split with a capture group: odd items are the variable names.
  const parts = text.split(/\{\{\s*([^{}]+?)\s*\}\}|\{\s*(nombre)\s*\}/i);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(parts[i]);
    const key = parts[i + 1] ?? parts[i + 2];
    if (key) {
      out.push(
        <span key={i} className="mx-0.5 inline-block rounded-[5px] bg-brand-tint px-1.5 text-[0.92em] font-semibold text-brand-dark">
          {variableLabel(key)}
        </span>,
      );
    }
  }
  return <>{out}</>;
}
