import { useMemo } from "react";
import type { ChairmanAvatar } from "@/lib/game/chairmanProfile";
import { generatedPortrait, type PortraitIdentity } from "@/lib/game/characterPortrait";
import { ChairmanPortrait } from "./ChairmanPortrait";

/** One renderer for chairman, players and football staff. The existing
 * chairman studio remains the authoritative editable profile. */
export function CharacterPortrait({
  identity,
  avatar,
  size = 64,
  framed = true,
  className,
  title,
}: {
  identity?: PortraitIdentity;
  avatar?: ChairmanAvatar;
  size?: number;
  framed?: boolean;
  className?: string;
  title?: string;
}) {
  const generated = useMemo(
    () => identity ? generatedPortrait(identity) : undefined,
    [identity?.id, identity?.subject, identity?.sex, identity?.outfitColour, identity?.accentColour],
  );
  const appearance = avatar ?? generated;
  if (!appearance) return null;
  return (
    <ChairmanPortrait
      avatar={appearance}
      size={size}
      framed={framed}
      className={className}
      title={title ?? (identity ? `${identity.subject} portrait` : "Chairman portrait")}
    />
  );
}
