/**
 * Host half of dsh-transcript-toggle.
 *
 * The plugin owns no host behavior: the browser half registers a Session-header
 * control that writes the `ui-chat` transcript preference, and the Chat target
 * reacts to that preference exactly as it does to its own Settings row. An
 * empty apply keeps the row loadable by the Cordis Loader.
 */
export function apply() {}
