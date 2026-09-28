import { Lock, LogIn } from 'lucide-react';
import { login } from '../lib/auth';
import { toast } from '../lib/toast';
import type { Motion } from '../lib/types';
import { Starfield } from './shell/Starfield';
import { Notice } from './ui';

/**
 * What anyone who isn't the owner sees: what this is, that it's private, and the way in for the owner. The site is
 * public, so the app shows this instead of any page and runs nothing behind it (no sync, cloud, alerts or scans);
 * the cloud refuses any other character too. A character that logs in and isn't the owner is logged straight out.
 */
export function Landing({ refused, error, motion }: { refused: string | null; error: string | null; motion: Motion }) {
  return (
    <div className="landing">
      <div className="hud-nebula" aria-hidden="true" />
      <Starfield motion={motion} />
      <div className="hud-grid" aria-hidden="true" />
      <main className="landing-card" aria-labelledby="landing-title">
        <svg className="landing-mark" viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="25,3 75,3 100,50 75,97 25,97 0,50" fill="var(--acc)" />
          <polygon points="28,9 72,9 94,50 72,91 28,91 6,50" fill="#050b12" />
          <text x="50" y="64" fontFamily="monospace" fontWeight="700" fontSize="38" fill="var(--acc)" textAnchor="middle">JL</text>
        </svg>
        <div className="boot-name">JITA LEDGER</div>
        <h1 id="landing-title">A private trading ledger for EVE Online</h1>
        <p>Station trading at Jita 4-4 for one pilot: orders, positions, alerts and market scans, kept in step with the game.</p>
        {refused && <Notice kind="err">{refused} isn’t this ledger’s owner, so you’ve been logged out. Nothing of yours was kept.</Notice>}
        {error && <Notice kind="err">{error}</Notice>}
        <button type="button" className="btn primary tall" onClick={() => login().catch((e) => toast(String(e.message ?? e), 'err'))}>
          <LogIn aria-hidden="true" />Log in with EVE Online
        </button>
        <p className="landing-small"><Lock aria-hidden="true" />Only its owner’s character can use it.</p>
      </main>
    </div>
  );
}
