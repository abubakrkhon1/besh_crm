import { describe, expect, it } from 'vitest'
import { applicationSubmissionSchema } from './applications'

const validApplication = {
  company_legal_name: 'Acme Logistics LLC', doing_business_as: null, business_phone: '555-555-5555',
  first_name: 'Alex', last_name: 'Rivera', title: 'Owner', email: 'alex@example.com', country: 'US',
  business_physical_address: '123 Main St', address_line_2: null, city: 'Austin', state_province: 'TX', postal_code: '78701',
  total_trucks: 4, total_drivers: 5, team_drivers_slip_seat: false, legal_structure: 'Limited Liability Company (LLC)',
  business_description: 'Trucking Local', year_established: 2020, parent_company: null, promotional_code: null,
  taxpayer_id: '123456789', business_identifier_type: 'DOT #', business_identifier_number: '1234567', annual_gross_revenue: 500000,
  industry: 'Transportation Services', account_type: 'Open Line of Credit', projected_spend: 10000, payment_method: 'ACH', days_of_payment: 'Net 14',
  financial_institution: 'Example Bank', checking_account_number: '1234567890', aba_routing_number: '123456789',
  residential_country: 'US', residential_address: '456 Oak St', residential_city: 'Austin', residential_state_province: 'TX', residential_postal_code: '78702',
  social_security_number: '123-45-6789', date_of_birth: '1985-01-01', residential_phone: '555-555-5555', mobile_number: null,
  authorized_signer: true, terms_accepted: true,
}

describe('applicationSubmissionSchema', () => {
  it('accepts a complete application', () => {
    expect(applicationSubmissionSchema.safeParse(validApplication).success).toBe(true)
  })

  it('rejects submission without signer consent', () => {
    expect(applicationSubmissionSchema.safeParse({ ...validApplication, authorized_signer: false }).success).toBe(false)
  })

  it('rejects malformed financial and identity fields', () => {
    const result = applicationSubmissionSchema.safeParse({ ...validApplication, aba_routing_number: '12', social_security_number: '1234' })
    expect(result.success).toBe(false)
  })
})

