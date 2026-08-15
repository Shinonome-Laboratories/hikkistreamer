// Plyr ships type declarations (`plyr/src/js/plyr.d.ts`) that only declare a
// global `Plyr` class, without a default export. The ESM build, however, does
// expose a default export, so we augment the module accordingly.
//
// The empty export makes this file a module, so the `declare module` block
// below is treated as a module augmentation rather than a fresh declaration.
export {};

declare module "plyr" {
  export default Plyr;
}
