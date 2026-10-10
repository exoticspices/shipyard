// Node resolve hook: map bare 'three' imports used by src/ to the local dev copy.
const base = new URL('./node_modules/three/', import.meta.url);
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return next(new URL('build/three.module.js', base).href, ctx);
  if (spec.startsWith('three/addons/')) return next(new URL('examples/jsm/' + spec.slice(13), base).href, ctx);
  return next(spec, ctx);
}
