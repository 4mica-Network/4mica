import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Testing Library registers its own `afterEach(cleanup)` only when Vitest runs
 * with `globals: true`. This project does not, so without this every render
 * accumulates in the same document — and because Modal portals into
 * `document.body`, the next `screen` query fails with "found multiple
 * elements". Mirrors apps/playground/vitest.setup.ts.
 */
afterEach(cleanup);
