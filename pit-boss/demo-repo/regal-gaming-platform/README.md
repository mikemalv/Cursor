# Regal Gaming Platform

Monorepo for the Regal Gaming Group casino and sportsbook platform.

| Service | Zone | Notes |
|---|---|---|
| `services/rng` | certified | GLI-33. Do not modify without re-certification. |
| `services/wagering` | certified | NV Reg 14. Payout calculation. |
| `services/payments` | PCI | Cardholder data environment. |
| `services/cage` | PCI | Cash desk / cage operations. |
| `services/loyalty` | standard | Comps, tiers, offers. |

See `CODEOWNERS`. All changes to certified components go through regulatory engineering.
