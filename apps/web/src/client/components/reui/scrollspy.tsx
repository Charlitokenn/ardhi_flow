"use client"

import type { ReactNode, RefObject } from "react"
import { useCallback, useEffect, useRef } from "react"

type ScrollspyProps = {
  children: ReactNode
  targetRef?: RefObject<
    HTMLElement | HTMLDivElement | Document | null | undefined
  >
  onUpdate?: (id: string) => void
  offset?: number
  smooth?: boolean
  className?: string
  dataAttribute?: string
  history?: boolean
  throttleTime?: number
}

/**
 * Section top relative to the SCROLL POSITION of `scrollElement` (not the
 * section's offsetParent, which is often some unrelated positioned ancestor
 * a few levels up — e.g. the shadcn ScrollArea viewport this component
 * special-cases isn't itself positioned, so `section.offsetTop` silently
 * measures against whatever ancestor further up happens to be). Bounding
 * rects, being relative to the viewport, are immune to that and work
 * regardless of what sits between the two elements in the DOM.
 */
function getSectionScrollTop(
  sectionElement: HTMLElement,
  scrollElement: HTMLElement
): number {
  if (scrollElement === document.documentElement) {
    return sectionElement.getBoundingClientRect().top + window.scrollY
  }
  return (
    sectionElement.getBoundingClientRect().top -
    scrollElement.getBoundingClientRect().top +
    scrollElement.scrollTop
  )
}

export function Scrollspy({
  children,
  targetRef,
  onUpdate,
  className,
  offset = 0,
  smooth = true,
  dataAttribute = "scrollspy",
  history = true,
}: ScrollspyProps) {
  const selfRef = useRef<HTMLDivElement | null>(null)
  const anchorElementsRef = useRef<Element[] | null>(null)
  const prevIdTracker = useRef<string | null>(null)

  // Sets active nav, hash, prevIdTracker, and calls onUpdate
  const setActiveSection = useCallback(
    (sectionId: string | null, force = false) => {
      if (!sectionId) return
      anchorElementsRef.current?.forEach((item) => {
        const id = item.getAttribute(`data-${dataAttribute}-anchor`)
        if (id === sectionId) {
          item.setAttribute("data-active", "true")
        } else {
          item.removeAttribute("data-active")
        }
      })
      if (onUpdate) onUpdate(sectionId)
      if (history && (force || prevIdTracker.current !== sectionId)) {
        window.history.replaceState({}, "", `#${sectionId}`)
      }
      prevIdTracker.current = sectionId
    },
    [anchorElementsRef, dataAttribute, history, onUpdate]
  )

  const handleScroll = useCallback(() => {
    if (!anchorElementsRef.current || anchorElementsRef.current.length === 0)
      return

    let scrollElement =
      targetRef?.current === document
        ? document.documentElement
        : (targetRef?.current as HTMLElement)

    if (!scrollElement) return

    // If the scrollElement has a data-slot="scroll-area-viewport" inside, use that
    const viewport = scrollElement.querySelector(
      '[data-slot="scroll-area-viewport"]'
    )
    if (viewport instanceof HTMLElement) {
      scrollElement = viewport
    }

    const scrollTop =
      scrollElement === document.documentElement
        ? window.scrollY || document.documentElement.scrollTop
        : scrollElement.scrollTop

    // Find the anchor whose section is closest to but not past the top
    let activeIdx = 0
    let minDelta = Infinity

    anchorElementsRef.current.forEach((anchor, idx) => {
      const sectionId = anchor.getAttribute(`data-${dataAttribute}-anchor`)
      const sectionElement = document.getElementById(sectionId!)
      if (!sectionElement) return

      let customOffset = offset
      const dataOffset = anchor.getAttribute(`data-${dataAttribute}-offset`)
      if (dataOffset) customOffset = parseInt(dataOffset, 10)

      const delta = Math.abs(
        getSectionScrollTop(sectionElement, scrollElement) -
          customOffset -
          scrollTop
      )

      if (
        getSectionScrollTop(sectionElement, scrollElement) - customOffset <=
          scrollTop &&
        delta < minDelta
      ) {
        minDelta = delta
        activeIdx = idx
      }
    })

    // If at bottom, force last anchor
    const scrollHeight = (scrollElement as HTMLElement).scrollHeight
    const clientHeight = (scrollElement as HTMLElement).clientHeight

    if (scrollTop + clientHeight >= scrollHeight - 2) {
      activeIdx = anchorElementsRef.current.length - 1
    }

    // Set only one anchor active and sync the URL hash
    const activeAnchor = anchorElementsRef.current[activeIdx]
    const sectionId =
      activeAnchor?.getAttribute(`data-${dataAttribute}-anchor`) || null

    setActiveSection(sectionId)
  }, [anchorElementsRef, targetRef, dataAttribute, offset, setActiveSection])

  const scrollTo = useCallback(
    (anchorElement: HTMLElement) => (event?: Event) => {
      if (event) event.preventDefault()
      const sectionId =
        anchorElement
          .getAttribute(`data-${dataAttribute}-anchor`)
          ?.replace("#", "") || null
      if (!sectionId) return
      const sectionElement = document.getElementById(sectionId)
      if (!sectionElement) return

      let scrollToElement: HTMLElement | Window | null =
        targetRef?.current === document
          ? window
          : (targetRef?.current as HTMLElement)

      if (scrollToElement instanceof HTMLElement) {
        const viewport = scrollToElement.querySelector(
          '[data-slot="scroll-area-viewport"]'
        )
        if (viewport instanceof HTMLElement) {
          scrollToElement = viewport
        }
      }

      let customOffset = offset
      const dataOffset = anchorElement.getAttribute(
        `data-${dataAttribute}-offset`
      )
      if (dataOffset) {
        customOffset = parseInt(dataOffset, 10)
      }

      // getSectionScrollTop's document-case branch keys off
      // document.documentElement, not `window` itself.
      const scrollTargetEl: HTMLElement | null =
        scrollToElement instanceof HTMLElement
          ? scrollToElement
          : scrollToElement === window
            ? document.documentElement
            : null
      const scrollTop = scrollTargetEl
        ? getSectionScrollTop(sectionElement, scrollTargetEl) - customOffset
        : sectionElement.getBoundingClientRect().top +
          window.scrollY -
          customOffset

      if (scrollToElement && "scrollTo" in scrollToElement) {
        scrollToElement.scrollTo({
          top: scrollTop,
          left: 0,
          behavior: smooth ? "smooth" : "auto",
        })
      }
      setActiveSection(sectionId, true)
    },
    [dataAttribute, offset, smooth, targetRef, setActiveSection]
  )

  // Scroll to the section if the ID is present in the URL hash
  const scrollToHashSection = useCallback(() => {
    const hash = CSS.escape(window.location.hash.replace("#", ""))

    if (hash) {
      const targetElement = document.querySelector(
        `[data-${dataAttribute}-anchor="${hash}"]`
      ) as HTMLElement
      if (targetElement) {
        scrollTo(targetElement)()
      }
    }
  }, [dataAttribute, scrollTo])

  useEffect(() => {
    // Query elements and store them in the ref, avoiding unnecessary re-renders
    if (selfRef.current) {
      anchorElementsRef.current = Array.from(
        selfRef.current.querySelectorAll(`[data-${dataAttribute}-anchor]`)
      )
    }

    const currentAnchors = anchorElementsRef.current
    currentAnchors?.forEach((item) => {
      item.addEventListener("click", scrollTo(item as HTMLElement))
    })

    const onScroll = (event: Event) => {
      const scrollElement =
        targetRef?.current === document
          ? window
          : (targetRef?.current as HTMLElement)
      if (!scrollElement) return

      if (
        scrollElement === window ||
        (scrollElement instanceof HTMLElement &&
          scrollElement.contains(event.target as Node))
      ) {
        handleScroll()
      }
    }

    // Use window listener with capture to catch scroll events from targetRef even if set later
    window.addEventListener("scroll", onScroll, true)

    // Check if there's a hash in the URL and scroll to the corresponding section
    const initialTimeout = setTimeout(() => {
      scrollToHashSection()
      handleScroll()
    }, 100)

    return () => {
      window.removeEventListener("scroll", onScroll, true)
      currentAnchors?.forEach((item) => {
        item.removeEventListener("click", scrollTo(item as HTMLElement))
      })
      clearTimeout(initialTimeout)
    }
    // `children` isn't read directly here, but the anchors this effect
    // queries for and attaches listeners to are rendered FROM it — when the
    // nav item set changes (items added/removed), the DOM query and click
    // listeners must be redone or new anchors stay unclickable and removed
    // ones leave anchorElementsRef pointing at stale nodes.
  }, [
    children,
    targetRef,
    selfRef,
    handleScroll,
    dataAttribute,
    scrollTo,
    scrollToHashSection,
  ])

  return (
    <div data-slot="scrollspy" className={className} ref={selfRef}>
      {children}
    </div>
  )
}