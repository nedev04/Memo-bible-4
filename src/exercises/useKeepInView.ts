import { useEffect } from 'react'

/**
 * Плавно прокручивает к элементу, только если он уходит из удобной зоны экрана.
 * Так страница не дёргается при каждом шаге, но нужное место всегда остаётся видимым.
 */
export function useKeepInView(selector: string, dep: unknown) {
  useEffect(() => {
    const el = document.querySelector(selector)
    if (!el) return
    const vv = window.visualViewport
    const viewH = vv?.height ?? window.innerHeight
    const top = el.getBoundingClientRect().top - (vv?.offsetTop ?? 0)
    if (top < 90 || top > viewH * 0.6) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selector, dep])
}
