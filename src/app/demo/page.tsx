import type { Metadata } from "next";
import { DemoPhone } from "./DemoPhone";

export const metadata: Metadata = {
  title: "cheke.io — así se ve en tu iPhone",
  description: "Demo interactiva de cheke en un iPhone, con datos de ejemplo.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoPhone />;
}
