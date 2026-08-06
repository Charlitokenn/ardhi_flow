import './App.css'
import {ThemeProvider} from "@/components/theme-provider.tsx";
import {ModeToggle} from "@/components/mode-toggle.tsx";
import {Show, SignInButton, SignUpButton, UserButton} from "@clerk/react";

function App() {

  return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <header>
              <Show when="signed-out">
                  <SignInButton withSignUp={true} mode="modal"/>
              </Show>
              <Show when="signed-in">
                  <UserButton />
              </Show>
          </header>
        <div className="text-red-700">Hello World</div>
          <ModeToggle />

      </ThemeProvider>
  )
}

export default App
