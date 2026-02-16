import { Music } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No song requests yet</h3>
        <p className="text-muted-foreground">
          Search for songs above to make your first request!
        </p>
      </CardContent>
    </Card>
  )
}
