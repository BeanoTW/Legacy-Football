import { useEffect, useState } from "react";
import { characterDisplayName, onCharacterNameChange } from "@/lib/game/characterPortrait";

/** Live, display-only alias for a stable person ID. */
export function useCharacterName(id: string, originalName: string): string {
  const [displayName, setDisplayName] = useState(() => characterDisplayName(id, originalName));
  useEffect(() => {
    const refresh = () => setDisplayName(characterDisplayName(id, originalName));
    refresh();
    return onCharacterNameChange(refresh);
  }, [id, originalName]);
  return displayName;
}
