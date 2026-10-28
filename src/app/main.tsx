import '@/ui/theme.css'
import '@/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { rolloverWhenVisible, runStartupTasks } from './startup'
import { requestPersistentStorage } from './storage'

void requestPersistentStorage()
void runStartupTasks()
rolloverWhenVisible()

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
