# Known bugs

Bugs found and verified real but not yet fixed.

Found by an adversarial review and verified real.

- Overlapping positions on the same item **double-count** the all-positions totals (and so the Wallet's
  trading profit and Results' trading line).
- Sells with no matching buys are costed at their own sell price, reporting exactly zero profit.
- Broker fees are dropped for orders issued before a position's start date, though their fills count.

Fixed with the redesign: `clearAll` bumps a generation that an in-flight sync checks before writing;
importing a backup confirms and says what it replaces; "stock if sold now" re-reads the market every five
minutes; the journal index is cached per journal version instead of rebuilt per position.

That review's verification pass was cut short, so this list is what survived, not a full audit.
