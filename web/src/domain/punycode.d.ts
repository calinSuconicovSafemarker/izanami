// punycode.js ships no types; `punycode/` (trailing slash) selects the npm package over Node's deprecated builtin.
declare module 'punycode/' {
  export function toASCII(domain: string): string;
  export function toUnicode(domain: string): string;
}
