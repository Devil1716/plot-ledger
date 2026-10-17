"use client";

import { useState } from "react";
import { cn } from "cn";

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Google profile photo with an initials fallback (photo missing or failing to load). */
export function Avatar({
  name,
  photoURL,
  color = "#34d399",
  className,
}: {
  name: string;
  photoURL?: string | null;
  color?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoURL) && !failed;
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-[#0b0f1a]", className)}
      style={showPhoto ? undefined : { background: color }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Google photo, static export
        <img
          src={photoURL ?? ""}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}
