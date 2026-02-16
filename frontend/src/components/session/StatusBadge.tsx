import { Check, X, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/** Visual badge showing request status (pending/approved/rejected) */
export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      )
    case 'approved':
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <Check className="h-3 w-3" />
          Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <X className="h-3 w-3" />
          Rejected
        </Badge>
      )
    default:
      return null
  }
}
