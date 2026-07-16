import { cn } from '@/lib/utils'

export interface TimelineEvent {
  id: string
  title: string
  description?: string
  date: string
  icon?: React.ReactNode
  isLast?: boolean
}

interface ActivityTimelineProps {
  events: TimelineEvent[]
  className?: string
}

export function ActivityTimeline({ events, className }: ActivityTimelineProps) {
  return (
    <div className={cn('flow-root', className)}>
      <ul role="list" className="-mb-8">
        {events.map((event, eventIdx) => {
          const isLast = eventIdx === events.length - 1
          return (
            <li key={event.id}>
              <div className="relative pb-8">
                {!isLast ? (
                  <span
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-surface bg-surface-raised',
                        event.icon ? 'text-primary' : 'bg-border text-muted-foreground'
                      )}
                    >
                      {event.icon || <div className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{event.title}</p>
                      {event.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-right text-sm text-muted-foreground">
                      <time dateTime={event.date}>{event.date}</time>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
