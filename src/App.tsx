import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import RequireAuth from '@/components/RequireAuth'
import AuthProvider from '@/context/AuthProvider'
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
const SignIn = lazy(() => import('@/pages/SignIn'))

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/* Plain background rather than a spinner: these chunks are small, and
              a flash of "Loading…" would read as slower than a beat of nothing. */}
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route path="/" element={<FindDate />} />
              <Route path="/sign-in" element={<SignIn />} />
              {/* Everything tied to one person's calendars needs a login. */}
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <Profile />
                  </RequireAuth>
                }
              />
              <Route
                path="/calendar-overview"
                element={
                  <RequireAuth>
                    <CalendarOverview />
                  </RequireAuth>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
