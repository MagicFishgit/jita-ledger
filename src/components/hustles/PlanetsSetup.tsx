import { Check as CheckIcon, Factory, GraduationCap, Layers, Users } from 'lucide-react';
import { byAccount } from '../../lib/accounts';
import type { PiIndex } from '../../lib/piBundle';
import { planCharOf } from '../../lib/piChar';
import { kindOptions } from '../../lib/piFinder';
import { flowChars, kindFor, KIND_SAID, WHAT_IF_SAID, type FlowChoice, type FlowKind } from '../../lib/piFlow';
import { ROMAN } from '../../lib/piPlan';
import { Points } from '../Facts';
import { Check, Seg } from '../ui';
import type { IndustryChar } from './industryChars';

/**
 * Step 2, Who and how (planets-flow.md): the characters to plan with, the factory character (Show for), the setup type and the skills to
 * plan at. Its choices are Plan's and Find's too: the characters ticked are the ones the repeat line counts and the chain and a factory
 * character use, and the what-if moves every figure. Kept per browser by Planets.tsx; this section writes nothing else.
 */
export function PlanetsSetup({ chars, shown, onShow, flow, onFlow, ix, good }: {
  chars: IndustryChar[]; shown: number; onShow: (id: number) => void; flow: FlowChoice; onFlow: (f: FlowChoice) => void; ix: PiIndex;
  /** The good step 1 picked (Plan's held good), or null. */
  good: number | null;
}) {
  const grouped = byAccount(chars);
  const listed = flowChars(grouped.map((c) => planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone })), flow, shown);
  const ticked = listed.filter((f) => f.ticked);
  const groups = new Set(grouped.map((c) => c.group)).size;
  const options = good != null ? kindOptions(ix, good, ticked.length) : null;
  const kind = options ? kindFor(flow.kind, options) : flow.kind;
  const g = good != null ? ix.byId.get(good) ?? null : null;
  const tick = (id: number, on: boolean) => onFlow({ ...flow, unticked: on ? flow.unticked.filter((x) => x !== id) : [...flow.unticked, id].sort((a, b) => a - b) });
  const shownTicked = ticked.some((f) => f.c.charId === shown);
  return (
    <section className="col" style={{ gap: 16 }} data-planets="setup">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }} data-planets="setup-good">
          {g ? <>Who plans <b>{g.name}</b> ({g.tier}), and how.</> : 'Pick a good on step 1 first: the setup types depend on what it is.'}
        </p>
        <Points compact items={[
          { kind: 'info', icon: Users, lead: 'The characters', text: 'ticked are the ones the plan counts: each runs a one-character setup on the same planets, or feeds the factory character.' },
          { kind: 'info', icon: Factory, lead: 'The factory character', text: 'is the one shown (Show for): every setup is worked out for it, and a factory character’s factory planets are its own.' },
          { kind: 'info', icon: Layers, lead: 'The setup type', text: 'is what step 3 ranks the systems by, and the row step 4 opens.' },
        ]} />
      </div>

      <div className="col" style={{ gap: 8 }} data-planets="setup-chars">
        <span className="panel-title">The characters</span>
        {grouped.map((c, i) => {
          const f = listed[i];
          const first = i === 0 || grouped[i - 1].group !== c.group;
          const pc = f.c;
          const clone = pc.alpha == null ? 'clone state not read: planned as Omega' : pc.alpha ? 'Alpha' : 'Omega';
          return (
            <div key={c.charId} className="col" style={{ gap: 4 }}>
              {groups > 1 && first && <span className="lbl" data-planets={`setup-account:${c.group}`}>{c.group}</span>}
              <span data-planets={`who:${c.charId}`}>
                <Check checked={f.ticked} disabled={!f.can || f.factory} onChange={(on) => tick(c.charId, on)}
                  tip={!f.can ? f.why ?? undefined : f.factory ? `${c.name} is the factory character, so always in the plan: pick another to leave ${c.name} out` : f.ticked ? `Leave ${c.name} out of the plan` : `Plan with ${c.name}`}
                  desc={f.can ? `${pc.planets} planet${pc.planets === 1 ? '' : 's'} · Command Center Upgrades ${ROMAN[pc.ccLevel!] ?? pc.ccLevel} · ${clone}${flow.atV ? ' · planned at 6 planets and V in the what-if' : ''}` : f.why}>
                  {c.name}{f.factory && f.can ? ' · the factory character' : ''}
                </Check>
              </span>
            </div>
          );
        })}
        {!ticked.length && <p className="note small" style={{ margin: 0 }}>Tick at least one character doing planetary industry.</p>}
      </div>

      <div className="col" style={{ gap: 6 }} data-planets="setup-factory">
        <span className="panel-title">The factory character</span>
        <label className="chip h34" style={{ width: 'max-content', maxWidth: '100%' }}><span className="cl">Factory character</span>
          <select aria-label="Factory character" className="ind-sel" data-planets="factory-char" value={shownTicked ? shown : ''} disabled={!ticked.length}
            onChange={(e) => { if (e.target.value) onShow(Number(e.target.value)); }}>
            {!shownTicked && <option value="">{ticked.length ? 'Pick one of those ticked' : 'None ticked'}</option>}
            {ticked.map((f) => <option key={f.c.charId} value={f.c.charId}>{f.c.name}</option>)}
          </select>
        </label>
        <span className="note small">It’s Show for: changing either changes both, and it’s always in the plan. {!shownTicked && listed.find((f) => f.c.charId === shown) ? `${listed.find((f) => f.c.charId === shown)!.c.name}, shown now, can’t do planetary industry: pick one of those ticked.` : ''}</span>
      </div>

      <div className="col" style={{ gap: 6 }} data-planets="setup-kinds">
        <span className="panel-title">The setup type</span>
        <div className="pl-choices" role="radiogroup" aria-label="Setup type">
          {(options ?? (['best', 'p1', 'p2', 'feed', 'team', 'chain'] as FlowKind[]).map((k) => ({ kind: k, can: false, why: 'pick a good on step 1 first', when: null }))).map((o) => {
            const on = o.kind === kind && o.can;
            return (
              <button key={o.kind} type="button" role="radio" aria-checked={on} aria-disabled={!o.can} className="check pl-choice" data-planets={`kind:${o.kind}`}
                onClick={() => { if (o.can) onFlow({ ...flow, kind: o.kind }); }} data-tip={o.can ? undefined : `Can’t: ${o.why}`}>
                <span className="box"><CheckIcon aria-hidden="true" /></span>
                <span><span className="ct">{KIND_SAID[o.kind].label}</span>
                  <span className="cd">{o.can ? `${KIND_SAID[o.kind].said}${o.when ? ` A chain is made ${o.when}.` : ''}` : `Can’t make ${g?.name ?? 'it'}: ${o.why}.`}</span></span>
              </button>
            );
          })}
        </div>
        {options && flow.kind !== kind && <span className="note small" data-planets="kind-fallback">{KIND_SAID[flow.kind].label} can’t make {g?.name ?? 'it'}, so the best for this team; it comes back with a good it can make.</span>}
        <span className="note small">A factory on bought inputs uses none of a system’s planets, so it isn’t among these: step 4 still shows it, under “Or buy the inputs instead”.</span>
      </div>

      <div className="col" style={{ gap: 6 }} data-planets="setup-skills">
        <span className="panel-title"><GraduationCap aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)' }} />Skills</span>
        <Seg label="Skills to plan at" value={flow.atV ? 'v' : 'now'} onChange={(v) => onFlow({ ...flow, atV: v === 'v' })}
          options={[
            { v: 'now', label: 'As they are now', tip: 'Each character’s own Interplanetary Consolidation and Command Center Upgrades, as last read' },
            { v: 'v', label: 'Everyone at V', tip: 'A what-if: each character ticked plans at Interplanetary Consolidation V (six planets) and Command Center Upgrades V. Your learned rates stay as they are: never scaled by heads' },
          ]} />
        {flow.atV && <span className="note small" data-planets="setup-whatif">{WHAT_IF_SAID}: six planets each, every layout fitted at V. The extraction rates are your learned ones, unchanged.</span>}
      </div>
    </section>
  );
}
