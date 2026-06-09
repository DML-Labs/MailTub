import { Toaster } from 'sonner'
import { ThemeProvider } from '@/contexts/ThemeContext'
import InboxPage from '@/pages/InboxPage'
import AdminLogin from '@/pages/AdminLogin'
import AdminDashboard from '@/pages/AdminDashboard'
import AdminSetup from '@/pages/AdminSetup'

function getAdminRoute(): 'login' | 'dashboard' | 'setup' | null {
  const p = window.location.pathname
  if (p === '/admin' || p === '/admin/' || p === '/admin/login') return 'login'
  if (p === '/admin/dashboard') return 'dashboard'
  if (p === '/admin/setup') return 'setup'
  return null
}

export default function App() {
  const adminRoute = getAdminRoute()

  if (adminRoute === 'login') {
    return (
      <ThemeProvider>
        <AdminLogin />
      </ThemeProvider>
    )
  }

  if (adminRoute === 'dashboard') {
    return (
      <ThemeProvider>
        <AdminDashboard />
      </ThemeProvider>
    )
  }

  if (adminRoute === 'setup') {
    return (
      <ThemeProvider>
        <AdminSetup />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <InboxPage />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-surface-3 border border-border text-primary text-sm rounded-lg shadow-lg',
            title: 'font-medium',
            description: 'text-secondary text-xs',
            actionButton: 'bg-accent text-white text-xs rounded px-2 py-1',
            cancelButton: 'text-secondary text-xs',
          },
        }}
      />
    </ThemeProvider>
  )
}
