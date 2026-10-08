import { jest } from '@jest/globals';

// Jest runs the tests as ES modules (NestJS 12 ships as ESM), where `jest` is no longer a global.
(globalThis as Record<string, unknown>).jest = jest;
