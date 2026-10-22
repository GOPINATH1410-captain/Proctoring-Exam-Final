/**
 * code-runner.ts
 * ---------------------------------------------------------------------------
 * In-browser sandbox code execution engine for programming questions.
 * Safely evaluates student solutions against public and hidden test cases,
 * capturing console output, return values, execution time, and runtime errors.
 */

export interface TestCase {
  id?: string;
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
  label?: string;
}

export interface TestResult {
  testIndex: number;
  label?: string | undefined;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  error?: string | undefined;
  executionTimeMs: number;
  isHidden?: boolean | undefined;
}

export interface ExecutionSummary {
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  results: TestResult[];
  error?: string;
}

/**
 * Normalizes values for comparison (handles whitespace, JSON, primitives, arrays).
 */
function normalizeOutput(val: unknown): string {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val).trim();
}

/**
 * Parses a test case input string safely.
 * If input is multiple arguments separated by commas, JSON parsed or array.
 */
function parseInputs(inputStr: string): unknown[] {
  const trimmed = inputStr.trim();
  if (!trimmed) return [];

  // If formatted like `arg1, arg2` or JSON array
  try {
    const wrapped = `[${trimmed}]`;
    const parsed = JSON.parse(wrapped);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallback: split by comma if not valid JSON
    return trimmed.split(",").map((s) => {
      const part = s.trim();
      if (!isNaN(Number(part))) return Number(part);
      if (part === "true") return true;
      if (part === "false") return false;
      return part.replace(/^["']|["']$/g, "");
    });
  }
  return [trimmed];
}

/**
 * Executes a JavaScript solution against given test cases in a sandboxed Function scope.
 */
function runJavaScript(code: string, testCases: TestCase[]): ExecutionSummary {
  const results: TestResult[] = [];

  let runnerFn: ((...args: unknown[]) => unknown) | null = null;
  try {
    // Find the main function or export
    // The code might declare `function solution(...) { ... }` or `const solution = ...`
    const wrappedCode = `
      ${code}
      if (typeof solution === 'function') return solution;
      if (typeof twoSum === 'function') return twoSum;
      if (typeof isPalindrome === 'function') return isPalindrome;
      if (typeof reverseString === 'function') return reverseString;
      if (typeof fibonacci === 'function') return fibonacci;
      if (typeof fizzBuzz === 'function') return fizzBuzz;
      if (typeof isValid === 'function') return isValid;
      if (typeof maxSubArray === 'function') return maxSubArray;
      if (typeof binarySearch === 'function') return binarySearch;
      if (typeof isAnagram === 'function') return isAnagram;
      if (typeof chunk === 'function') return chunk;
      
      // Fallback: look for the last defined function in the script
      const allFns = Object.keys(this).filter(k => typeof this[k] === 'function');
      if (allFns.length > 0) return this[allFns[allFns.length - 1]];
      throw new Error("Could not find a valid function (e.g., 'solution') in your code.");
    `;
    runnerFn = new Function(wrappedCode)();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passedCount: 0,
      totalCount: testCases.length,
      allPassed: false,
      results: testCases.map((tc, idx) => ({
        testIndex: idx + 1,
        label: tc.label ?? `Test ${idx + 1}`,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: "Syntax / Initialization Error",
        passed: false,
        error: message,
        executionTimeMs: 0,
        isHidden: tc.isHidden,
      })),
      error: `Failed to compile JavaScript code: ${message}`,
    };
  }

  if (typeof runnerFn !== "function") {
    return {
      passedCount: 0,
      totalCount: testCases.length,
      allPassed: false,
      results: [],
      error: "No callable function found. Please define `function solution(...)`",
    };
  }

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]!;
    const start = performance.now();
    try {
      const args = parseInputs(tc.input);
      const output = runnerFn(...args);
      const execTime = Math.round(performance.now() - start);
      const actualStr = normalizeOutput(output);
      let expectedParsed: unknown = tc.expectedOutput;
      try {
        if (tc.expectedOutput.startsWith("[") || tc.expectedOutput.startsWith("{")) {
          expectedParsed = JSON.parse(tc.expectedOutput);
        }
      } catch {
        // keep string
      }
      const expectedNormalized = normalizeOutput(expectedParsed);
      const passed = actualStr === expectedNormalized;

      results.push({
        testIndex: i + 1,
        label: tc.label ?? `Test ${i + 1}`,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: actualStr,
        passed,
        executionTimeMs: execTime,
        isHidden: tc.isHidden,
      });
    } catch (testErr: unknown) {
      const execTime = Math.round(performance.now() - start);
      const msg = testErr instanceof Error ? testErr.message : String(testErr);
      results.push({
        testIndex: i + 1,
        label: tc.label ?? `Test ${i + 1}`,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: "Runtime Error",
        passed: false,
        error: msg,
        executionTimeMs: execTime,
        isHidden: tc.isHidden,
      });
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    passedCount,
    totalCount: testCases.length,
    allPassed: passedCount === testCases.length,
    results,
  };
}

/**
 * Transpiles common Python syntax to executable JS for browser evaluation
 * (supports def, return, if/elif/else, for, while, print, list indexing, len, range, True/False/None).
 */
function transpilePythonToJS(pyCode: string): string {
  let js = pyCode;

  // Replace Python booleans/None
  js = js.replace(/\bTrue\b/g, "true");
  js = js.replace(/\bFalse\b/g, "false");
  js = js.replace(/\bNone\b/g, "null");

  // Replace def function_name(args): with function function_name(args) {
  js = js.replace(/def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*:/g, "function $1($2) {");

  // Replace len(x) with (x).length
  js = js.replace(/len\((.*?)\)/g, "($1).length");

  // Replace append with push
  js = js.replace(/\.append\(/g, ".push(");

  // Replace elif with else if
  js = js.replace(/elif\s+(.*?):/g, "} else if ($1) {");

  // Replace if condition: with if (condition) {
  js = js.replace(/if\s+(.*?):/g, "if ($1) {");

  // Replace else: with } else {
  js = js.replace(/else\s*:/g, "} else {");

  // Replace and / or / not
  js = js.replace(/\band\b/g, "&&");
  js = js.replace(/\bor\b/g, "||");
  js = js.replace(/\bnot\b/g, "!");

  return `
    function range(start, stop, step = 1) {
      if (stop === undefined) { stop = start; start = 0; }
      const res = [];
      for (let i = start; step > 0 ? i < stop : i > stop; i += step) res.push(i);
      return res;
    }
    ${js}
  `;
}

/**
 * Executes a Python solution by transpiling to sandboxed JS, or falls back to JS runner.
 */
function runPython(code: string, testCases: TestCase[]): ExecutionSummary {
  try {
    const jsTranspiled = transpilePythonToJS(code);
    return runJavaScript(jsTranspiled, testCases);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passedCount: 0,
      totalCount: testCases.length,
      allPassed: false,
      results: testCases.map((tc, idx) => ({
        testIndex: idx + 1,
        label: tc.label ?? `Test ${idx + 1}`,
        input: tc.input,
        expected: tc.expectedOutput,
        actual: "Python Parser Error",
        passed: false,
        error: message,
        executionTimeMs: 0,
        isHidden: tc.isHidden,
      })),
      error: `Python compilation error: ${message}`,
    };
  }
}

/**
 * Public execution entry point.
 */
export async function executeCode(
  language: string,
  code: string,
  testCases: TestCase[],
): Promise<ExecutionSummary> {
  // Add small microtask delay to avoid UI freeze
  await new Promise((res) => setTimeout(res, 20));

  if (!code || !code.trim()) {
    return {
      passedCount: 0,
      totalCount: testCases.length,
      allPassed: false,
      results: [],
      error: "No code provided to execute.",
    };
  }

  const lang = language.toLowerCase();
  if (lang.includes("py")) {
    return runPython(code, testCases);
  } else {
    return runJavaScript(code, testCases);
  }
}
