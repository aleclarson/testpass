// @flow

declare type TestFn = (test: RunningTest) => ?Promise<void>
declare type AsyncFn = () => ?Promise<void>
declare type MatchFn = (path: string, name: string) => ?boolean

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
  startTests(options: RunnerOptions): Promise<Object>;
  stopTests(): Promise<void>;
}

declare class Test {
  id: string;
  fn: TestFn;
  line: number;
  catch(value: any): void;
}

declare type RunnerOptions = {
  verbose: ?boolean,
  quiet: ?boolean,
}

declare class RunningTest {
  eq(result: any, expected: any): void;
  ne(result: any, expected: any): void;
  assert(cond: ?boolean): void;
  fail(message: string): void;
}
