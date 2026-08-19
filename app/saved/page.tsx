import type { Metadata } from 'next'
import SavedView from '@/components/SavedView'

export const metadata: Metadata = {
  title: 'Saved tours',
  description: 'The Jamaica tours you saved for later, ready to add to your trip.',
  // A personal shortlist behind a login has nothing to offer a crawler, and
  // indexing it would only ever surface an empty sign-in page.
  robots: { index: false, follow: false },
}

export default function SavedPage() {
  return <SavedView />
}
