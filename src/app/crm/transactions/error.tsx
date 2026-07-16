'use client'
import { Button } from '@/components/ui/button'
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="rounded-lg border p-10 text-center"><h2 className="font-semibold">Transactions could not be loaded</h2><p className="mb-4 text-sm text-muted-foreground">The synchronized Supabase data is temporarily unavailable.</p><Button onClick={reset}>Try again</Button></div> }
