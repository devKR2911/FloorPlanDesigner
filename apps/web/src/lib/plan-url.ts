// Until the plan list screens exist, the open plan is identified by ?plan=<id> in the URL.
const PARAM = 'plan'

export function readPlanIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM)
}

/** Puts the plan id in the address bar without reloading, so a reload opens the same plan. */
export function writePlanIdToUrl(id: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM, id)
  window.history.replaceState(null, '', url)
}

/** Address of the app with no plan selected. */
export function newPlanHref(): string {
  return window.location.pathname
}
