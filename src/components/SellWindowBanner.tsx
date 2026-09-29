import { TriangleAlert } from 'lucide-react';
import { navigate } from '../lib/hooks';

/**
 * Why listing in one paste doesn't work, on the pages built for it (List loot, List your stock). The user tried it on 29
 * September 2026: the Sell window's "Import prices from clipboard" only prices the rows already in the window, and
 * leaves the rest at their default; it never adds the items it names. A shared inventory filter could have selected them,
 * but a filter link is `sharedSetting:<40 hex>//1//2`, a pointer to a copy the client uploaded to CCP's servers (read
 * from the user's own test mail), so the app can't write one. The user may ask CCP for the import to add items, as the
 * Multibuy window's does. Until then the tools stay, with this said plainly: List loot is still how the user sorts a pile of
 * junk loot into the few worth listing and the rest to sell into the bids.
 */
export function SellWindowBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="sell-banner compact" role="note">
        <TriangleAlert aria-hidden="true" />
        <div>
          <b>Not usable for listing at the moment.</b> The game’s Sell window only prices items you’ve already put in it; the
          paste can’t pick them for you.{' '}
          <button type="button" className="link-btn" onClick={() => navigate('loot')}>Why (List loot)</button>
          {' '}The prices below are still right if you select the items yourself.
        </div>
      </div>
    );
  }
  return (
    <section className="sell-banner" role="note" aria-label="Not usable for listing at the moment">
      <TriangleAlert aria-hidden="true" />
      <div>
        <div className="sell-banner-title">Not usable for listing at the moment</div>
        <p>This tool was built to list your loot in one paste. The game doesn’t allow that yet.</p>
        <ul>
          <li>The Sell window’s <b>Import prices from clipboard</b> only prices items that are already in the window. It doesn’t add the items it names, so you’d still have to find and select each one in your hangar yourself. Checked in game on 29 September 2026.</li>
          <li>An inventory filter can’t do the selecting for it either. A shared filter link only points to a copy stored on CCP’s servers, so the app can’t make one for your items.</li>
          <li>It would work if the import added the items it names, the way the Multibuy window’s import does. That’s a feature for CCP to add.</li>
        </ul>
        <p className="sell-banner-foot">It still sorts a pile of loot: the table shows the few worth a listing (select those yourself), and the rest can go straight into the bids.</p>
      </div>
    </section>
  );
}
