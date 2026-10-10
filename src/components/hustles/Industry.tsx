import { useEffect, useState } from 'react';
import { useAlts } from '../../lib/altStore';
import { navigate, type Route } from '../../lib/hooks';
import type { Indexed } from '../../lib/industry';
import { PilotProvider } from '../pilot';
import { Seg } from '../ui';
import { loadIndustry } from './industryBundle';
import { useIndustryChars } from './industryChars';
import { IndustryStart } from './IndustryStart';

/**
 * Industry: what to build, where, and what it pays (docs/notes/industry.md; spec
 * docs/superpowers/specs/2026-10-10-industry-design.md). Its sections sit in the address (hustles/industry/<section>)
 * and the last one picked is kept per browser: Start (where you stand and the ladder) and, from Task 4B, Build (where you
 * build and the finder); stages 2 to 4 add Blueprints & jobs, Copies and Home markets. "Show for" picks whose skills,
 * clone, fees, held stock and mining every figure uses: the main, or an alt from its pulled copy, read and never written.
 * The one file of the tab that imports the alt store (scripts/check.mjs keeps the list).
 */
const SECTION_KEY = 'jita-ledger:industry-section';
const SHOW_KEY = 'jita-ledger:industry-show';
const readKept = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* just not kept */ } };

export const SECTIONS = [
  { key: 'start', label: 'Start', tip: 'Where you stand, and the steps from a first job to capitals' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

export function Industry({ route }: { route: Route }) {
  // The alt store is read here because this is the file allowed to read it (scripts/check.mjs keeps the list).
  const alts = useAlts();
  const chars = useIndustryChars(alts);
  const main = chars[0];
  // A kept character no longer on the roster falls back to the main, without forgetting the kept one: the roster loads
  // after the tab first draws.
  const [keptShow, setKeptShow] = useState(() => Number(readKept(SHOW_KEY)) || null);
  const shown = chars.find((c) => c.charId === keptShow) ?? main;
  const chooseShow = (id: number) => { setKeptShow(id); keep(SHOW_KEY, String(id)); };

  const kept = readKept(SECTION_KEY);
  const section: Section = SECTIONS.find((s) => s.key === route.path[2])?.key ?? SECTIONS.find((s) => s.key === kept)?.key ?? 'start';
  const choose = (s: Section) => { keep(SECTION_KEY, s); navigate(`hustles/industry/${s}`); };

  const [ix, setIx] = useState<Indexed | 'failed' | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    loadIndustry().then((b) => { if (alive) setIx(b); }, () => { if (alive) setIx('failed'); });
    return () => { alive = false; };
  }, [tries]);

  return (
    <div className="col" style={{ gap: 16 }} data-industry="tab">
      {(SECTIONS.length > 1 || chars.length > 1) && (
        <div className="row ind-head">
          {SECTIONS.length > 1 && <Seg label="Industry section" value={section} onChange={choose} options={SECTIONS.map((s) => ({ v: s.key, label: s.label, tip: s.tip }))} />}
          {chars.length > 1 && (
            <Seg size="sm" label="Show for" value={shown.charId} onChange={chooseShow}
              options={chars.map((c) => ({ v: c.charId, label: c.name, tip: c.isMain ? 'Your skills, clone, fees, stock and mining' : `${c.name}’s skills, clone, fees, stock and mining, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))} />
          )}
        </div>
      )}
      {ix === 'failed' ? (
        <p className="note small" style={{ margin: 0 }}>Couldn’t load the blueprints just now. <button type="button" className="link-btn" onClick={() => { setIx(null); setTries((n) => n + 1); }}>Try again</button></p>
      ) : !ix ? (
        <p className="note small" style={{ margin: 0 }}>Loading the blueprints…</p>
      ) : (
        <PilotProvider value={shown.pilot}>
          {section === 'start' && <IndustryStart key={shown.charId} c={shown} ix={ix} />}
        </PilotProvider>
      )}
    </div>
  );
}
