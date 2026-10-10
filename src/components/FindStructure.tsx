import { useState } from 'react';
import { getAuth } from '../lib/auth';
import { esi } from '../lib/esi';
import { toast } from '../lib/toast';
import { structureInfo, system } from '../lib/universe';

/**
 * Find a structure by name (esi-search.search_structures.v1): ESI searches the structures the logged-in character can see,
 * and each one found is read for its name, type and system (esi-universe.read_structures.v1). Moved out of Reprocessing,
 * where it picks a refinery, so the Industry tab can pick a build site with it: each page says what a structure is to it
 * (`describe`). It searches as this browser's login, the main.
 */
export type FoundStructure = { id: number; name: string; systemId: number; system: string; security: number | null; typeId?: number };

export function FindStructure({ onPick, picked, describe, label = 'Find a structure by name' }: {
  onPick: (f: FoundStructure) => void; picked?: string; describe: (f: FoundStructure) => string; label?: string;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundStructure[] | null>(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const a = getAuth();
    if (!a || q.trim().length < 3) { toast('Type at least three letters of its name.', 'warn'); return; }
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
      {found && (found.length ? (
        <div className="col" style={{ gap: 2 }}>
          {found.map((f) => (
            <button key={f.id} type="button" className="link-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { onPick(f); setFound(null); setQ(''); }}>
              {f.name} <span className="faint">· {f.system}{f.security != null ? ` ${f.security.toFixed(1)}` : ''} · {describe(f)}</span>
            </button>
          ))}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No structure you can see by that name.</p>)}
    </div>
  );
}
