import Image from "next/image";
import clsx from "clsx";
import { initials, type Person } from "@/lib/outings";
import { avatarSrc } from "@/lib/profiles";

export function Avatar({ person, size = 32, className }: { person: Pick<Person, "display_name" | "avatar_url" | "avatar_path">; size?: number; className?: string }) {
  const classes = clsx("shrink-0 rounded-full border-2 border-surface-container-lowest object-cover", className);
  const src = avatarSrc(person);
  if (src) {
    return <Image src={src} alt={person.display_name ?? ""} width={size} height={size} className={classes} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-label={person.display_name ?? undefined}
      className={clsx(classes, "flex items-center justify-center bg-primary-fixed font-bold text-on-primary-fixed-variant")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(person.display_name)}
    </span>
  );
}
