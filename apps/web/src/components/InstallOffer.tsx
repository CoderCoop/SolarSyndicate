/**
 * The offer to install. Design doc §8.3, §7.4.
 *
 * Two surfaces, deliberately:
 *
 *   - A **banner**, shown once and dismissible, because an offer nobody sees is
 *     not an offer. It is placed under the status bar rather than over the
 *     content, so it never covers a gauge the player is watching.
 *   - A **permanent entry on the Help tab**, because "not now" should not mean
 *     "never", and someone who declines on day one may well want it on day ten.
 *
 * Dismissal is remembered in localStorage rather than in sim state: it is a
 * fact about this browser, not about the world, and it must not travel with a
 * save or survive a scuttle.
 */
import { useEffect, useState } from 'react'
import { installState, promptInstall, watchInstallState, type InstallState } from '../install.js'

const DISMISSED_KEY = 'solsyn.install.dismissed'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private mode, or storage denied. Not being able to remember a dismissal
    // is not a reason to fail; it just means the banner may return.
    return false
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* nothing to do */
  }
}

/** Re-reads the install state whenever the browser changes its mind. */
export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(() => installState())
  useEffect(() => watchInstallState(() => setState(installState())), [])
  return state
}

const IOS_STEPS = 'Tap Share, then “Add to Home Screen”.'

/**
 * The one-time banner. Renders nothing unless there is something to offer and
 * the player has not already said no.
 */
export function InstallBanner() {
  const state = useInstallState()
  const [dismissed, setDismissed] = useState(() => wasDismissed())

  if (dismissed || state === 'installed' || state === 'unavailable') return null

  const dismiss = () => {
    remember()
    setDismissed(true)
  }

  return (
    <aside className="install" aria-label="Install this game">
      <div className="install__text">
        <strong className="install__title">Keep the ship on your home screen</strong>
        <p className="install__why">
          It runs offline, and the crew keep working whether the tab is open or not — a home
          screen is where you will actually notice them.
        </p>
        {state === 'manual' && <p className="install__how">{IOS_STEPS}</p>}
      </div>
      <div className="install__actions">
        {state === 'prompt' && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              void promptInstall().then((outcome) => {
                // Either way the browser will not offer again this session.
                if (outcome !== 'accepted') remember()
                setDismissed(true)
              })
            }}
          >
            Install
          </button>
        )}
        <button type="button" className="button button--quiet" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  )
}

/** The permanent entry, for anyone who said "not now" and changed their mind. */
export function InstallSection() {
  const state = useInstallState()

  if (state === 'installed') {
    return (
      <p className="help__a">
        Installed — you are running it from your home screen, offline-capable and out of the
        browser’s way.
      </p>
    )
  }

  if (state === 'manual') {
    return (
      <>
        <p className="help__a">
          This game installs to your home screen and runs offline. Safari does not offer a
          button for it: {IOS_STEPS}
        </p>
      </>
    )
  }

  if (state === 'prompt') {
    return (
      <>
        <p className="help__a">
          Install it to your home screen and it runs offline, out of the browser’s way. Your
          save stays where it is — it lives in this browser either way.
        </p>
        <button
          type="button"
          className="button button--primary help__link"
          onClick={() => void promptInstall()}
        >
          Install the game
        </button>
      </>
    )
  }

  return (
    <p className="help__a">
      This game is installable to a home screen and runs offline. Your browser has not offered
      it here — most desktop browsers keep the option in the address bar or the page menu.
    </p>
  )
}
