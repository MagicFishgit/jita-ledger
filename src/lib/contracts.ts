/**
 * Your own contracts (ESI's /characters/{id}/contracts, scope esi-contracts.read_character_contracts.v1, registered 29
 * September 2026): courier contracts you've accepted, with their deadline and the collateral at stake, for To do; and
 * the items in item exchanges you sold or bought, so the Wallet names what a contract's ISK was for instead of showing
 * "Contract prices" as a lump. Pure.
 */

export type RawContract = {
  contract_id: number; type: string; status: string; issuer_id: number; acceptor_id: number; assignee_id: number;
  price?: number; reward?: number; collateral?: number; volume?: number; title?: string;
  date_issued: string; date_accepted?: string; date_completed?: string; date_expired: string; days_to_complete?: number;
  start_location_id?: number; end_location_id?: number; for_corporation: boolean;
  /** ESI requires it; optional here for a list stored before. */
  availability?: string;
};

export type MyContract = {
  id: number; type: string; status: string; issuer: number; acceptor: number;
  price: number; reward: number; collateral: number; volume: number; title: string;
  issued: string; accepted: string | null; completed: string | null; expires: string; days: number;
  start: number | null; end: number | null;
  availability: string | null;
};

export function readContracts(raw: RawContract[]): MyContract[] {
  return raw.map((c) => ({
    id: c.contract_id, type: c.type, status: c.status, issuer: c.issuer_id, acceptor: c.acceptor_id,
    price: c.price ?? 0, reward: c.reward ?? 0, collateral: c.collateral ?? 0, volume: c.volume ?? 0, title: c.title ?? '',
    issued: c.date_issued, accepted: c.date_accepted ?? null, completed: c.date_completed ?? null, expires: c.date_expired, days: c.days_to_complete ?? 0,
    start: c.start_location_id ?? null, end: c.end_location_id ?? null, availability: c.availability ?? null,
  }));
}

/** A courier you've accepted and not yet delivered, with when it's due: accepted + its days to complete. */
export type CourierDue = { contract: MyContract; due: number };

export function couriersDue(list: MyContract[], me: number): CourierDue[] {
  return list.filter((c) => c.type === 'courier' && c.acceptor === me && c.status === 'in_progress' && c.accepted)
    .map((c) => ({ contract: c, due: Date.parse(c.accepted!) + c.days * 86400_000 }))
    .sort((a, b) => a.due - b.due);
}

/**
 * Item exchanges whose items to ask ESI about: finished ones with you on one side, and your own outstanding ones (Industry's
 * copy contracts), not yet read; and, once, one you issued whose items were read before raw_quantity was kept.
 */
export function itemsToRead(list: MyContract[], me: number, known: Readonly<Record<number, ContractItem[] | undefined>>, max = 50): number[] {
  const finished = (c: MyContract) => c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor';
  const wanted = (c: MyContract) => (finished(c) && (c.issuer === me || c.acceptor === me)) || (c.issuer === me && c.status === 'outstanding');
  const stale = (c: MyContract) => c.issuer === me && !!known[c.id]?.some((i) => i.raw === undefined);
  return list.filter((c) => c.type === 'item_exchange' && ((wanted(c) && !(c.id in known)) || stale(c))).slice(0, max).map((c) => c.id);
}

/** `raw`: ESI's raw_quantity (−2 a blueprint copy, −1 an original or another singleton); null when ESI gave none; absent on an item read before stage 3 of Industry. */
export type ContractItem = { typeId: number; qty: number; included: boolean; raw?: number | null };

/** What a contract held, in words: "3× Rifter Blueprint, 1× Tritanium", what was given first, then what was asked. */
export function contractSaid(items: ContractItem[] | undefined, name: (typeId: number) => string, max = 3): string | null {
  if (!items?.length) return null;
  const said = (xs: ContractItem[]) => {
    const parts = xs.slice(0, max).map((i) => `${i.qty.toLocaleString('en-US')}× ${name(i.typeId)}`);
    return xs.length > max ? `${parts.join(', ')} and ${xs.length - max} more` : parts.join(', ');
  };
  const given = items.filter((i) => i.included), asked = items.filter((i) => !i.included);
  return [given.length ? said(given) : '', asked.length ? `asking ${said(asked)}` : ''].filter(Boolean).join('; ');
}
