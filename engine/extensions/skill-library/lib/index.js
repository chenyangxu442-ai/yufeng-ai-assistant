/**
 * Host half of the 与风AI助手 skill-library extension.
 *
 * The feature is entirely browser-side: the client bundle (./client) registers
 * the sidebar entry, the right-pane library body, and the composer chip rail.
 * This host half exists because the Cordis loader composes plugins as host rows,
 * and `dsh-client-modules` discovers a plugin's client bundle by reading the
 * `dsh.client` declaration of the package owning that host row. So the row must
 * resolve to a real module inside this package; it needs no host behavior.
 */
export const name = "ui-skill-library";

export function apply() {}
