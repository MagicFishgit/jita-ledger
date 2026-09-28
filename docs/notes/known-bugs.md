# Known bugs

Bugs found and verified real but not yet fixed.

None open. The three an adversarial review found and verified were fixed on 28 September 2026 (see "Each trade and
each fee belongs to one position" and "Units sold beyond what a position bought" in positions-results): overlapping
positions double-counting the totals, sells with no matching buys costed at their own price, and broker fees dropped
for orders issued before a position's start. None of the user's five positions hit them (one came within 90 seconds
of the third), so each is covered by a synthetic test; the second did move Results' every-item line by 104,465 ISK.

Fixed with the redesign: `clearAll` bumps a generation that an in-flight sync checks before writing;
importing a backup confirms and says what it replaces; "stock if sold now" re-reads the market every five
minutes; the journal index is cached per journal version instead of rebuilt per position.

That review's verification pass was cut short, so this list is what survived, not a full audit.
