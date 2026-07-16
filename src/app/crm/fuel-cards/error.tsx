'use client'
import { Button } from '@/components/ui/button'
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="rounded-lg border p-10 text-center"><h2 className="font-semibold">Fuel cards could not be loaded</h2><p className="mb-4 text-sm text-muted-foreground">Try the request again. No provider credentials were exposed.</p><Button onClick={reset}>Try again</Button></div> }
