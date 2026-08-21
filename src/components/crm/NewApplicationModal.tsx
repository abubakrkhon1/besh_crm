'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Application } from '@/types/database.types'
import { createApplication } from '@/app/actions/applications'
import { submitInvitedApplication } from '@/app/actions/application-invitations'
import type { ApplicationSubmission } from '@/lib/validation/applications'
import { CheckCircle2, X, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewApplicationModalProps {
  onClose?: () => void
  onSuccess?: (app: Application) => void
  embedded?: boolean
  invitationToken?: string
  initialEmail?: string
}

const US_STATES = [
  'AK', 'AL', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'FM', 'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MH', 'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'PW', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY'
]

export function NewApplicationModal({ onClose, onSuccess, embedded = false, invitationToken, initialEmail = '' }: NewApplicationModalProps) {
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Dynamic dropdown states
  const [accountType, setAccountType] = useState('Open Line of Credit')
  const [authSigner, setAuthSigner] = useState(false)

  useEffect(() => {
    // This portal must wait for the browser document before rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    if (!embedded) document.body.style.overflow = 'hidden'
    return () => {
      if (!embedded) document.body.style.overflow = 'auto'
    }
  }, [embedded])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    
    const form = e.currentTarget
    const formData = new FormData(form)
    const value = (name: string) => String(formData.get(name) ?? '').trim()
    const optionalValue = (name: string) => value(name) || null
    
    // Validations for confirm fields
    if (formData.get('email') !== formData.get('confirm_email')) {
      return setError('Emails do not match.')
    }
    if (formData.get('checking_account_number') !== formData.get('confirm_checking_account_number')) {
      return setError('Checking account numbers do not match.')
    }
    if (formData.get('aba_routing_number') !== formData.get('confirm_aba_routing_number')) {
      return setError('Routing numbers do not match.')
    }
    if (formData.get('social_security_number') !== formData.get('confirm_social_security_number')) {
      return setError('Social Security numbers do not match.')
    }

    if (!authSigner) {
      return setError('You must acknowledge the disclaimer.')
    }

    startTransition(async () => {
      const dataToSubmit: ApplicationSubmission = {
        company_legal_name: value('company_legal_name'),
        doing_business_as: optionalValue('doing_business_as'),
        business_phone: value('business_phone'),
        first_name: value('first_name'),
        last_name: value('last_name'),
        title: value('title'),
        email: value('email'),
        country: value('country'),
        business_physical_address: value('business_physical_address'),
        address_line_2: optionalValue('address_line_2'),
        city: value('city'),
        state_province: value('state_province'),
        postal_code: value('postal_code'),
        total_trucks: Number(value('total_trucks')),
        total_drivers: Number(value('total_drivers')),
        team_drivers_slip_seat: formData.get('team_drivers_slip_seat') === 'on',
        legal_structure: value('legal_structure'),
        business_description: value('business_description'),
        year_established: Number(value('year_established')),
        parent_company: optionalValue('parent_company'),
        promotional_code: optionalValue('promotional_code'),
        taxpayer_id: value('taxpayer_id'),
        business_identifier_type: value('business_identifier_type') === 'None' ? null : optionalValue('business_identifier_type'),
        business_identifier_number: optionalValue('business_identifier_number'),
        annual_gross_revenue: value('annual_gross_revenue') ? Number(value('annual_gross_revenue')) : null,
        industry: value('industry'),
        account_type: value('account_type'),
        projected_spend: Number(value('projected_spend')),
        payment_method: value('payment_method'),
        days_of_payment: optionalValue('days_of_payment'),
        financial_institution: value('financial_institution'),
        checking_account_number: value('checking_account_number'),
        aba_routing_number: value('aba_routing_number'),
        residential_country: value('residential_country'),
        residential_address: value('residential_address'),
        residential_city: value('residential_city'),
        residential_state_province: value('residential_state_province'),
        residential_postal_code: value('residential_postal_code'),
        social_security_number: value('social_security_number'),
        date_of_birth: value('date_of_birth'),
        residential_phone: value('residential_phone'),
        mobile_number: optionalValue('mobile_number'),
        authorized_signer: authSigner,
        terms_accepted: authSigner,
      }

      if (invitationToken) {
        const result = await submitInvitedApplication(invitationToken, dataToSubmit)
        if (result.error) setError(result.error)
        else if (result.success) setSubmitted(true)
        return
      }

      const result = await createApplication(dataToSubmit)
      if (result.error) setError(result.error)
      else if (result.success && result.application) onSuccess?.(result.application)
    })
  }

  if (!mounted) return null

  if (embedded && submitted) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="size-12 text-status-success-foreground" />
        <div className="flex max-w-md flex-col gap-2">
          <h2 className="text-2xl font-bold">Application submitted</h2>
          <p className="text-muted-foreground">Thank you. The BESH team has received your application and will contact you after it has been reviewed.</p>
        </div>
      </div>
    )
  }

  const content = (
    <div 
      className={cn(!embedded && 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6')}
      onClick={() => !embedded && onClose?.()}
    >
      <div 
        className={cn('flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-fade-in', embedded ? 'min-h-[36rem]' : 'max-h-[90vh] max-w-4xl')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border bg-surface-raised shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">New Application</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Complete all required sections below to submit a new application.
              </p>
            </div>
          </div>
          {!embedded && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-surface transition-colors"
              aria-label="Close application form"
            >
              <X size={24} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
              {error}
            </div>
          )}

          <form id={embedded ? 'public-app-form' : 'full-app-form'} onSubmit={handleSubmit} className="space-y-10">
            {/* Applicant Information */}
            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Applicant Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Company Legal Name *</label>
                  <input required name="company_legal_name" className="input-field w-full" placeholder="Acme LLC" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Doing Business As</label>
                  <input name="doing_business_as" className="input-field w-full" placeholder="Acme Logistics" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Business Phone *</label>
                  <input required name="business_phone" className="input-field w-full" placeholder="555-555-5555" pattern="[0-9\-]+" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
                  <select required name="title" className="input-field w-full">
                    <option value="">Select Title</option>
                    <option value="President">President</option>
                    <option value="CFO">CFO</option>
                    <option value="CEO">CEO</option>
                    <option value="COO">COO</option>
                    <option value="Owner">Owner</option>
                    <option value="Partner">Partner</option>
                    <option value="Vice President">Vice President</option>
                    <option value="Treasurer">Treasurer</option>
                    <option value="Founder">Founder</option>
                    <option value="Co-Founder">Co-Founder</option>
                    <option value="Other Officer">Other Officer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">First Name *</label>
                  <input required name="first_name" className="input-field w-full" placeholder="John" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Last Name *</label>
                  <input required name="last_name" className="input-field w-full" placeholder="Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Email Address *</label>
                  <input required type="email" name="email" className="input-field w-full" placeholder="john@example.com" defaultValue={initialEmail} readOnly={Boolean(invitationToken)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Confirm Email Address *</label>
                  <input required type="email" name="confirm_email" className="input-field w-full" placeholder="john@example.com" defaultValue={initialEmail} readOnly={Boolean(invitationToken)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Country *</label>
                  <select required name="country" className="input-field w-full" defaultValue="US">
                    <option value="US">US</option>
                    <option value="CA" disabled>CA</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Business Physical Address *</label>
                  <input required name="business_physical_address" className="input-field w-full" placeholder="123 Main St (No PO Box)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Address Line 2</label>
                  <input name="address_line_2" className="input-field w-full" placeholder="Suite 100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">City *</label>
                  <input required name="city" className="input-field w-full" placeholder="Metropolis" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">State / Province *</label>
                  <select required name="state_province" className="input-field w-full">
                    <option value="">Select State</option>
                    {US_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Postal Code *</label>
                  <input required name="postal_code" className="input-field w-full" placeholder="12345" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Total Trucks *</label>
                  <input required type="number" min="1" name="total_trucks" className="input-field w-full" placeholder="5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Total Drivers *</label>
                  <input required type="number" min="1" name="total_drivers" className="input-field w-full" placeholder="5" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2 mt-2">
                  <input type="checkbox" id="team_drivers" name="team_drivers_slip_seat" className="rounded border-border text-primary focus:ring-primary w-4 h-4" />
                  <label htmlFor="team_drivers" className="text-sm font-medium text-foreground">Team Drivers / Slip Seat</label>
                </div>
              </div>
            </section>

            {/* Business Information */}
            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Business Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Legal Structure *</label>
                  <select required name="legal_structure" className="input-field w-full">
                    <option value="">Select Structure</option>
                    <option value="Corporation">Corporation</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Non-Profit">Non-Profit</option>
                    <option value="Limited Liability Company (LLC)">Limited Liability Company (LLC)</option>
                    <option value="Sole Proprietorship">Sole Proprietorship</option>
                    <option value="Bank/Bank Holding Co/Credit Union">Bank/Bank Holding Co/Credit Union</option>
                    <option value="Federal/State/Local Government Agency or Authority">Federal/State/Local Government Agency or Authority</option>
                    <option value="Insurance Company">Insurance Company</option>
                    <option value="Investment Company/Adviser">Investment Company/Adviser</option>
                    <option value="Non-Statutory Trust">Non-Statutory Trust</option>
                    <option value="Public Accounting Firm">Public Accounting Firm</option>
                    <option value="Public Company and Majority Owned Affiliate">Public Company and Majority Owned Affiliate</option>
                    <option value="Unincorporated Association">Unincorporated Association</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Business Description *</label>
                  <select required name="business_description" className="input-field w-full">
                    <option value="">Select Description</option>
                    <option value="Trucking Interstate/Long Haul">Trucking Interstate/Long Haul</option>
                    <option value="Trucking Local">Trucking Local</option>
                    <option value="Local Delivery">Local Delivery</option>
                    <option value="Regional">Regional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Year Established *</label>
                  <input required type="number" min="1800" max={new Date().getFullYear()} name="year_established" className="input-field w-full" placeholder="2010" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Parent Company</label>
                  <input name="parent_company" className="input-field w-full" placeholder="Parent Corp" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Promotional Code</label>
                  <input name="promotional_code" className="input-field w-full" placeholder="PROMO2026" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Taxpayer ID (EIN) *</label>
                  <input required name="taxpayer_id" className="input-field w-full" placeholder="123456789" pattern="\d{9}" title="9 digits, no dashes" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Fleet Identifier *</label>
                  <select required name="business_identifier_type" className="input-field w-full">
                    <option value="">Select Type</option>
                    <option value="MC #">MC #</option>
                    <option value="FF #">FF #</option>
                    <option value="DOT #">DOT #</option>
                    <option value="None">No assigned number</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Fleet Identifier Number</label>
                  <input name="business_identifier_number" className="input-field w-full" placeholder="Number (if applicable)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Annual Gross Revenue</label>
                  <input type="number" min="0" step="0.01" name="annual_gross_revenue" className="input-field w-full" placeholder="1000000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Industry *</label>
                  <select required name="industry" className="input-field w-full">
                    <option value="">Select Industry</option>
                    <option value="Transportation Services">Transportation Services</option>
                    <option value="Automotive Dealers">Automotive Dealers</option>
                    <option value="Repair Services">Repair Services</option>
                    <option value="Construction">Construction</option>
                    <option value="Retail Trade">Retail Trade</option>
                    <option value="Equipment Rental and Leasing">Equipment Rental and Leasing</option>
                    <option value="Industrial Machinery and Equipment">Industrial Machinery and Equipment</option>
                    <option value="Motor Freight Transportation and Warehousing">Motor Freight Transportation and Warehousing</option>
                    <option value="Transportation Equipment">Transportation Equipment</option>
                    <option value="Wholesale Trade">Wholesale Trade</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Payment Information */}
            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Payment Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Account Type *</label>
                  <select 
                    required 
                    name="account_type" 
                    className="input-field w-full"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <option value="Open Line of Credit">Open Line of Credit</option>
                    <option value="Deposit Account">Deposit Account</option>
                    <option value="Prepay">Prepay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Projected Spend *</label>
                  <input required type="number" min="0" step="1" name="projected_spend" className="input-field w-full" placeholder="5000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Payment Method *</label>
                  <select required name="payment_method" className="input-field w-full">
                    <option value="">Select Payment Method</option>
                    <option value="ACH">ACH Direct Debit</option>
                    <option value="Wire">Wire Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                {accountType === 'Open Line of Credit' && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Days of Payment *</label>
                    <select required name="days_of_payment" className="input-field w-full">
                      <option value="">Select Days</option>
                      <option value="Net 7">Net 7</option>
                      <option value="Net 14">Net 14</option>
                      <option value="Net 30">Net 30</option>
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* Bank Information */}
            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Bank Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Financial Institution *</label>
                  <input required name="financial_institution" className="input-field w-full" placeholder="Bank Name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Checking Account # *</label>
                  <input required name="checking_account_number" className="input-field w-full" placeholder="1234567890" pattern="\d+" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Confirm Checking Account # *</label>
                  <input required name="confirm_checking_account_number" className="input-field w-full" placeholder="1234567890" pattern="\d+" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">ABA Routing # *</label>
                  <input required name="aba_routing_number" className="input-field w-full" placeholder="123456789" pattern="\d{9}" title="9 digits" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Confirm ABA Routing # *</label>
                  <input required name="confirm_aba_routing_number" className="input-field w-full" placeholder="123456789" pattern="\d{9}" title="9 digits" />
                </div>
              </div>
            </section>

            {/* Personal Guaranty */}
            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Personal Guaranty</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Residential Country *</label>
                  <select required name="residential_country" className="input-field w-full" defaultValue="US">
                    <option value="US">US</option>
                    <option value="CA" disabled>CA</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Residential Address *</label>
                  <input required name="residential_address" className="input-field w-full" placeholder="123 Main St (No PO Box)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Residential City *</label>
                  <input required name="residential_city" className="input-field w-full" placeholder="Metropolis" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Residential State / Province *</label>
                  <select required name="residential_state_province" className="input-field w-full">
                    <option value="">Select State</option>
                    {US_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Residential Postal Code *</label>
                  <input required name="residential_postal_code" className="input-field w-full" placeholder="12345" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Social Security Number *</label>
                  <input required name="social_security_number" className="input-field w-full" placeholder="123-45-6789" pattern="\d{3}-\d{2}-\d{4}" title="Format: ###-##-####" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Confirm Social Security Number *</label>
                  <input required name="confirm_social_security_number" className="input-field w-full" placeholder="123-45-6789" pattern="\d{3}-\d{2}-\d{4}" title="Format: ###-##-####" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Date of Birth *</label>
                  <input required type="date" name="date_of_birth" className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Residential Phone *</label>
                  <input required name="residential_phone" className="input-field w-full" placeholder="555-555-5555" pattern="[0-9\-]+" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Mobile Number</label>
                  <input name="mobile_number" className="input-field w-full" placeholder="555-555-5555" pattern="[0-9\-]+" />
                </div>
              </div>
            </section>

            {/* Terms & Conditions */}
            <section className="space-y-5 bg-primary/5 p-4 rounded-xl border border-primary/20">
              <h3 className="text-lg font-semibold text-foreground pb-2">Terms & Conditions</h3>
              <div className="flex items-start gap-3">
                <input 
                  required
                  type="checkbox" 
                  id="authorized_signer" 
                  checked={authSigner}
                  onChange={(e) => setAuthSigner(e.target.checked)}
                  className="mt-1 rounded border-border text-primary focus:ring-primary w-4 h-4" 
                />
                <label htmlFor="authorized_signer" className="text-sm text-foreground">
                  I acknowledge the disclaimer and certify that I am an Authorized Signer for the company listed above. I agree to the Terms and Conditions and understand that submitting this application constitutes a legal agreement.
                </label>
              </div>
            </section>
          </form>
        </div>

        <div className="p-6 border-t border-border bg-surface-raised shrink-0 flex justify-end gap-3">
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
          )}
          <button
            form={embedded ? 'public-app-form' : 'full-app-form'}
            type="submit"
            disabled={isPending}
            className="btn-primary flex items-center gap-2"
          >
            {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus size={16} />} 
            Submit Application
          </button>
        </div>
      </div>
    </div>
  )

  return embedded ? content : createPortal(content, document.body)
}
