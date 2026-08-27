import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Testing Library registers its own `afterEach(cleanup)` only when Vitest runs
 * with `globals: true`. This project does not (see vitest.workspace.ts), so
 * without this every render accumulates in the same document and the second
 * `getByRole` in a file fails with "found multiple elements".
 */
afterEach(cleanup);
