/* Square picture of an exercise: its photo, or a gradient in the muscle group's colour. */

import { icon } from "./icons.js";
import { LIBMAP, photoOf, GROUP_HUE, groupIndex } from "../domain/catalog.js";

/* e — a program exercise ({ lib, g }) or a catalog entry ({ id, gi, img }) */
export function exThumb(e, size = "") {
  const x = e.img !== undefined ? e : e.lib ? LIBMAP[e.lib] : null;
  const src = photoOf(x), gi = x ? x.gi : groupIndex(e);
  return `<span class="thumb ${size}" style="--hue:${GROUP_HUE[gi] ?? 220}">${src ? `<img src="${src}" alt="" loading="lazy">` : icon("dumbbell", size === "thumb--lg" ? 28 : 22)}</span>`;
}
