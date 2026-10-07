// The one place that says who is behind cheke. The public pages (home,
// privacy policy, terms, data deletion) read from here, and Meta checks that
// this matches the legal documents used for business verification — so fill
// it in once, exactly as written on those documents.
//
// While any value still starts with "[", the legal pages show a visible
// "draft" banner so they can't be mistaken for final.
export const COMPANY = {
  brand: "cheke",
  legalName: "[RAZÓN SOCIAL — completar]",
  address: "[Dirección — completar]",
  city: "[Ciudad — completar]",
  country: "Honduras",
  phone: "[Teléfono — completar]",
  email: "[correo@dominio — completar]",
  website: "https://cheke-eight.vercel.app",
  lastUpdated: "octubre de 2026",
};

export const COMPANY_IS_PLACEHOLDER = Object.values(COMPANY).some((v) => v.startsWith("["));
