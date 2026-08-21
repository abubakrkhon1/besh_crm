# BESH Mobile driver integration

## Identity model

- WEX synchronization creates or updates `public.drivers` from matched fuel-card identities.
- Synchronization never creates Supabase Auth users and never sets passwords.
- A driver becomes a mobile user only after claiming a single-use CRM invitation.
- `drivers.auth_user_id` is the one-to-one link to `auth.users`; the Auth trigger creates `profiles.role = driver`.

WEX driver identity is scoped by `(provider, customer_id, external_driver_id)`. Email is an onboarding/login address, not a provider identity key.

## Activation

1. An authorized CRM manager verifies the driver's email and sends an invitation.
2. The invitation contains a random 256-bit token. Only its SHA-256 hash is stored.
3. The link expires after 72 hours and may be resent or revoked.
4. The driver sets a password on `/driver-activation/[token]`.
5. The server creates a confirmed Supabase Auth user and atomically links the unclaimed driver as closely as the Auth API/database boundary permits. Failed database linking triggers compensating Auth-user deletion.
6. The driver signs in from the mobile app with Supabase email/password Auth.

The mobile client must not offer unrestricted signup. “Activate account” should direct the driver to the CRM-issued link. Login errors should not reveal whether an email exists.

## Mobile bootstrap endpoint

`GET /api/mobile/bootstrap`

Send the current Supabase access token:

```http
Authorization: Bearer <access-token>
```

The endpoint validates the token with Supabase, resolves exactly one active driver through `auth_user_id`, and returns:

- the driver's safe profile fields;
- safe company identity fields;
- cards assigned to that driver;
- the 50 most recent transactions assigned to that driver.

It never returns customer balances, CRM notes, other drivers, applications, Auth metadata, or provider credentials. Responses use `Cache-Control: no-store`.

## Mobile client behavior

- Store Supabase sessions only in platform secure storage (Keychain/Keystore), never AsyncStorage without encryption.
- Refresh through the Supabase SDK and clear local protected data on sign-out or refresh failure.
- Treat HTTP `401` as an expired/invalid session and `403` as disabled mobile access.
- Render timestamps from UTC in the device timezone.
- Do not log access tokens, invitation tokens, passwords, full card data, or transaction payloads.
