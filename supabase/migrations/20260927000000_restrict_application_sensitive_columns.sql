-- Keep applicant identity and banking fields out of browser-authenticated queries.
-- Full-access CRM roles read complete application details only through role-gated
-- server actions using the service-role client. Sales managers receive the safe
-- projection from those actions and cannot query sensitive columns directly.

revoke select on table public.applications from anon, authenticated;

grant select (
  id,
  auth_user_id,
  status,
  company_legal_name,
  doing_business_as,
  business_phone,
  first_name,
  last_name,
  title,
  email,
  country,
  business_physical_address,
  address_line_2,
  city,
  state_province,
  postal_code,
  total_trucks,
  total_drivers,
  team_drivers_slip_seat,
  legal_structure,
  business_description,
  year_established,
  parent_company,
  promotional_code,
  business_identifier_type,
  business_identifier_number,
  annual_gross_revenue,
  industry,
  account_type,
  projected_spend,
  payment_method,
  days_of_payment,
  financial_institution,
  residential_country,
  residential_address,
  residential_city,
  residential_state_province,
  residential_postal_code,
  residential_phone,
  mobile_number,
  authorized_signer,
  terms_accepted,
  submitted_at,
  reviewed_at,
  reviewed_by,
  denial_reason,
  created_at,
  updated_at
) on table public.applications to authenticated;

revoke update on table public.applications from authenticated;
grant update (
  status,
  reviewed_at,
  reviewed_by,
  denial_reason
) on table public.applications to authenticated;
