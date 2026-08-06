import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {ClerkProvider} from "@clerk/react";
import { shadcn } from '@clerk/ui/themes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <ClerkProvider
          appearance={{
              options: {
                  socialButtonsPlacement: 'bottom',
                  socialButtonsVariant: 'iconButton',
                  logoImageUrl: 'src/assets/vite.svg',
                  logoLinkUrl: '/',
                  logoPlacement: 'outside'
              },
              theme: shadcn,
          }}
      >
          <App />
      </ClerkProvider>
  </StrictMode>,
)
