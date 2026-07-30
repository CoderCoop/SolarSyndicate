/**
 * The decision window, on screen. Design doc §7.4, §4.6.
 *
 * §7.4 says every acute emergency opens a decision window, and a window the
 * player has to go looking for is not one. So this sits under the status bar
 * on every tab -- it is the only thing in the game that overrides what you were
 * doing, because it is the only thing that can kill somebody while you read.
 *
 * It has one job beyond alarming: make the *shape* of the decision legible.
 * There is a clock, and at the end of it the captain acts anyway. That is not a
 * punishment for being slow, it is the point of having a captain (§4.6) -- and
 * a player who understands that can close the app, which is the freedom §7.4
 * exists to protect.
 */
import { formatDuration, type EmergencyView } from '@solsyn/sim'

export function EmergencyBanner({
  emergency,
  onAnswer,
  onStandDown,
}: {
  emergency: EmergencyView
  onAnswer: () => void
  onStandDown: () => void
}) {
  const { stoodTo, answered, captainMayAct, secondsToRespond } = emergency

  return (
    <section
      className={`emergency emergency--${emergency.severity} ${stoodTo ? 'is-stood-to' : ''}`}
      role="alert"
      aria-label="Emergency"
    >
      <p className="emergency__head">
        <span className="emergency__reading">{emergency.reading}</span>
        <span className="emergency__label">{emergency.label}</span>
      </p>

      {emergency.causeName && (
        <p className="emergency__cause">
          <strong>{emergency.causeName}</strong> has failed. It is why.
        </p>
      )}

      {/* The three states this can be in, in the order they happen. */}
      {stoodTo ? (
        <>
          <p className="emergency__state">
            The captain has stood the ship to. The repair is at the head of the queue,
            non-essential loads are off, and the idle hands are secured.
          </p>
          <button type="button" className="button" onClick={onStandDown}>
            Stand down
          </button>
        </>
      ) : answered ? (
        <p className="emergency__state">
          You have this. The captain is standing by and will not act on his own.
        </p>
      ) : !captainMayAct ? (
        <p className="emergency__state emergency__state--alone">
          Standing orders leave this to you — the captain will not act on his own, however
          long it runs. Nobody else is going to fix this.
        </p>
      ) : (
        <>
          <p className="emergency__state">
            The captain stands the ship to in{' '}
            <strong>{formatDuration(secondsToRespond)}</strong> unless you answer: he will
            order the repair, shed what is not keeping anybody alive, and secure the idle
            hands. Answering means you are handling it instead.
          </p>
          <button type="button" className="button button--primary" onClick={onAnswer}>
            I have it
          </button>
        </>
      )}
    </section>
  )
}
