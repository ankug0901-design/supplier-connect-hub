import { nextCursorOffset } from "./cursor.ts";

Deno.test("four-supplier ticks advance 0 to 4 to 8", () => {
  if (nextCursorOffset(0, 4, 4) !== 4) throw new Error("First tick must advance to 4");
  if (nextCursorOffset(4, 4, 4) !== 8) throw new Error("Second tick must advance to 8");
});
Deno.test("25 suppliers wrap after the last partial batch", () => {
  if (nextCursorOffset(24, 1, 4) !== 0) throw new Error("Final supplier must wrap to zero");
});
Deno.test("empty final batch wraps to zero", () => {
  if (nextCursorOffset(28, 0, 4) !== 0) throw new Error("Empty batch must wrap to zero");
});