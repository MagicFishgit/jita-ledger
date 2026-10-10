import { MapPin, ScrollText, Store } from 'lucide-react';
import { pct } from '../../lib/format';
import { MAX_SLOTS, slots, type Indexed } from '../../lib/industry';
import { Points } from '../Facts';
import { Tiles } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';

/**
 * Start (docs/notes/industry.md): the lead, where the shown character stands (its slots, its Jita fees, its clone), and,
 * from Task 7, the ladder of rungs from a first job to capitals. Nothing not read reads as a zero: an alt's skills not
 * read say so, and its fee is "–" until they are.
 */
export function IndustryStart({ c, ix }: { c: IndustryChar; ix: Indexed }) {
  // Not read is not level 0: an alt's skills not read, or a main whose first sync hasn't brought any, give no slots and no fee.
  const sk = c.pilot.skills && Object.keys(c.pilot.skills).length ? c.pilot.skills : undefined;
  const s = sk ? slots(ix, sk) : null;
  const why = skillsWhy(c);
  const feeKnown = c.feeKnown;
  const feeSaid = c.isMain ? `sales tax ${pct(c.tax)}, as Settings has them`
    : c.standingsRead ? `sales tax ${pct(c.tax)}, at ${c.name}’s standings with Caldari State and Caldari Navy`
      : `sales tax ${pct(c.tax)}; standings not read: broker fee at no standing`;
  return (
    <section className="col" style={{ gap: 14 }} aria-label="Start" data-industry="start">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Industry turns materials into things that sell. You need a blueprint, a factory slot, and somewhere to build.</p>
        <Points compact items={[
          { kind: 'good', icon: ScrollText, lead: 'A blueprint original', text: 'builds for ever, and can be researched and copied.' },
          { kind: 'info', icon: Store, lead: 'What limits most items', text: 'is what the market takes, not your factory.' },
          { kind: 'info', icon: MapPin, lead: 'Nothing has to move', text: 'to null-sec to start: a high-sec NPC station near Jita will do.' },
        ]} />
      </div>
      <div data-industry="where">
        <Tiles min={200} items={[
          {
            l: 'Factory slots', v: s ? `${s.factory}` : '–', n: s ? `one job each; ${MAX_SLOTS} at most: 1, plus Mass Production and Advanced Mass Production` : why,
            tip: 'How many manufacturing jobs run at once.\n\n• One, plus one a level of Mass Production and of Advanced Mass Production.\n• Eleven at most (EVE University, "Industry skills").',
          },
          {
            l: 'Science slots', v: s ? `${s.science}` : '–', n: s ? `research, copying and invention, one job each; ${MAX_SLOTS} at most: 1, plus Laboratory Operation and Advanced Laboratory Operation` : why,
            tip: 'How many research, copying and invention jobs run at once.\n\n• One, plus one a level of Laboratory Operation and of Advanced Laboratory Operation.\n• Eleven at most.',
          },
          {
            l: 'Jita broker fee', v: feeKnown ? pct(c.broker) : '–', n: feeKnown ? feeSaid : why,
            tip: 'What a listing in Jita 4-4 costs to place, and what each sale pays in tax.\n\n• From Broker Relations and Accounting.\n• And the standings with Jita 4-4’s owners, Caldari State and Caldari Navy: raw, floored at 0, as the sync takes the main’s.\n• An alt’s are the cloud’s hourly read of it; not read yet, it pays as if it had none.',
          },
          {
            l: 'Clone', v: c.clone === 'alpha' ? 'Alpha' : c.clone === 'omega' ? 'Omega' : 'Not read',
            n: c.clone === 'alpha' ? 'Alpha can’t use Metallurgy, Research or Laboratory Operation: researching needs Omega'
              : c.clone === 'omega' ? 'every industry skill is open'
                : 'clone state not read: the 0.25% Alpha job tax is left out where it can’t be told',
          },
        ]} />
      </div>
    </section>
  );
}
