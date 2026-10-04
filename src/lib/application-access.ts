import type { Application } from '@/types/database.types'

export const APPLICATION_SENSITIVE_FIELDS = [
  'taxpayer_id',
  'checking_account_number',
  'aba_routing_number',
  'social_security_number',
  'date_of_birth',
] as const satisfies readonly (keyof Application)[]

type ApplicationSensitiveField = (typeof APPLICATION_SENSITIVE_FIELDS)[number]

export type ApplicationSafe = Omit<Application, ApplicationSensitiveField>
export type ApplicationForReview = ApplicationSafe & {
  [Field in ApplicationSensitiveField]: Application[Field] | null
}

export const APPLICATION_SAFE_COLUMNS = [
  'id',
  'auth_user_id',
  'status',
  'company_legal_name',
  'doing_business_as',
  'business_phone',
  'first_name',
  'last_name',
  'title',
  'email',
  'country',
  'business_physical_address',
  'address_line_2',
  'city',
  'state_province',
  'postal_code',
  'total_trucks',
  'total_drivers',
  'team_drivers_slip_seat',
  'legal_structure',
  'business_description',
  'year_established',
  'parent_company',
  'promotional_code',
  'business_identifier_type',
  'business_identifier_number',
  'annual_gross_revenue',
  'industry',
  'account_type',
  'projected_spend',
  'payment_method',
  'days_of_payment',
  'financial_institution',
  'residential_country',
  'residential_address',
  'residential_city',
  'residential_state_province',
  'residential_postal_code',
  'residential_phone',
  'mobile_number',
  'authorized_signer',
  'terms_accepted',
  'submitted_at',
  'reviewed_at',
  'reviewed_by',
  'denial_reason',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof ApplicationSafe)[]

export const APPLICATION_SAFE_SELECT = APPLICATION_SAFE_COLUMNS.join(',')

export function withoutSensitiveApplicationFields(application: ApplicationSafe): ApplicationForReview {
  return {
    ...application,
    taxpayer_id: null,
    checking_account_number: null,
    aba_routing_number: null,
    social_security_number: null,
    date_of_birth: null,
  }
}
