/**
 * "Open the sign-in popup", from somewhere that is not the popup's own button.
 *
 * The popup lives on the landing page, the one page that knows about an invite or a
 * sign-in that just failed. The header's "Sign in" lives in the layout, which knows
 * neither. So the header asks and the popup answers: the same shape as the
 * `fairysplit:changed` event the data layer uses, and for the same reason, which is
 * that the two ends are in different parts of the tree.
 */
const SIGN_IN_EVENT = "fairysplit:sign-in";

export function requestSignIn(): void {
  window.dispatchEvent(new Event(SIGN_IN_EVENT));
}

/** Calls `handler` whenever somebody asks for the popup; returns the way to stop. */
export function onSignInRequest(handler: () => void): () => void {
  window.addEventListener(SIGN_IN_EVENT, handler);
  return () => window.removeEventListener(SIGN_IN_EVENT, handler);
}
