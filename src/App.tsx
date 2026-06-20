import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import FindDate from '@/pages/FindDate'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<FindDate />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
