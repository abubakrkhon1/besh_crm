import { describe, expect, it } from 'vitest'
import { updateCustomerSchema } from './customers'

const validCustomer = {
  customerId: '11111111-1111-4111-8111-111111111111',
  companyName: 'Test Fleet LLC',
  contactName: 'Taylor Test',
  email: 'Taylor@Example.com',
  phone: '+1 555 010 1000',
  status: 'active',
  creditLimit: '15000',
  notes: 'Test account',
}

describe('updateCustomerSchema', () => {
  it('normalizes editable customer fields', () => {
    const result = updateCustomerSchema.parse(validCustomer)
    expect(result.email).toBe('taylor@example.com')
    expect(result.creditLimit).toBe(15000)
  })

  it('turns optional blank fields into null', () => {
    const result = updateCustomerSchema.parse({ ...validCustomer, contactName: '', email: '', phone: '', notes: '' })
    expect(result).toMatchObject({ contactName: null, email: null, phone: null, notes: null })
  })

  it('rejects invalid email, status, and credit limits', () => {
    expect(updateCustomerSchema.safeParse({ ...validCustomer, email: 'bad-email' }).success).toBe(false)
    expect(updateCustomerSchema.safeParse({ ...validCustomer, status: 'deleted' }).success).toBe(false)
    expect(updateCustomerSchema.safeParse({ ...validCustomer, creditLimit: '-1' }).success).toBe(false)
  })
})
