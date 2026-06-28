"use client";

// @t2000/ui ships its themed shadcn primitives WITHOUT a "use client" banner,
// so importing them straight into a server component makes Next evaluate the
// Radix client code on the server (→ runtime crash). This barrel re-exports
// them behind a "use client" boundary so server components (landing, overview)
// can use them safely. Client components may import from here or @t2000/ui
// directly.
export * from "@t2000/ui";
