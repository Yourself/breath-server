function assertNever(x: never): never {
  throw new Error(`Unreachable expression encountered: '${x}'`);
}

export default assertNever;
