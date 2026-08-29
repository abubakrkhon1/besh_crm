'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignSalesAgentToCurrentManager,
  type AssignableSalesAgent,
} from '@/app/actions/sales-agents'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { initials } from '@/components/crm/SalesRepresentativesTable'

export function SalesAgentTeamAssignment({ agents }: { agents: AssignableSalesAgent[] }) {
  const router = useRouter()
  const [availableAgents, setAvailableAgents] = useState(agents)

  const assigned = (agentId: string) => {
    setAvailableAgents((current) => current.filter((agent) => agent.id !== agentId))
    router.refresh()
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" />}>
        <UserPlus data-icon="inline-start" />
        Assign sales agents
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign sales agents to your team</DialogTitle>
          <DialogDescription>
            Only active agents who are not managed by another sales manager are available.
          </DialogDescription>
        </DialogHeader>

        {availableAgents.length ? (
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales agent</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableAgents.map((agent) => {
                  const name = agent.full_name ?? agent.email ?? 'Unnamed sales agent'
                  return (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                              {initials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            {agent.full_name && agent.email && (
                              <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{agent.department ?? 'Unassigned'}</TableCell>
                      <TableCell className="text-right">
                        <AssignAgentButton agentId={agent.id} onAssigned={assigned} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Alert>
            <Users />
            <AlertTitle>No unassigned sales agents</AlertTitle>
            <AlertDescription>Every active sales agent already belongs to a manager.</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AssignAgentButton({ agentId, onAssigned }: { agentId: string; onAssigned: (agentId: string) => void }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await assignSalesAgentToCurrentManager({ agentProfileId: agentId })
        if (result.ok) {
          toast.success(result.message)
          onAssigned(agentId)
        } else {
          toast.error(result.message)
        }
      })}
    >
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <UserPlus data-icon="inline-start" />}
      {pending ? 'Assigning…' : 'Assign to me'}
    </Button>
  )
}
