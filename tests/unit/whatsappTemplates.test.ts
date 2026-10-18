import { describe, expect, it } from "vitest";
import { explainWhatsAppError } from "@/lib/whatsappErrors";
import {
  buildCreateTemplateRequest,
  buildTemplateMessage,
  parseMetaTemplates,
  rejectedReasonText,
  savedReplyToMetaBody,
  templateSlug,
  templateStatusLabel,
  validateNewTemplate,
  suggestedValues,
  renderTemplate,
  templateProblem,
  templateVariables,
  validateTemplateValues,
  type WhatsAppTemplate,
} from "@/lib/whatsappTemplates";

// A template as Meta returns it from GET /{waba_id}/message_templates.
function template(body: string, extra: Partial<WhatsAppTemplate> = {}): WhatsAppTemplate {
  return {
    id: "wt-1",
    name: "seguimiento",
    language: "es",
    status: "APPROVED",
    category: "UTILITY",
    components: [{ type: "BODY", text: body }],
    ...extra,
  };
}

describe("templateVariables", () => {
  it("lists the {{1}}, {{2}}… placeholders of the body in order, once each", () => {
    expect(templateVariables(template("Hola {{1}}, tu pedido {{2}} está listo. Gracias {{1}}."))).toEqual(["1", "2"]);
  });

  it("also reads named placeholders", () => {
    expect(templateVariables(template("Hola {{nombre}}, tu {{producto}} llegó."))).toEqual(["nombre", "producto"]);
  });

  it("a template without placeholders has none", () => {
    expect(templateVariables(template("¡Gracias por tu compra!"))).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("puts the values in the body, the way the customer will read it", () => {
    expect(renderTemplate(template("Hola {{1}}, tu pedido {{2}} está listo."), { "1": "Ana", "2": "#45" })).toBe(
      "Hola Ana, tu pedido #45 está listo.",
    );
  });

  it("includes a text header and the footer around the body", () => {
    const t = template("Tu pedido {{1}} va en camino.", {
      components: [
        { type: "HEADER", format: "TEXT", text: "Envío" },
        { type: "BODY", text: "Tu pedido {{1}} va en camino." },
        { type: "FOOTER", text: "Tienda Luna" },
      ],
    });
    expect(renderTemplate(t, { "1": "#7" })).toBe("Envío\n\nTu pedido #7 va en camino.\n\nTienda Luna");
  });

  it("keeps a placeholder that has no value yet, so the preview shows what's missing", () => {
    expect(renderTemplate(template("Hola {{1}}"), {})).toBe("Hola {{1}}");
  });
});

describe("suggestedValues", () => {
  it("fills {{1}} with the customer's first name after a greeting", () => {
    expect(suggestedValues(template("Hola {{1}}, ¿sigues interesada en la blusa?"), "Ana María López")).toEqual({ "1": "Ana" });
    expect(suggestedValues(template("Buenos días {{1}}. Tu pedido {{2}} llegó."), "juan pérez")).toEqual({ "1": "Juan" });
  });

  it("fills a variable called nombre / name wherever it is", () => {
    expect(suggestedValues(template("Tu pedido llegó, {{nombre}}. Gracias."), "Carla")).toEqual({ nombre: "Carla" });
  });

  it("leaves {{1}} empty when it isn't clearly the name", () => {
    expect(suggestedValues(template("Tu pedido {{1}} está listo."), "Ana")).toEqual({});
  });

  it("never uses a phone number or a blank name", () => {
    expect(suggestedValues(template("Hola {{1}}"), "+504 9922-3843")).toEqual({});
    expect(suggestedValues(template("Hola {{1}}"), "  ")).toEqual({});
  });
});

describe("validateTemplateValues", () => {
  const t = template("Hola {{1}}, tu pedido {{2}} está listo.");

  it("is fine when every variable has a value", () => {
    expect(validateTemplateValues(t, { "1": "Ana", "2": "#45" })).toBeNull();
  });

  it("asks for the missing ones, in plain Spanish", () => {
    expect(validateTemplateValues(t, { "1": "Ana", "2": "  " })).toBe("Completa el dato {{2}} antes de enviar.");
    expect(validateTemplateValues(t, {})).toBe("Completa los datos {{1}} y {{2}} antes de enviar.");
  });

  it("refuses line breaks, tabs and long runs of spaces (Meta rejects them in a variable)", () => {
    expect(validateTemplateValues(t, { "1": "Ana\nMaría", "2": "#45" })).toMatch(/saltos de línea/);
    expect(validateTemplateValues(t, { "1": "Ana     María", "2": "#45" })).toMatch(/saltos de línea/);
  });
});

describe("templateProblem", () => {
  it("an approved text template can be sent from cheke", () => {
    expect(templateProblem(template("Hola {{1}}"))).toBeNull();
  });

  it("only approved templates can be sent", () => {
    expect(templateProblem(template("Hola", { status: "PENDING" }))).toMatch(/revisión/);
    expect(templateProblem(template("Hola", { status: "PAUSED" }))).toMatch(/pausada/);
  });

  it("templates that need a photo, video, document or a link variable are sent from WhatsApp instead", () => {
    const withImage = template("Hola", {
      components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hola" }],
    });
    expect(templateProblem(withImage)).toMatch(/foto, video o documento/);
    const withLinkVar = template("Hola", {
      components: [
        { type: "BODY", text: "Hola" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://x.hn/{{1}}" }] },
      ],
    });
    expect(templateProblem(withLinkVar)).toMatch(/botón/);
    const headerVar = template("Hola", {
      components: [{ type: "HEADER", format: "TEXT", text: "Pedido {{1}}" }, { type: "BODY", text: "Hola" }],
    });
    expect(templateProblem(headerVar)).toMatch(/encabezado/);
  });
});

describe("buildTemplateMessage", () => {
  it("builds the Cloud API template message with the body values in order", () => {
    expect(buildTemplateMessage("+504 9922-3843", template("Hola {{1}}, tu pedido {{2}}."), { "2": "#45", "1": "Ana" })).toEqual({
      messaging_product: "whatsapp",
      to: "50499223843",
      type: "template",
      template: {
        name: "seguimiento",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ana" },
              { type: "text", text: "#45" },
            ],
          },
        ],
      },
    });
  });

  it("names each value for a template with named variables", () => {
    const msg = buildTemplateMessage("99223843", template("Hola {{nombre}}"), { nombre: "Ana" });
    expect(msg.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", parameter_name: "nombre", text: "Ana" }] },
    ]);
  });

  it("sends no components for a template without variables", () => {
    const msg = buildTemplateMessage("99223843", template("¡Gracias por tu compra!"), {});
    expect(msg.template).toEqual({ name: "seguimiento", language: { code: "es" } });
  });

  it("trims the values", () => {
    const msg = buildTemplateMessage("99223843", template("Hola {{1}}"), { "1": "  Ana " });
    expect(msg.template.components?.[0].parameters[0].text).toBe("Ana");
  });
});

describe("templateSlug", () => {
  it("turns a Plantilla's name into a name WhatsApp accepts", () => {
    expect(templateSlug("Precio con envío")).toBe("precio_con_envio");
    expect(templateSlug("  ¡Seguimiento #2!  ")).toBe("seguimiento_2");
  });

  it("never starts with a number and is never empty", () => {
    expect(templateSlug("2x1 julio")).toBe("plantilla_2x1_julio");
    expect(templateSlug("🎉")).toBe("plantilla");
  });
});

describe("savedReplyToMetaBody", () => {
  it("numbers cheke's {{variables}} and {nombre} the way WhatsApp wants them", () => {
    expect(savedReplyToMetaBody("Hola {nombre}, la {{producto}} cuesta {{precio}}. ¿Te reservo la {{producto}}?")).toEqual({
      text: "Hola {{1}}, la {{2}} cuesta {{3}}. ¿Te reservo la {{2}}?",
      variables: ["nombre", "producto", "precio"],
    });
  });

  it("leaves a text without variables as it is", () => {
    expect(savedReplyToMetaBody("Gracias por tu compra")).toEqual({ text: "Gracias por tu compra", variables: [] });
  });
});

describe("validateNewTemplate", () => {
  const ok = { name: "seguimiento", category: "UTILITY", body: "Hola {{1}}, tu pedido está listo.", examples: ["Ana"] };

  it("accepts a simple template", () => {
    expect(validateNewTemplate(ok)).toBeNull();
  });

  it("asks for the message and a valid category", () => {
    expect(validateNewTemplate({ ...ok, body: " " })).toMatch(/mensaje/);
    expect(validateNewTemplate({ ...ok, category: "AUTHENTICATION" })).toMatch(/tipo/);
  });

  it("refuses a variable at the very start or end (WhatsApp rejects those)", () => {
    expect(validateNewTemplate({ ...ok, body: "{{1}}, tu pedido está listo." })).toMatch(/empiece ni termine/);
    expect(validateNewTemplate({ ...ok, body: "Tu pedido está listo, {{1}}." })).toMatch(/empiece ni termine/);
  });

  it("needs an example for every variable", () => {
    expect(validateNewTemplate({ ...ok, examples: [" "] })).toMatch(/ejemplo/);
  });

  it("caps the length at WhatsApp's 1024 characters", () => {
    expect(validateNewTemplate({ ...ok, body: `Hola {{1}} ${"a".repeat(1100)}` })).toMatch(/1024/);
  });
});

describe("buildCreateTemplateRequest", () => {
  it("builds the request Meta reviews, in Spanish, with the examples", () => {
    expect(
      buildCreateTemplateRequest({ name: "seguimiento", category: "UTILITY", body: "Hola {{1}}, tu pedido {{2}} llegó.", examples: ["Ana", "#45"] }),
    ).toEqual({
      name: "seguimiento",
      language: "es",
      category: "UTILITY",
      parameter_format: "positional",
      components: [{ type: "BODY", text: "Hola {{1}}, tu pedido {{2}} llegó.", example: { body_text: [["Ana", "#45"]] } }],
    });
  });

  it("sends no example for a template without variables", () => {
    expect(buildCreateTemplateRequest({ name: "gracias", category: "MARKETING", body: "¡Gracias!", examples: [] }).components).toEqual([
      { type: "BODY", text: "¡Gracias!" },
    ]);
  });
});

describe("parseMetaTemplates", () => {
  it("keeps what cheke needs from Meta's list and skips broken rows", () => {
    const rows = parseMetaTemplates({
      data: [
        { id: "1", name: "seguimiento", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hola {{1}}" }] },
        { id: "2", name: "promo", language: "es_MX", status: "REJECTED", category: "MARKETING", rejected_reason: "PROMOTIONAL", components: [] },
        { id: "3", status: "APPROVED" },
      ],
    });
    expect(rows).toEqual([
      { meta_template_id: "1", name: "seguimiento", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hola {{1}}" }], rejected_reason: null },
      { meta_template_id: "2", name: "promo", language: "es_MX", status: "REJECTED", category: "MARKETING", components: [], rejected_reason: "PROMOTIONAL" },
    ]);
  });

  it("an empty or broken answer gives no rows", () => {
    expect(parseMetaTemplates(null)).toEqual([]);
    expect(parseMetaTemplates({ data: "x" })).toEqual([]);
  });
});

describe("status in plain Spanish", () => {
  it("names each review state", () => {
    expect(templateStatusLabel("PENDING")).toBe("En revisión");
    expect(templateStatusLabel("APPROVED")).toBe("Aprobada");
    expect(templateStatusLabel("REJECTED")).toBe("Rechazada");
    expect(templateStatusLabel("PAUSED")).toBe("Pausada");
  });

  it("explains why WhatsApp rejected it", () => {
    expect(rejectedReasonText("PROMOTIONAL")).toMatch(/promoción/);
    expect(rejectedReasonText("INVALID_FORMAT")).toMatch(/formato/);
    expect(rejectedReasonText("NONE")).toBeNull();
    expect(rejectedReasonText(null)).toBeNull();
  });
});

describe("template send errors in plain Spanish", () => {
  it("says the data doesn't match the template (132000) and to refresh", () => {
    expect(explainWhatsAppError(132000)).toMatch(/datos.*no coinciden/);
  });

  it("says the template doesn't exist in that language (132001)", () => {
    expect(explainWhatsAppError(132001)).toMatch(/no existe/);
  });

  it("says a value has line breaks or too many spaces (132018)", () => {
    expect(explainWhatsAppError(132018)).toMatch(/saltos de línea/);
  });

  it("keeps the payment explanation (131042)", () => {
    expect(explainWhatsAppError(131042)).toMatch(/método de pago/);
  });

  it("paused template (132015)", () => {
    expect(explainWhatsAppError(132015)).toMatch(/pausada/);
  });
});
