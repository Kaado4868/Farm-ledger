# Farm Ledger data model v2

## Compatibility

Existing `users/{email}` farm assignments remain supported during migration. New deployments should create `farms/{farmId}/members/{email}` membership documents.

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

For tracked livestock, each animal should eventually have a stable `inventoryId`. A purchase creates inventory records with `custodyState: on_farm`. Death, handover, return, and loss events change the state rather than creating unrelated anonymous quantities.

## Migration order

1. Back up Firestore.
2. Run `npm run migrate:memberships` using a service account with Firestore access.
3. Verify membership documents for every approved user.
4. Deploy and test the new rules.
5. Convert new writes to `schemaVersion: 2`.
6. Backfill inventory identities only where historical records contain enough information to do so. Do not invent identities for historical animals that were never individually tracked.
7. Once all clients use v2 membership, remove the legacy `users/{email}.farmId/status` authorization fallback in a separate release.
