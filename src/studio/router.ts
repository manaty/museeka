/**
 * Minimal hash router for the Studio. Routes are stored in
 * `window.location.hash` as `#/route`. No dependency, no query params.
 */

export type Route =
  | "home"
  | "midi"
  | "scene"
  | "instruments"
  | "objects"
  | "music"
  | "legacy";

const ROUTES: readonly Route[] = ["home", "midi", "scene", "instruments", "objects", "music", "legacy"];

export function readRoute(): Route {
  if (typeof window === "undefined") return "home";
  const raw = window.location.hash.replace(/^#\/?/, "").split("/")[0] || "home";
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : "home";
}

export function navigate(route: Route): void {
  if (typeof window === "undefined") return;
  const next = `#/${route === "home" ? "" : route}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export function subscribe(cb: (route: Route) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb(readRoute());
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}
