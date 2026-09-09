/**
 * Stack handling for runtime failures.
 *
 * Console locations no longer come from here: they are baked into the call
 * sites by the instrumentation pass. But an uncaught throw can happen anywhere,
 * so for errors the stack is still the only source of a location. This module
 * fixes the three things that made the previous attempt unreliable:
 *
 *   1. Frames were matched by the literal substring 'anonymous', which also
 *      matches native frames such as `at Array.map (<anonymous>)` that carry
 *      no line number. The evaluated body now declares a sourceURL, so its
 *      frames are identified by name instead of by accident.
 *   2. The offset introduced by the function wrapper was a hard-coded `- 2`.
 *      It is now measured once at startup from a probe.
 *   3. There were no guards, so an unexpected stack shape threw inside the
 *      logger. Every function here returns null rather than throwing.
 */

/** Name the evaluated body reports itself as, via a sourceURL comment. */
export const SOURCE_URL = 'sandbox-user-code.js';

export const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor;

/** Appends the sourceURL so stack frames from user code are identifiable. */
export const tagSource = code => `${code}\n//# sourceURL=${SOURCE_URL}`;

const FRAME = new RegExp(`${SOURCE_URL}:(\\d+):(\\d+)`);

/** First frame that belongs to the evaluated body, innermost first. */
const firstFrame = stack => {
  if (typeof stack !== 'string') return null;
  for (const line of stack.split('\n')) {
    const match = FRAME.exec(line);
    if (match) {
      return { line: Number(match[1]), column: Number(match[2]) };
    }
  }
  return null;
};

/**
 * Measures how many lines the AsyncFunction wrapper prepends to the body.
 *
 * V8 currently reports the first body line as line 3 (`async function
 * anonymous(...)` then `) {`), but that is an implementation detail rather
 * than a guarantee, so it is measured instead of assumed.
 */
export const calibrate = async (parameterNames = []) => {
  const fallback = 2;
  try {
    const probe = new AsyncFunction(
      ...parameterNames,
      tagSource('throw new Error("__sbx_calibration__");')
    );
    await probe();
  } catch (error) {
    const frame = firstFrame(error?.stack);
    if (frame && frame.line >= 1) return frame.line - 1;
  }
  return fallback;
};

/**
 * Source location of a thrown value, or null when it cannot be determined.
 * A null location is a normal outcome: the renderer shows the error without
 * anchoring it to a line rather than reporting a bogus one.
 */
export const locate = (error, offset) => {
  try {
    const frame = firstFrame(error?.stack);
    if (!frame) return null;
    const line = frame.line - offset;
    if (!Number.isFinite(line) || line < 1) return null;
    return { line, column: frame.column };
  } catch {
    return null;
  }
};

/**
 * Stack trimmed to the frames the user can act on, with line numbers shifted
 * back into their own coordinate space. Runner internals are dropped.
 */
export const cleanStack = (error, offset) => {
  try {
    const stack = error?.stack;
    // Always an array: `throw 'text'` has no stack, and returning a different
    // shape for that case made every caller guess.
    if (typeof stack !== 'string') return [];
    const frames = [];
    for (const raw of stack.split('\n').slice(1)) {
      const match = FRAME.exec(raw);
      if (!match) continue;
      const line = Number(match[1]) - offset;
      if (line < 1) continue;
      const name = raw.trim().replace(/^at\s+/, '').split(' (')[0];
      const label =
        name && !name.includes(SOURCE_URL) ? name : '<anonymous>';
      frames.push({ name: label, line, column: Number(match[2]) });
    }
    return frames;
  } catch {
    return [];
  }
};

/** Message plus name, defensive against non-Error throws. */
export const describeThrown = value => {
  try {
    if (value instanceof Error) {
      return {
        name: String(value.name || 'Error'),
        message: String(value.message ?? '')
      };
    }
    // `throw 'text'` and `throw {code:1}` are legal and must still report.
    return { name: 'Uncaught', message: String(value) };
  } catch {
    return { name: 'Uncaught', message: 'Unknown error' };
  }
};
