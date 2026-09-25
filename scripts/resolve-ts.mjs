// The app's imports are extensionless ("./tick"), which Vite resolves and Node does not.
// This lets the check harness load any pure module without the source having to bend to it.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await next(specifier, context);
    } catch (e) {
      if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
      return next(specifier + '.ts', context);
    }
  }
  return next(specifier, context);
}
