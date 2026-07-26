/**
 * Getting out of a boot that will not finish.
 *
 * A PWA can strand a player in a way an ordinary web page cannot. The shell is
 * precached, so a build that hangs on load keeps being served from the cache
 * and keeps hanging; the save lives in IndexedDB, so it survives a reload and
 * takes the fault with it. Every control the game offers -- including "Scuttle
 * and start over" -- sits behind the boot screen, which is exactly the screen
 * that never goes away. The only way out was the browser's own site-data
 * settings, which is not a thing to ask of somebody who wanted to play a game.
 *
 * §7.4 says a player is never stranded. These are that promise applied to the
 * loading screen: the two things that can be wrong, and the button for each.
 */

/** Throw away the stored world. For a save this build chokes on. */
export async function discardWorld(): Promise<void> {
  try {
    const { clearSave } = await import('./persistence.js')
    await clearSave()
  } catch (err) {
    console.error('Could not clear the save', err)
  }
  window.location.reload()
}

/**
 * Drop the precached shell and the worker serving it. For a *build* that is
 * broken, where clearing the save changes nothing because the same broken code
 * comes back off the cache.
 */
export async function reinstallApp(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch (err) {
    console.error('Could not clear the app cache', err)
  }
  // Reload either way: a partial clear still stands a better chance than the
  // screen the player is looking at.
  window.location.reload()
}
