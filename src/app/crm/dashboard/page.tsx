import { getDashboardStats, getApplications } from '@/app/actions/applications'
import Link from 'next/link'
import { ArrowRight, FileText, CheckCircle, XCircle, Clock } from 'lucide-react'

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  const recentApplications = (await getApplications()).slice(0, 5)

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-sans tracking-tight text-foreground">Dashboard Overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome back. Here is what is happening with fuel card applications today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-6 border-l-4 border-l-slate-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-muted-foreground truncate">Total Applications</dt>
                <dd className="text-2xl font-semibold text-foreground">{stats.total}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-primary">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-muted-foreground truncate">Pending Review</dt>
                <dd className="text-2xl font-semibold text-foreground">{stats.pending}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-green-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-muted-foreground truncate">Approved</dt>
                <dd className="text-2xl font-semibold text-foreground">{stats.approved}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-red-500">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <XCircle className="h-6 w-6 text-red-500" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-muted-foreground truncate">Denied</dt>
                <dd className="text-2xl font-semibold text-foreground">{stats.denied}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Applications */}
      <div className="card overflow-hidden">
        <div className="border-b border-border px-6 py-5 flex justify-between items-center bg-surface">
          <h3 className="text-base font-semibold text-foreground">Recent Applications</h3>
          <Link href="/crm/applications" className="text-sm font-medium text-primary hover:text-primary-dim flex items-center transition-colors">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {recentApplications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No recent applications found.
            </div>
          ) : (
            recentApplications.map((app) => (
              <div key={app.id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-raised transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{app.company_legal_name}</p>
                  <p className="text-sm text-muted-foreground">{app.first_name} {app.last_name} • {app.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground font-mono">
                    {new Date(app.created_at).toLocaleDateString()}
                  </span>
                  {app.status === 'pending' && (
                    <span className="inline-flex items-center rounded-full bg-primary-dim px-2.5 py-0.5 text-xs font-medium text-primary border border-primary">
                      Pending
                    </span>
                  )}
                  {app.status === 'approved' && (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400 border border-green-500/20">
                      Approved
                    </span>
                  )}
                  {app.status === 'denied' && (
                    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
                      Denied
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
