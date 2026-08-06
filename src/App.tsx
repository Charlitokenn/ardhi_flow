import './App.css'
import {ThemeProvider} from "@/components/theme-provider.tsx";
import {ModeToggle} from "@/components/mode-toggle.tsx";

function App() {

  return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="text-red-700">Hello World</div>
          <ModeToggle />
      </ThemeProvider>
  )
}

export default App
