---
"@4mica/x402": major
---

Base Sepolia is the only default network for now, since it is the one running
the 2.0 protocol. `FourMicaEvmScheme.create` connects only to it up front (other
networks still connect lazily on a first payment), and the Express middleware
registers the 4mica scheme only for it, so a seller on another network registers
the scheme explicitly. Before, `create` also connected to Base mainnet and
Ethereum Sepolia and failed when either was unreachable.
