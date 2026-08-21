import 'server-only'

export type EmailDeliveryResult =
  | { sent: true; providerMessageId: string | null }
  | { sent: false; error: string }

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!)
}

export async function sendApplicationEmail(input: { to: string; subject: string; html: string }): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.APPLICATION_INVITATION_FROM_EMAIL
  if (!apiKey || !from) return { sent: false, error: 'Email delivery is not configured.' }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
    })

    if (!response.ok) {
      console.error('Application email delivery failed:', response.status, await response.text())
      return { sent: false, error: 'The email provider rejected the message.' }
    }

    const body = await response.json() as { id?: string }
    return { sent: true, providerMessageId: body.id ?? null }
  } catch (error) {
    console.error('Application email request failed:', error)
    return { sent: false, error: 'The email provider could not be reached.' }
  }
}

