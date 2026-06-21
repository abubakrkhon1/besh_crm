'use client'

import { useState } from 'react'
import { Application } from '@/types/database.types'
import { ApplicationDetailsModal } from './ApplicationDetailsModal'
import { NewApplicationModal } from './NewApplicationModal'
import { Search, Filter, Check, X, Clock, Plus } from 'lucide-react'

export function ApplicationsTable({ initialApplications }: { initialApplications: Application[] }) {
  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleNewAppSuccess = (newApp: Application) => {
    setApplications(apps => [newApp, ...apps])
    setIsNewModalOpen(false)
  }

  const filteredApps = applications.filter((app) => {
    const matchesSearch =
      app.company_legal_name.toLowerCase().includes(search.toLowerCase()) ||
      app.first_name.toLowerCase().includes(search.toLowerCase()) ||
      app.last_name.toLowerCase().includes(search.toLowerCase()) ||
      app.email.toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 border border-green-500/20">
            <Check size={12} /> Approved
          </span>
        )
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 border border-red-500/20">
            <X size={12} /> Denied
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-dim px-2 py-1 text-xs font-medium text-primary border border-primary">
            <Clock size={12} /> Pending
          </span>
        )
    }
  }

  const handleUpdateApp = (updatedApp: Application) => {
    setApplications(apps => apps.map(a => a.id === updatedApp.id ? updatedApp : a))
    setSelectedApp(updatedApp)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-surface p-4 rounded-xl border border-border">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search company, name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} /> New Application
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 text-sm font-semibold text-muted-foreground font-mono tracking-wider">Company</th>
              <th className="p-4 text-sm font-semibold text-muted-foreground font-mono tracking-wider">Contact</th>
              <th className="p-4 text-sm font-semibold text-muted-foreground font-mono tracking-wider">Phone</th>
              <th className="p-4 text-sm font-semibold text-muted-foreground font-mono tracking-wider">Submitted</th>
              <th className="p-4 text-sm font-semibold text-muted-foreground font-mono tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredApps.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-sm text-muted-foreground">
                  No applications found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredApps.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className="cursor-pointer hover:bg-surface-raised transition-colors"
                >
                  <td className="p-4">
                    <div className="font-medium text-foreground">{app.company_legal_name}</div>
                    {app.doing_business_as && (
                      <div className="text-xs text-muted-foreground">DBA: {app.doing_business_as}</div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-foreground">{app.first_name} {app.last_name}</div>
                    <div className="text-xs text-muted-foreground">{app.email}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-foreground">{app.business_phone}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-muted-foreground">
                      {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-4">
                    {getStatusBadge(app.status)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedApp && (
        <ApplicationDetailsModal
          application={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={handleUpdateApp}
        />
      )}

      {isNewModalOpen && (
        <NewApplicationModal
          onClose={() => setIsNewModalOpen(false)}
          onSuccess={handleNewAppSuccess}
        />
      )}
    </div>
  )
}
