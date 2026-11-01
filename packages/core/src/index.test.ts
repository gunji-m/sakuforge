import { expect, test } from "vitest";

import { isCorePackageReady } from "./index";

test("the core package is wired into the workspace", () => {
  expect(isCorePackageReady()).toBe(true);
});
