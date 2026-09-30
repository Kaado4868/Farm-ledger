# Farm Ledger data model v2

## Compatibility

Existing `users/{email}` farm assignments remain supported during migration. New deployments create `farms/{farmId}/members/{email}` membership documents. The legacy authorization fallback should only be removed after all approved users have been migrated and verified.

Membership fields:

- `email`: normalized lowercase email
- `farmId`: farm identifier
- `role`: `owner`, `manager`, or `member`
- `status`: `active` or `suspended`
- `migratedFromUserDoc`: boolean when copied from the legacy model

## Transactions

New transaction records should include `schemaVersion: 2` and use these enums:

- type: `purchase`, `death`, `medical`, `feed`, `herdsman`, `handover`, `other`
- animalType: `goat`, `sheep`, `cattle`, `chicken`, `other`

Livestock events use a positive integer `animalCount`. Expense-only records use zero.

## Inventory identity

For tracked livestock, each animal should have a stable `inventoryId` derived from an existing farm tag/ID where available. Historical anonymous quantity records are not retroactively assigned invented identities.

The shared ledger core reconstructs legacy inventory where possible and uses `legacy-{transactionId}-{n}` identifiers only as deterministic compatibility identities for calculations; these are not presented as real physical tags.

## Custody events

`custodyEvents/{eventId}` records state changes for individually identified livestock:

- `action`: `handover`, `return`, or `loss`
- `inventoryId`: stable animal ID/tag
- `transactionId`: the originating handover transaction
- `actor`: authenticated email
- `date`: `YYYY-MM-DD`
- `farmId`: owning farm

Return and loss events are mutually exclusive for an animal. Event IDs are deterministic (`custody-{farmId}-{inventoryId}-{action}`) so retries are idempotent.

## Images and receipts

Firebase Storage is intentionally **not** part of this remediation because the project is being kept on the current Firebase plan. Existing compressed image/receipt fields remain in Firestore. This is a known capacity/performance trade-off and should be revisited only if the plan changes.

## Import model

Imports use deterministic transaction document IDs derived from the target farm and source record content. Retrying the same backup therefore skips already-imported records instead of duplicating them. Imports are processed in smaller atomic batches and save progress locally so a connection interruption can be safely retried.

## Migration order

1. Back up Firestore.
2. Run `npm run migrate:memberships` using a service account with Firestore access.
3. Verify membership documents for every approved user.
4. Deploy and test the new rules.
5. Convert new writes to `schemaVersion: 2`.
6. Backfill inventory identities only where historical records contain enough information to do so.
7. Verify custody IDs for handover records before using return/loss tracking.
8. Once all clients use v2 membership, remove the legacy `users/{email}.farmId/status` authorization fallback in a separate release.

## Testing and deployment

`npm test` runs both the dependency-free ledger tests and Firestore Rules emulator tests. GitHub Actions runs the tests before deploying Hosting and Firestore rules.
