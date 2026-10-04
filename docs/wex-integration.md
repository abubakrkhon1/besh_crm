# WEX integration mapping

The CRM uses the legacy WEX EFS `CardManagementWS` SOAP service. Its WSDL is available from the configured service URL with the trailing slash removed and `?wsdl` appended.

## Account requests

| WEX operation | CRM use |
| --- | --- |
| `getCarrierInfo(clientId)` | Carrier/customer identity |
| `getContracts(clientId)` | Account contract IDs and statuses |
| `getCreditLimits(clientId, contractId)` | Credit-limit and available-credit KPIs |

Customer KPI mappings:

- `customers.credit_limit` = sum of `origLimit` for contracts that are not closed, inactive, terminated, or deleted.
- `customers.current_balance` = credit limit minus `creditAvailable`, clamped to zero.
- `customers.monthly_spend` = sum of all posted CRM transactions in the current UTC month.
- `customers.lifetime_spend` = sum of all posted CRM transactions.

## Card and transaction requests

| WEX operation | CRM use |
| --- | --- |
| `getCardSummariesV2` | Card identity, driver, unit, policy, status, and payroll metadata |
| `getMCTransExtLocV3` | Transactions for the authenticated carrier |
| `getChildTransactionsNewV3` | Transactions for child carriers |

Transactions are requested in seven-day windows over the most recent 30 days, deduplicated by the WEX transaction ID, and upserted by provider plus transaction ID.

## Level III storage

Dedicated columns retain searchable values including authorization and invoice IDs, contract ID, settlement totals, fees, taxes, WEX location ID, merchant geography, entry mode, and original transaction linkage.

Variable response structures are stored as JSON:

- `prompt_values`: WEX prompt responses such as odometer or driver-entered values.
- `line_items`: product, fuel type, quantity, price-per-unit, retail amount, discounts, and line-level taxes.
- `taxes`: transaction-level tax records.

Full card numbers are never stored. The sync stores only the last four digits and an HMAC fingerprint used for matching.

## Provider-backed card management

Owners and general managers can initiate audited card-management workflows from the CRM:

- Freeze or reactivate a card by reading the complete card from WEX, changing only its provider status, and reading it back for confirmation.
- Set daily, weekly, and monthly amount or transaction-count limits through WEX Refreshing Limits / Velocity Limits.
- Submit a single physical-card order using an order type, policy, and card style returned by WEX.
- Replace a lost or stolen card, or reissue a damaged card, with the resulting WEX order number retained in the audit trail.

Every request has a unique idempotency key and an entry in `fuel_card_operations`. Full card numbers and full street addresses are never written to the operation audit record. Provider mutations are not automatically retried because a timeout after submission may represent a completed operation. A successful status or limit mutation is read back from WEX before the local `fuel_cards` row is updated.

Provider capabilities vary by account. The current account returns no allowed API card-order types and rejects refreshing limits because that contract has not enabled Refreshing Limits / Velocity Limits. The CRM exposes these restrictions as actionable messages and does not create local-only card states or limits. WEX must enable those capabilities before the related controls can complete successfully.

## Deployment order

Apply `supabase/migrations/20260804000000_wex_level_iii_transaction_fields.sql` before deploying the sync code that writes Level III fields.
