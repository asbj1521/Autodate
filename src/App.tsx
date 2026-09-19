import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import FindDate from '@/pages/FindDate'
import Profile from '@/pages/Profile'
import CalendarOverview from '@/pages/CalendarOverview'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<FindDate />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/calendar-overview" element={<CalendarOverview />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
