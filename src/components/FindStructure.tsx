import { useState } from 'react';
import { getAuth } from '../lib/auth';
import { cloudEnabled, cloudStructureSearch } from '../lib/cloud';
import { esi } from '../lib/esi';
import { MINUS } from '../lib/format';
import type { FoundStructure } from '../lib/industrySites';
import { toast } from '../lib/toast';
import { structureInfo, system } from '../lib/universe';

export type { FoundStructure };
/** Who searches: the main with this browser's login; any other character through the cloud, with its own login there. */
export type Searcher = { charId: number; name: string; isMain: boolean };

/**
 * Find a structure by name (esi-search.search_structures.v1): ESI searches the structures a character can see, and each one found
 * is read for its name, type and system (esi-universe.read_structures.v1). Shared by Reprocessing (a refinery) and the Industry tab
 * (a build site, a home market): each page says what a structure is to it (`describe`). The main searches with this browser's
 * login; an alt (`as`) through the cloud (`POST /v1/structures/search`), since the browser never holds an alt's login.
 */
export function FindStructure({ onPick, picked, describe, label = 'Find a structure by name', as }: {
  onPick: (f: FoundStructure) => void; picked?: string; describe: (f: FoundStructure) => string; label?: string; as?: Searcher;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundStructure[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const viaCloud = !!as && !as.isMain;
  const find = async () => {
    if (q.trim().length < 3) { toast('Type at least three letters of its name.', 'warn'); return; }
    setWhy(null);
    if (viaCloud) {
      if (!cloudEnabled()) { setFound(null); setWhy(`Searching as ${as!.name} goes through the cloud, which isn’t on in this browser (Settings → Your data).`); return; }
      setBusy(true);
      try { setFound((await cloudStructureSearch(as!.charId, q.trim())).found); }
      catch (e) { setFound(null); setWhy((e as { status?: number }).status === 404 ? `The cloud is a version behind: searching as ${as!.name} comes once it’s updated.` : e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
      return;
    }
    const a = getAuth();
    if (!a) { toast('Log in first.', 'warn'); return; }
    setBusy(true);
    try {
      const { data } = await esi<{ structure?: number[] }>(`/characters/${a.characterId}/search/`, { auth: true, query: { categories: 'structure', search: q.trim(), strict: 'false' } });
      const out: FoundStructure[] = [];
      for (const id of (data.structure ?? []).slice(0, 15)) {
        const s = await structureInfo(id);
        if (s.status !== 'found') continue;
        const sys = await system(s.systemId).catch(() => null);
        out.push({ id, name: s.name, systemId: s.systemId, system: sys?.name ?? '', security: sys?.security ?? null, ...(s.typeId != null ? { typeId: s.typeId } : {}) });
      }
      setFound(out);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setBusy(false); }
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="num" placeholder="Find it by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} style={{ width: 220, maxWidth: '100%' }} aria-label={label} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => void find()}>{busy ? 'Searching…' : 'Find'}</button>
        {picked && <span className="note small" style={{ margin: 0 }}>At {picked}</span>}
      </div>
      {why && <p className="note small" style={{ margin: 0 }} data-industry="find-why">{why}</p>}
      {found && (found.length ? (
        <div className="col" style={{ gap: 2 }}>
          {found.map((f) => (
            <button key={f.id} type="button" className="link-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { onPick(f); setFound(null); setQ(''); }}>
              {f.name} <span className="faint">· {f.system}{f.security != null ? ` ${f.security < 0 ? MINUS : ''}${Math.abs(f.security).toFixed(1)}` : ''} · {describe(f)}</span>
            </button>
          ))}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No structure {viaCloud ? `${as!.name} can` : 'you can'} see by that name.</p>)}
    </div>
  );
}
