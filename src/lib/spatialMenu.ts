/** Adapt the mounted desktop controls to XR without copying application state,
 * limits, choices, or handlers. Only explicitly marked menu roots are exposed.
 * No React internals are used: input/change and click follow the DOM contract.
 */
export type MenuElement =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLMediaElement;
export interface MenuItem {
  id: number;
  element: MenuElement;
  label: string;
  kind: "action" | "toggle" | "number" | "text" | "select" | "file" | "audio";
  value: string;
  active: boolean;
  disabled: boolean;
  browserOnly: boolean;
  min: number;
  max: number;
  step: number;
  options: Array<{ value: string; label: string; disabled: boolean }>;
}
export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
  messages: string[];
}
const identities = new WeakMap<Element, number>();
let nextIdentity = 1;
function identity(element: Element) {
  if (!identities.has(element)) identities.set(element, nextIdentity++);
  return identities.get(element)!;
}
const text = (element: Element | null) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
function labelFor(element: MenuElement) {
  const explicit = element.getAttribute("aria-label");
  if (explicit) return explicit;
  if (element instanceof HTMLButtonElement)
    return text(element) || element.title;
  if (element instanceof HTMLMediaElement) return "Audio playback";
  if (element.labels?.length) {
    const clone = element.labels[0].cloneNode(true) as Element;
    clone
      .querySelectorAll("select,input,textarea")
      .forEach((child) => child.remove());
    return text(clone);
  }
  if ("placeholder" in element && element.placeholder)
    return element.placeholder;
  // Legacy controls have a sibling label or a preceding row of title + value.
  let parent = element.parentElement;
  for (
    let depth = 0;
    parent && depth < 3;
    depth++, parent = parent.parentElement
  ) {
    const label = parent.querySelector("label");
    if (label) return text(label);
    const preceding =
      element.previousElementSibling ?? parent.previousElementSibling;
    if (preceding && text(preceding)) return text(preceding).slice(0, 100);
  }
  return element instanceof HTMLTextAreaElement ? "Source editor" : "Value";
}
function hidden(element: Element, root: Element) {
  // A file input may be hidden inside its visible clickable label. A collapsed
  // menu root stays mounted for XR; mode-specific hidden descendants do not.
  let node: Element | null =
    element instanceof HTMLInputElement && element.type === "file"
      ? element.parentElement
      : element;
  while (node && node !== root) {
    if (
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      node.classList.contains("hidden") ||
      (node as HTMLElement).style.display === "none"
    )
      return true;
    node = node.parentElement;
  }
  return false;
}
export function readSpatialMenus(document: Document): MenuSection[] {
  const sections: MenuSection[] = [];
  document
    .querySelectorAll<HTMLElement>("[data-spatial-menu]")
    .forEach((root) => {
      const rootLabel = root.dataset.spatialMenu!;
      const groups = new Map<Element, MenuSection>();
      const groupFor = (element: Element) => {
        const explicit = element.closest<HTMLElement>("[data-spatial-section]");
        let card = element;
        while (card.parentElement && card.parentElement !== root)
          card = card.parentElement;
        const heading = card.querySelector("h2");
        const key = explicit ?? (heading ? card : root);
        if (!groups.has(key))
          groups.set(key, {
            id: String(identity(key)),
            label: explicit
              ? `${rootLabel} · ${explicit.dataset.spatialSection}`
              : heading
                ? `${rootLabel} · ${text(heading)}`
                : rootLabel,
            items: [],
            messages: [],
          });
        return groups.get(key)!;
      };
      root
        .querySelectorAll<MenuElement>("button,input,textarea,select,audio,video")
        .forEach((element) => {
          if (hidden(element, root) || element.closest("[data-spatial-skip]"))
            return;
          const input = element instanceof HTMLInputElement ? element : null;
          if (input?.type === "hidden") return;
          const select = element instanceof HTMLSelectElement ? element : null;
          // The music player is a hidden <video> (browsers only allow muted
          // autoplay for video); it is still the audio transport here.
          const audio = element instanceof HTMLMediaElement ? element : null;
          const kind: MenuItem["kind"] = audio
            ? "audio"
            : select
              ? "select"
              : element instanceof HTMLTextAreaElement
                ? "text"
                : input
                  ? input.type === "file"
                    ? "file"
                    : ["checkbox", "radio"].includes(input.type)
                      ? "toggle"
                      : ["range", "number"].includes(input.type)
                        ? "number"
                        : "text"
                  : "action";
          groupFor(element).items.push({
            id: identity(element),
            element,
            label: labelFor(element),
            kind,
            value: audio
              ? `${audio.currentTime.toFixed(1)} / ${Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : "0"}s · ${Math.round(audio.volume * 100)}%${audio.muted ? " muted" : ""}`
              : "value" in element
                ? element.value
                : "",
            active: audio
              ? !audio.paused
              : input && kind === "toggle"
                ? input.checked
                : element.getAttribute("aria-pressed") === "true",
            disabled: "disabled" in element ? element.disabled : false,
            browserOnly:
              kind === "file" || element.hasAttribute("data-spatial-browser"),
            min: input?.min ? Number(input.min) : 0,
            max: input?.max ? Number(input.max) : 100,
            step: input?.step && input.step !== "any" ? Number(input.step) : 1,
            options: select
              ? Array.from(select.options).map((option) => ({
                  value: option.value,
                  label: option.label,
                  disabled:
                    option.disabled ||
                    (option.parentElement instanceof HTMLOptGroupElement &&
                      option.parentElement.disabled),
                }))
              : [],
          });
        });
      root
        .querySelectorAll(
          '[role="alert"],[role="status"],[data-spatial-status]',
        )
        .forEach((element) => {
          if (!hidden(element, root) && text(element))
            groupFor(element).messages.push(text(element));
        });
      sections.push(
        ...Array.from(groups.values()).filter(
          (group) => group.items.length || group.messages.length,
        ),
      );
    });
  return sections;
}
export function setMenuValue(item: MenuItem, value: string) {
  const element = item.element;
  if (
    !element.isConnected ||
    item.disabled ||
    element instanceof HTMLMediaElement ||
    element instanceof HTMLButtonElement
  )
    return;
  if (
    element instanceof HTMLInputElement &&
    ["range", "number"].includes(element.type)
  ) {
    if (!value.trim() || !Number.isFinite(Number(value))) return;
    value = String(Math.max(item.min, Math.min(item.max, Number(value))));
  }
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
    element,
    value,
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
export function stepMenuValue(item: MenuItem, direction: number) {
  const value = Math.max(
    item.min,
    Math.min(item.max, Number(item.value) + direction * item.step),
  );
  setMenuValue(item, String(Number(value.toFixed(8))));
}
