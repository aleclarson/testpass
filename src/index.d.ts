declare type TestFn = (test: RunningTest) => Promise<void> | void
declare type AsyncFn<T = void> = () => Promise<T> | T
declare type MatchFn = (path: string, name: string) => boolean

export = testpass

declare const testpass: {
  header(message: string): void;
  beforeAll(fn: AsyncFn): void;
  beforeEach(fn: AsyncFn): void;
  afterEach(fn: AsyncFn): void;
  afterAll(fn: AsyncFn): void;
  filter(pattern: string | RegExp): void;
  group(id: string, fn: () => void): void;
  group(fn: () => void): void;
  fgroup(id: string, fn: () => void): void;
  fgroup(fn: () => void): void;
  xgroup(id: string, fn: () => void): void;
  xgroup(fn: () => void): void;
  test(id: string, fn: TestFn): Test;
  test(fn: TestFn): Test;
  ftest(id: string, fn: TestFn): Test;
  ftest(fn: TestFn): Test;
  xtest(id: string, fn: TestFn): Test;
  xtest(fn: TestFn): Test;
  watchDir(dir: string): void;
  findTests(dir: string, pattern: string | RegExp | MatchFn): void;
  reloadTests(path: string): boolean;
  reloadAllTests(): void;
  removeTests(path: string): boolean;
  startTests(options?: RunnerOptions): Promise<Object>;
  stopTests(): Promise<void>;
}

declare class Test {
  id: string;
  fn: TestFn;
  line: number;
  catch(value: any): void;
}

declare type RunnerOptions = {
  verbose?: boolean,
  quiet?: boolean,
}

declare class RunningTest {
  /**
   * Fail this test if the two values are not deeply equal.
   */
  eq(result: any, expected: any): void;
  /**
   * Fail this test if the two values are deeply equal.
   */
  ne(result: any, expected: any): void;
  /**
   * Fail this test if the given value is falsy.
   */
  assert(cond: any): void;
  /**
   * Fail this test with the given message.
   */
  fail(message: string): void;
  /**
   * Make this test asynchronous. You must call `done` or `fail`
   * for this test to stop running.
   */
  async(): void;
  /**
   * Pass this test asynchronously.
   */
  done(): void;
  /**
   * Convenience method for creating a timeout promise.
   */
  delay<T>(ms: number, fn: AsyncFn<T>): Promise<T>;
  /**
   * Create a function that tracks a call.
   */
  spy(id?: string): Spy;
  /**
   * Run a function after all spies are called.
   */
  spies(done: () => void): void;
}

declare interface Spy {
  (...args: any[]): any;
  calls: number;
  id?: string;
}
