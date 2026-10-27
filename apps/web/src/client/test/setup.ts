import "@testing-library/jest-dom/vitest"
import {afterEach} from "vitest"
import {cleanup} from "@testing-library/react"

afterEach(() => {
    cleanup()
})

// jsdom leaves out a few browser APIs that Radix and the CSV uploader call on
// mount. Only stub what is missing, and only in DOM test files.
if (typeof window !== "undefined") {
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    if (!window.matchMedia) {
        window.matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        })
    }
    Element.prototype.scrollIntoView ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.releasePointerCapture ??= () => {}
}
