---
"@4mica/x402": minor
---

The server scheme parses `Money` prices exactly and refuses to guess.

- A price with more decimal places than the token has is now an error
  (`AmountPrecisionError`) instead of being silently truncated: `"$0.0000015"`
  on 6-decimal USDC used to become 1 base unit and now throws. Round the price
  yourself.
- Prices are parsed as exact decimals, with no float rounding. A small price no
  longer turns into a garbage amount (`"$0.0000001"` used to produce
  `"1e-7000000"`); a number price such as `1e-7` is read as `0.0000001`.
- A malformed price is an error instead of being read up to the first bad
  character: `"1.5abc"`, `"$1,000.00"`, `"-1"`, `"1e-7"` and `".5"` all throw.
  Only an optional leading `$` and surrounding whitespace are stripped.
- Two tokens in core's list reporting the stablecoin symbol is now an error
  (`AmbiguousTokenError`) instead of the first one being advertised. A symbol
  core does not list throws `TokenNotSupportedError`, naming what it does
  accept.
