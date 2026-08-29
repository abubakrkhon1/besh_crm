import { z } from 'zod'
import { isValidLocalDateTime, localDateTimeToIso } from '../date-time'

export const leadAccountTypes = ['prepaid_account', 'deposit', 'credit_line'] as const
export const leadStatuses = ['new', 'successful', 'deal_lost', 'on_the_process', 'follow_up'] as const
export const leadPriorities = ['low', 'normal', 'high', 'urgent'] as const

const optionalText = (label: string, maxLength: number) =>
  z.string()
    .trim()
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`)
    .transform((value) => value || null)

const optionalWholeNumber = (label: string, maxValue: number) =>
  z.string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), `${label} must be a whole number of zero or more.`)
    .refine((value) => value === '' || Number(value) <= maxValue, `${label} must be ${maxValue.toLocaleString()} or less.`)
    .transform((value) => value === '' ? null : Number(value))

export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(80, 'First name must be 80 characters or fewer.'),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(80, 'Last name must be 80 characters or fewer.'),
  companyName: optionalText('Company name', 160),
  email: z.string()
    .trim()
    .max(254, 'Email must be 254 characters or fewer.')
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address.')
    .transform((value) => value || null),
  phone: z.string()
    .trim()
    .max(30, 'Phone number must be 30 characters or fewer.')
    .refine((value) => value === '' || /^[+\d][\d\s()+.-]*$/.test(value), 'Enter a valid phone number.')
    .transform((value) => value || null),
  fleetSize: optionalWholeNumber('Fleet size', 1_000_000),
  preferredNetwork: optionalText('Preferred network', 100),
  estimatedMonthlyGallons: optionalWholeNumber('Estimated monthly gallons', 1_000_000_000),
  accountType: z.enum(leadAccountTypes, { error: 'Select an account type.' }),
  source: z.string()
    .trim()
    .max(80, 'Source must be 80 characters or fewer.')
    .transform((value) => value || 'manual'),
  notes: optionalText('Notes', 2_000),
}).superRefine((lead, context) => {
  if (!lead.email && !lead.phone) {
    context.addIssue({
      code: 'custom',
      path: ['email'],
      message: 'Enter an email address or phone number.',
    })
  }
})

export type CreateLeadField = keyof z.input<typeof createLeadSchema>

export const updateLeadSchema = createLeadSchema.safeExtend({
  leadId: z.string().uuid('Invalid lead.'),
  status: z.enum(leadStatuses, { error: 'Select a lead status.' }),
})

export type UpdateLeadField = keyof z.input<typeof updateLeadSchema>

export const assignLeadSchema = z.object({
  leadId: z.string().uuid('Invalid lead.'),
  agentProfileId: z.string()
    .transform((value) => value.trim() || null)
    .pipe(z.string().uuid('Select a valid sales agent.').nullable()),
})

export type AssignLeadField = keyof z.input<typeof assignLeadSchema>

export const updateLeadWorkPlanSchema = z.object({
  leadId: z.string().uuid('Invalid lead.'),
  priority: z.enum(leadPriorities, { error: 'Select a lead priority.' }),
  nextFollowUpAt: z.string()
    .trim()
    .refine((value) => value === '' || isValidLocalDateTime(value), 'Enter a valid follow-up date and time.'),
  timezoneOffsetMinutes: z.string()
    .trim()
    .regex(/^-?\d+$/, 'Invalid timezone offset.')
    .transform(Number)
    .refine((value) => Number.isInteger(value) && Math.abs(value) <= 840, 'Invalid timezone offset.'),
}).transform((workPlan) => ({
  leadId: workPlan.leadId,
  priority: workPlan.priority,
  nextFollowUpAt: localDateTimeToIso(workPlan.nextFollowUpAt, workPlan.timezoneOffsetMinutes)!,
}))

export type UpdateLeadWorkPlanField = keyof z.input<typeof updateLeadWorkPlanSchema>

export const addLeadNoteSchema = z.object({
  leadId: z.string().uuid('Invalid lead.'),
  note: z.string().trim().min(1, 'Enter a note.').max(2_000, 'Note must be 2,000 characters or fewer.'),
})

export type AddLeadNoteField = keyof z.input<typeof addLeadNoteSchema>
