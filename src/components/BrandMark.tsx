import Image from "next/image";

// The cheke icon, shown at the right end of each main screen's title row on
// phones so the brand is always in view (on desktop the side menu already
// carries the logo).
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logos/cheke-icon-blue.png"
      alt="cheke"
      width={20}
      height={24}
      className={`h-[22px] w-auto shrink-0 lg:hidden ${className}`}
    />
  );
}
