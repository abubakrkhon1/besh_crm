# Customer company portal

## Goal

Give each customer company a secure, self-service workspace for the drivers and fuel cards assigned to that company without exposing the internal CRM or another customer's records.

## Security model

- A portal user has the `customer_admin` role and a required `profiles.customer_id` tenant assignment.
- Portal routes require both the role and tenant assignment.
- Supabase row-level security independently scopes customers, drivers, fuel cards, transactions, restrictions, driver invitations, and card-operation history.
- Provider-backed mutations use the service client only after the server action verifies the requested driver or card belongs to the caller's `customer_id`.
- Staff CRM routes continue to use the existing staff-role allowlist; customer administrators cannot enter `/crm`.
- Card numbers remain masked. The portal never returns provider credentials or full card data.

## Delivered first release

1. Owners and general managers can invite a customer administrator from the CRM customer page using the primary email stored on the customer profile.
2. Customer administrators are routed to `/portal` after sign-in.
3. The portal includes an overview, driver management, fuel-card inventory, and card detail pages.
4. Customer administrators can invite drivers to BESH Mobile, revoke pending invitations, and enable or disable driver mobile access.
5. Customer administrators can freeze or reactivate their cards and update supported WEX refreshing limits.
6. Recent transactions and audited card-management operations are visible only within the assigned company.

## Rollout checklist

1. Apply `20260920000000_customer_company_portal.sql` after the existing WEX card-management migrations.
2. Confirm the Supabase invitation email template directs recipients to the configured redirect URL.
3. Invite an internal test account from a test customer record.
4. Verify the test account cannot read a second customer's IDs through direct portal URLs or Supabase requests.
5. Exercise freeze/unfreeze and limit changes against a non-production WEX test card before enabling the feature for customers.

## Follow-up phases

- Add multiple company roles (`customer_admin` and read-only `customer_viewer`) and staff-controlled access revocation.
- Add driver creation/editing when the source-of-truth behavior with WEX is defined.
- Add customer-scoped card ordering after shipping rules, approvals, and WEX policy selection are agreed.
- Add notifications, downloadable statements, and richer transaction exports.
- Add end-to-end tenant-isolation tests against a disposable Supabase project.
