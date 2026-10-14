import Image from "next/image";

// The cheke icon, shown beside each main screen's title on phones so the
// brand is always in view (on desktop the side menu already carries the logo).
export function BrandMark() {
  return (
    <Image
      src="/logos/cheke-icon-blue.png"
      alt="cheke"
      width={20}
      height={24}
      className="h-[22px] w-auto shrink-0 lg:hidden"
    />
  );
}
