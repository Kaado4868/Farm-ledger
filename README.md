# Farm Ledger

Farm Ledger is a Firebase-backed progressive web app for livestock, expenses, losses, handovers, notifications, and farm records.

## Remediation branch

`remediation-v1` contains the security and data-integrity remediation work. Firebase Storage is intentionally not required; image/receipt data continues to use the existing Firestore approach for the free-plan deployment.

## Verification

CI runs the ledger and Firestore security-rule tests before deployment. The ledger tests use value-based assertions that are safe across Node VM realms.
