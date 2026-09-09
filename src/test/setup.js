import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own auto-cleanup when the runner exposes
// globals. Registering it explicitly keeps each case starting from an empty
// document whether or not that flag is on, which matters because `screen`
// queries the whole body: without it, a render from a previous case is still
// mounted and unique-text queries start matching two elements.
afterEach(cleanup);
