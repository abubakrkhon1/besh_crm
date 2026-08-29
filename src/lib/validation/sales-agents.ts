import { z } from 'zod'

export const assignSalesAgentToManagerSchema = z.object({
  agentProfileId: z.string().uuid('Select a valid sales agent.'),
})

