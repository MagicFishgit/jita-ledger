import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '../lib/hooks';
import { pilotFrom, type Pilot } from '../lib/pilot';
import { useData } from '../lib/store';

/**
 * Whose skills the skill-reading components show (lib/pilot.ts). Nothing provides one except Mining's Scaling up, for the
 * character it's shown for; everywhere else it's the main, built from the store each time the store changes, so no other
 * page reads anything it didn't read before and an alt chosen on Mining can't reach the Abyssal tree or Settings.
 */
const PilotContext = createContext<Pilot | null>(null);

export const PilotProvider = PilotContext.Provider;

/** The pilot provided above, else the main (the logged-in character, from the store). */
export function usePilot(): Pilot {
  // Every hook runs on every render, provided or not, so their order never changes.
  const given = useContext(PilotContext);
  const d = useData();
  const auth = useAuth();
  const main = useMemo(
    () => pilotFrom(d, { charId: auth?.characterId ?? null, name: auth?.characterName ?? 'Your character', isMain: true }, false),
    [d, auth],
  );
  return given ?? main;
}
