'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Application } from '@/types/database.types'
import { updateApplicationStatus } from '@/app/actions/applications'
import { X, Check, Clock, Loader2 } from 'lucide-react'

interface ModalProps {
  application: Application
  onClose: () => void
  onUpdate: (app: Application) => void
}

export function ApplicationDetailsModal({ application, onClose, onUpdate }: ModalProps) {
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showDenialInput, setShowDenialInput] = useState(false)
  const [denialReason, setDenialReason] = useState('')

  useEffect(() => {
    setMounted(true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [])

  const handleStatusChange = (newStatus: Application['status'], reason?: string) => {
    startTransition(async () => {
      const result = await updateApplicationStatus(application.id, newStatus, reason)
      if (result.success) {
        onUpdate({ 
          ...application, 
          status: newStatus,
          denial_reason: reason || null,
          reviewed_at: new Date().toISOString()
        })
        setShowDenialInput(false)
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-400 border border-green-500/20">
            <Check size={14} /> Approved
          </span>
        )
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/20">
            <X size={14} /> Denied
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-dim px-3 py-1.5 text-sm font-medium text-primary border border-primary">
            <Clock size={14} /> Pending
          </span>
        )
    }
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-border rounded-xl bg-surface overflow-hidden mb-6">
      <div className="bg-surface-raised px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        {children}
      </div>
    </div>
  )

  const Field = ({ label, value, fullWidth }: { label: string; value: React.ReactNode; fullWidth?: boolean }) => (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
      <div className="text-sm text-foreground">{value || <span className="text-muted-foreground italic">Not provided</span>}</div>
    </div>
  )

  if (!mounted) return null

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-border bg-surface-raised shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">{application.company_legal_name}</h2>
            <div className="flex gap-3 items-center">
              {getStatusBadge(application.status)}
              <span className="text-xs text-muted-foreground font-mono">
                ID: {application.id.slice(0, 8)}...
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-surface transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          <Section title="Applicant Information">
            <Field label="First Name" value={application.first_name} />
            <Field label="Last Name" value={application.last_name} />
            <Field label="Title" value={application.title} />
            <Field label="Authorized Signer" value={application.authorized_signer ? 'Yes' : 'No'} />
            <Field label="Date of Birth" value={application.date_of_birth} />
            <Field label="Social Security Number" value={application.social_security_number} />
          </Section>

          <Section title="Business Information">
            <Field label="Legal Name" value={application.company_legal_name} />
            <Field label="Doing Business As (DBA)" value={application.doing_business_as} />
            <Field label="Industry" value={application.industry} />
            <Field label="Legal Structure" value={application.legal_structure} />
            <Field label="Year Established" value={application.year_established} />
            <Field label="Parent Company" value={application.parent_company} />
            <Field label="Taxpayer ID (EIN)" value={application.taxpayer_id} />
            <Field label="Business Identifier" value={`${application.business_identifier_type}: ${application.business_identifier_number}`} />
            <Field label="Business Description" value={application.business_description} fullWidth />
          </Section>

          <Section title="Contact & Address">
            <Field label="Email Address" value={application.email} />
            <Field label="Business Phone" value={application.business_phone} />
            <Field label="Mobile Phone" value={application.mobile_number} />
            <Field label="Residential Phone" value={application.residential_phone} />
            
            <Field 
              label="Business Physical Address" 
              value={
                <>
                  {application.business_physical_address}
                  {application.address_line_2 && <><br />{application.address_line_2}</>}
                  <br />
                  {application.city}, {application.state_province} {application.postal_code}
                  <br />
                  {application.country}
                </>
              } 
            />
            
            <Field 
              label="Residential Address" 
              value={
                <>
                  {application.residential_address}
                  <br />
                  {application.residential_city}, {application.residential_state_province} {application.residential_postal_code}
                  <br />
                  {application.residential_country}
                </>
              } 
            />
          </Section>

          <Section title="Financial Information">
            <Field label="Annual Gross Revenue" value={application.annual_gross_revenue ? `$${Number(application.annual_gross_revenue).toLocaleString()}` : null} />
            <Field label="Projected Spend" value={application.projected_spend ? `$${Number(application.projected_spend).toLocaleString()}` : null} />
            <Field label="Account Type" value={application.account_type} />
            <Field label="Payment Method" value={application.payment_method} />
            <Field label="Days of Payment" value={application.days_of_payment} />
            <Field label="Financial Institution" value={application.financial_institution} />
            <Field label="Routing Number" value={application.aba_routing_number} />
            <Field label="Checking Account" value={application.checking_account_number} />
          </Section>

          <Section title="Fleet Information">
            <Field label="Total Trucks" value={application.total_trucks} />
            <Field label="Total Drivers" value={application.total_drivers} />
            <Field label="Team Drivers / Slip Seat" value={application.team_drivers_slip_seat ? 'Yes' : 'No'} />
          </Section>

          <Section title="Status & Timestamps">
            <Field label="Terms Accepted" value={application.terms_accepted ? 'Yes' : 'No'} />
            <Field label="Promo Code" value={application.promotional_code} />
            <Field label="Created At" value={new Date(application.created_at).toLocaleString()} />
            <Field label="Submitted At" value={application.submitted_at ? new Date(application.submitted_at).toLocaleString() : null} />
            {application.reviewed_at && (
              <Field label="Reviewed At" value={new Date(application.reviewed_at).toLocaleString()} />
            )}
            {application.denial_reason && (
              <Field label="Denial Reason" value={application.denial_reason} fullWidth />
            )}
          </Section>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border bg-surface-raised shrink-0">
          {showDenialInput ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label htmlFor="denialReason" className="block text-sm font-medium text-foreground mb-1">
                  Reason for Denial
                </label>
                <textarea
                  id="denialReason"
                  rows={3}
                  className="input-field min-h-[80px] resize-y"
                  placeholder="Please provide a reason for denying this application..."
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDenialInput(false)}
                  disabled={isPending}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStatusChange('denied', denialReason)}
                  disabled={isPending || !denialReason.trim()}
                  className="btn-danger flex items-center gap-2"
                >
                  {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <X size={16} />} 
                  Confirm Deny
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              {application.status === 'pending' && (
                <>
                  <button
                    onClick={() => setShowDenialInput(true)}
                    disabled={isPending}
                    className="btn-danger flex items-center gap-2"
                  >
                    <X size={16} /> Deny
                  </button>
                  <button
                    onClick={() => handleStatusChange('approved')}
                    disabled={isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Check size={16} />} Approve
                  </button>
                </>
              )}
              {application.status !== 'pending' && (
                <button
                  onClick={() => handleStatusChange('pending')}
                  disabled={isPending}
                  className="btn-secondary flex items-center gap-2"
                >
                  {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Clock size={16} />} Mark Pending
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
