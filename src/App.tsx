import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import FindDate from '@/pages/FindDate'

/**
 * The scheduling page is what people land on, so it ships in the entry chunk:
 * splitting it out only buys a second round trip before anything renders.
 * The profile and calendar-overview pages are a different matter — they are
 * reached by a deliberate click, and keeping them out of the entry chunk means
 * the landing page never downloads code it has no use for.
 */
const Profile = lazy(() => import('@/pages/Profile'))
const CalendarOverview = lazy(() => import('@/pages/CalendarOverview'))

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Plain background rather than a spinner: these chunks are small, and
            a flash of "Loading…" would read as slower than a beat of nothing. */}
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={<FindDate />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/calendar-overview" element={<CalendarOverview />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
