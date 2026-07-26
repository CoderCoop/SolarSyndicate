/**
 * Installing the game to the home screen. Design doc §8.3.
 *
 * The PWA has been installable since M0 — manifest, service worker, offline
 * shell — and nothing ever said so. Browsers used to surface that themselves;
 * they now mostly bury it in a menu, so an installable app that never offers
 * is an app nobody installs.
 *
 * That matters more here than for most web apps. This is a game whose whole
 * premise is that the ship keeps running while you are away (§7.2), and the
 * away report is written to be read on a phone you picked up because something
 * happened. On a home screen with a notification badge that lands; in a browser
 * tab among forty others it does not.
 *
 * Three states, because the platforms genuinely differ:
 *
 *   - **installed** — already running standalone, so there is nothing to offer.
 *   - **prompt** — Chromium fired `beforeinstallprompt`, so we hold the event
 *     and can install on a tap.
 *   - **manual** — iOS Safari, which never fires it and requires Share → Add to
 *     Home Screen. Telling the player how is the only honest option; pretending
 *     there is a button would be worse than saying nothing.
 */

/** Not in lib.dom yet; Chromium-only. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'unavailable' | 'prompt' | 'manual' | 'installed'

/** Set aside when the browser offers, spent when the player accepts. */
let deferred: BeforeInstallPromptEvent | undefined

const listeners = new Set<() => void>()
const announce = () => listeners.forEach((fn) => fn())

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari predates the display-mode media query.
    ('standalone' in window.navigator && Boolean(window.navigator.standalone))
  )
}

/**
 * iOS Safari, where installing is a real capability reached by a menu the app
 * cannot open. Excludes Chrome and Firefox on iOS, which are Safari underneath
 * but do not offer Add to Home Screen at all.
 */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export function installState(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  if (isIosSafari()) return 'manual'
  return 'unavailable'
}

/**
 * Start listening. Returns a teardown, and calls back whenever the state
 * changes so React can re-read it.
 *
 * `beforeinstallprompt` fires once, early, and only if the browser considers
 * the app installable — so the listener has to be installed before first paint
 * and the event kept, not consumed.
 */
export function watchInstallState(onChange: () => void): () => void {
  listeners.add(onChange)

  const onBeforePrompt = (e: Event) => {
    // Without this the browser shows its own mini-infobar and the app never
    // gets to choose the moment.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    announce()
  }

  const onInstalled = () => {
    deferred = undefined
    announce()
  }

  window.addEventListener('beforeinstallprompt', onBeforePrompt)
  window.addEventListener('appinstalled', onInstalled)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener('beforeinstallprompt', onBeforePrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

/**
 * Show the browser's install dialog. Resolves to what the player chose.
 *
 * The event is single-use: once prompted it cannot be replayed, so it is
 * cleared either way and the offer does not come back in this session.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = undefined

  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    announce()
    return outcome
  } catch {
    announce()
    return 'dismissed'
  }
}
