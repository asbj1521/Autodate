import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import Footer from '@/components/Footer'
import RequireAuth from '@/components/RequireAuth'
import AuthProvider from '@/context/AuthProvider'
import LanguageProvider from '@/i18n/LanguageProvider'
import { persistQueries } from '@/lib/queryPersistence'
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
const Privacy = lazy(() => import('@/pages/Privacy'))
const HowItWorks = lazy(() => import('@/pages/HowItWorks'))
const MyEvents = lazy(() => import('@/pages/MyEvents'))
const ConnectIcloudHelp = lazy(() => import('@/pages/ConnectIcloudHelp'))
const ConnectIcsHelp = lazy(() => import('@/pages/ConnectIcsHelp'))
const ConnectGoogleHelp = lazy(() => import('@/pages/ConnectGoogleHelp'))
const ConnectOutlookHelp = lazy(() => import('@/pages/ConnectOutlookHelp'))
// An invite link is often the very first page someone sees, so it stays out of
// the entry chunk like the other pages reached by a deliberate click.
const JoinGroup = lazy(() => import('@/pages/JoinGroup'))

const queryClient = new QueryClient()
// Last known groups, calendar status and admin flag, shown at once on load
// and refreshed in the background (see queryPersistence.ts).
persistQueries(queryClient)

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            {/* Plain background rather than a spinner: these chunks are small, and
                a flash of "Loading…" would read as slower than a beat of nothing. */}
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <Routes>
                <Route path="/" element={<FindDate />} />
                <Route path="/sign-in" element={<SignIn />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/help/connect-icloud" element={<ConnectIcloudHelp />} />
                <Route path="/help/connect-ics" element={<ConnectIcsHelp />} />
                <Route path="/help/connect-google" element={<ConnectGoogleHelp />} />
                <Route path="/help/connect-outlook" element={<ConnectOutlookHelp />} />
                {/* The invite link. Signing in happens on the page itself, so
                    someone can see what they were invited to before deciding. */}
                <Route path="/join/:token" element={<JoinGroup />} />
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
                  path="/events"
                  element={
                    <RequireAuth>
                      <MyEvents />
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
            <Footer />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </LanguageProvider>
  )
}

export default App
