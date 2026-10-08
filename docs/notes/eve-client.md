# EVE facts: mail, the client and asset safety

What EVE mail, notifications, the Sell window, inventory filters and asset safety do, checked in the user's client. Split
from eve-facts.md on 1 October 2026.

Don't re-derive or contradict these without new evidence.

- **EVE's notifications carry what the asset list doesn't** (`esi-characters.read_notifications.v1`, GET
  `/characters/{id}/notifications/`): type `StructureItemsMovedToSafety` has YAML text with `assetSafetyFullTimestamp` and
  `assetSafetyMinimumTimestamp` in Windows FILETIME ticks (100 ns since 1601), `newStationID`, `solarsystemID`,
  `structureID` (a YAML anchor, `&id001 …`) and `structureLink` (the structure's name in a showinfo link), per the goesi
  library's declaration. How long ESI keeps an old notification is unknown.
- **A mail a character sends itself doesn't reach the client until it logs in again.** Checked on the user's
  character in September 2026: ESI accepted the mail (201, an ID), and `/mail/{id}` and `/mail/labels/`
  showed it in the Inbox (labels 1 and 2, Inbox unread 1). But the client's Inbox, open the whole time,
  never listed it, and it appeared only after logging off to character select and back. So alert mail comes
  from a second character. Sent that way through ESI it arrived in the open client near instantly, with the
  new-mail notice, as ordinary incoming mail.
- **EVE mail through ESI** (`esi-mail.*`): POST `/characters/{id}/mail/` takes `{recipients:[{recipient_id,
  recipient_type:'character'}], subject, body, approved_cost}` and answers 201 with the new mail's ID. Body at
  most **8,000** (ESI: 400 "Maximum body length is 8000"; this note said 10,000, and from 5 October 2026 16:56 every
  cloud alert round with a long mail failed on it, 833 times by 8 October, mailing nothing, until the user forwarded the
  watchdog's mail. `alertMail` now counts the body in UTF-8 bytes against `MAIL_BODY_MAX`, since it isn't known whether
  ESI counts bytes or characters), subject 1,000. The body is the client's small HTML: `<br>`, `<b>`, `<font size color>`
  with ARGB colours (`#ffRRGGBB`), and `<a href>` — `showinfo:{typeId}` opens an item, and a web link makes the
  client ask first. **What it draws was settled by a sample mail to the user's character:** sizes 10–32 all
  differ; `<b>`, `<i>`, `<u>` work; every colour works; `showinfo:` links open items, systems
  (`showinfo:5//{systemId}`), stations (`showinfo:{stationTypeId}//{stationId}`) and planets
  (`showinfo:{planetTypeId}//{planetId}`) without leaving the game; → · • ✓ ★ ± render; runs of spaces are
  kept. `&nbsp;` shows literally, `<hr>` draws nothing, a monospace `face` is ignored, a link's colour
  can't be changed (links are always gold), and × has no glyph. So no tables and no rules. GET gives the 50 newest headers (`from`, `subject`, `timestamp`, `is_read`, `labels`),
  older ones via `last_mail_id`. DELETE `/mail/{id}/` answers 204, and 404 once it is already gone.
- **Asset safety, as ESI reports it** (the user's wrap, 28 September 2026): one item of type 60, *Asset Safety Wrap*
  (unpublished, so `/universe/ids` finds no type by that name), flagged `AssetSafety` at location 2004, type `other`:
  ESI doesn't say which system it's held for. Everything in it is listed inside it (`Hangar`, type `item`), ships with
  their fittings and containers with their contents a level deeper. **The wrap has no name in ESI**: the client titles it
  after the lost structure ("K7D-II - Iserlohn Fortress"), but `/characters/{id}/assets/names` answered
  `[{"item_id":…,"name":"None"}]` for it (the cloud's log, 17:07 UTC the same day), and nothing else in ESI names the
  structure, since the wrap sits at location 2004. Containers and ships inside it keep their own item IDs, and the same
  call **does** name those as the user named them ("Battle Chicken", "Equipment"). What's inside, from the raw rows
  logged at 18:07 UTC (155 rows under the wrap): every ship keeps its flags, so fitted modules sit in `HiSlot0`…`RigSlot2`
  (loaded charges share their gun's slot), the rest in `Cargo` and `DroneBay`; a container's contents are `Unlocked`;
  blueprint copies are listed like anything else (`is_blueprint_copy`), and one container held nothing but five; a
  ship with `is_singleton: false` is packaged and holds nothing (the user's Sigil). Nothing sat deeper than a ship's or
  container's contents. **ESI has no delivery date anywhere**:
  its spec mentions asset safety only as that flag and the `asset_safety_recovery_tax` journal type. The rules (EVE
  University's summary of CCP's): after 5 days it can be delivered by hand to a station in the same system (0.5%);
  after 20 it goes automatically to the nearest low-sec station (from low or null) or high-sec (from high); either
  way it arrives as the wrap, and dragging items out after an automatic delivery to another system costs 15% of each
  one's estimated price. The client shows the countdown and the destination (Assets → Asset Safety); ESI shows
  neither, and a delivered wrap's shape was not yet seen when this was written.
- **The multi-item Sell window can import prices from the clipboard** (patch 23.01, June 2025: one line per item, its
  name then its price; "Decimal Point" / "Decimal Comma" pick the decimal mark). Each line placed as an order takes an
  order slot, and the duration applies to the whole window. Its **export**, checked on the user's own (29 September
  2026), is one line per item: type ID, name, quantity, unit price, total, with decimal points and no thousands
  separators (`4477  Small Gremlin Compact Energy Neutralizer  1  40000.0  40000.0`). A hangar copied in list view
  (Ctrl+A, Ctrl+C) gives name and quantity per line. Pasted through chat, the tabs arrived as runs of spaces.
  **The import only prices rows already in the window; it never adds the items it names** (the user, in game, 29
  September 2026). With three items in the window and prices for two, it priced the two and left the third, without a
  word; a row left unpriced keeps the window's default, which for an order is the regional average (CCP's Phoebe dev
  blog). So a paste can't pick the items: they have to be selected in the hangar first (right-click → Sell Items, or
  dragged in; each row has an X to remove it). The Multibuy window's import does add items; the Sell window's doesn't.
  Not yet tested: (CCP's support page says so, players dispute it) whether a sell order priced under a higher bid fills
  at its own lower price, and whether it pays a broker fee.
- **Inventory smart filters can't be written by an app.** Their criteria (the user's client, 29 September 2026):
  Assembled, Blueprint copy, CPU usage, Clone State, Estimated unit price, Group, Meta group, Meta level, Name, Power
  usage, Slot type, Stack size, Volume; Name takes Starts with / Does not start with / Is / Is not / Contains / Does not
  contain; Match All or Any. Shared (drag the Share box into chat or mail), a filter is
  `<a href="sharedSetting:e5983d9a1ea7d999e09cd742c820dd4678aaf5dc//1//2">Test</a>` (read through ESI from the user's
  mail to themselves): a pointer to a copy the client uploaded to CCP's servers, not the criteria, so nothing outside
  the client can make one. The official link-scheme list doesn't mention it.
