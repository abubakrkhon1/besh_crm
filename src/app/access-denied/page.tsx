import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Fuel CRM access required</CardTitle>
          <CardDescription>
            This account belongs to Besh Mobile or does not have an active CRM role.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ask an owner or administrator to assign the correct staff role.
        </CardContent>
        <CardFooter>
          <form action={logout} className="w-full">
            <Button type="submit" variant="outline" className="w-full">Sign out</Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  )
}
