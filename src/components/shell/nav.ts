import {
  ArrowLeftRight, BadgePercent, Calculator, ChartLine, ChartPie, Crosshair, Eye, Gem, Layers, ListChecks, ListOrdered, PackageOpen, Radar, Recycle,
  Rocket, ScrollText, Settings2, Swords, Wallet, type LucideIcon,
} from 'lucide-react';

export type PageKey =
  | 'wallet' | 'todo' | 'calculator' | 'prospects' | 'watchlist' | 'planner' | 'arbitrage' | 'sniper' | 'reprocess'
  | 'positions' | 'orders' | 'loot' | 'blueprints' | 'results' | 'loyalty' | 'hustles' | 'combat' | 'omega' | 'settings';

export type NavItem = { key: PageKey; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: 'Today', items: [{ key: 'wallet', label: 'Wallet', icon: Wallet }, { key: 'todo', label: 'To do', icon: ListChecks }] },
  {
    label: 'Market', items: [
      { key: 'calculator', label: 'Calculator', icon: Calculator }, { key: 'prospects', label: 'Prospects', icon: Radar },
      { key: 'watchlist', label: 'Watchlist', icon: Eye }, { key: 'planner', label: 'Capital planner', icon: ChartPie },
      { key: 'arbitrage', label: 'Hub arbitrage', icon: ArrowLeftRight }, { key: 'sniper', label: 'Sniper', icon: Crosshair },
      { key: 'reprocess', label: 'Reprocessing', icon: Recycle },
    ],
  },
  {
    label: 'Ledger', items: [
      { key: 'positions', label: 'Positions', icon: Layers }, { key: 'orders', label: 'Orders', icon: ListOrdered },
      { key: 'loot', label: 'List loot', icon: PackageOpen }, { key: 'blueprints', label: 'Blueprints', icon: ScrollText },
      { key: 'results', label: 'Results', icon: ChartLine },
    ],
  },
  { label: 'Earn', items: [{ key: 'loyalty', label: 'Loyalty', icon: BadgePercent }, { key: 'hustles', label: 'Side hustles', icon: Rocket }] },
  { label: 'Pilot', items: [{ key: 'combat', label: 'Combat', icon: Swords }, { key: 'omega', label: 'Omega', icon: Gem }, { key: 'settings', label: 'Settings', icon: Settings2 }] },
];

export const ALL_PAGES = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
export const pageOf = (key: string) => ALL_PAGES.find((p) => p.key === key) ?? ALL_PAGES[0];
