// @aws-sdk/types depends on some types from the DOM library being present. This
// is awkward because this is not browser-run code, and there is no DOM. So
// instead, we manually insert ambient declarations for the missing types. If
// the "real" DOM library is present, declarations will be merged.
declare interface ReadableStream { }
