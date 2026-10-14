/** Keep each static slide's SVG definitions independent inside the shared shadow root. */
export function snapshotSlide(stage: HTMLElement, index: number) {
  const copy = document.createElement("div");
  for (const child of Array.from(stage.childNodes))
    copy.append(child.cloneNode(true));
  // Text boxes are static slide content, not independent scroll containers.
  copy.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const key of ["overflow", "overflowX", "overflowY"] as const)
      if (["auto", "scroll"].includes(el.style[key])) el.style[key] = "hidden";
  });
  const original = stage.querySelectorAll("canvas");
  copy.querySelectorAll("canvas").forEach((canvas, k) => {
    canvas.width = original[k].width;
    canvas.height = original[k].height;
    canvas.getContext("2d")?.drawImage(original[k], 0, 0);
  });
  const ids = new Map<string, string>();
  copy.querySelectorAll("[id]").forEach((el) => {
    const old = el.id;
    const id = `page-${index}-${old}`;
    ids.set(old, id);
    el.id = id;
  });
  for (const el of Array.from(copy.querySelectorAll("*")))
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "id") continue;
      let value = attr.value;
      for (const [old, id] of ids) {
        if (value === `#${old}`) value = `#${id}`;
        value = value.split(`url(#${old})`).join(`url(#${id})`);
      }
      if (value !== attr.value) el.setAttribute(attr.name, value);
    }
  return copy;
}
