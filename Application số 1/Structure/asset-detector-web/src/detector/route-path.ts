// Pure helpers about route paths and which files draw which page. No Node APIs: the editor (browser) uses them too.

/** Routes whose files include this source file (a shared component is on several pages). */
export function routesOfFile<R extends { files: string[] }>(routes: R[], sourcePath: string): R[] {
  return routes.filter((r) => r.files.includes(sourcePath));
}

/** "/tintuc/:slug" with { slug: "abc" } -> "/tintuc/abc". Returns null when a parameter is missing. */
export function fillRoute(routePath: string, params: Record<string, string>): string | null {
  let missing = false;
  const filled = routePath
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        const v = (params[seg.slice(1)] ?? "").trim();
        if (!v) missing = true;
        return encodeURIComponent(v);
      }
      if (seg === "*") {
        const v = (params["*"] ?? "").trim();
        if (!v) missing = true;
        return v.split("/").map(encodeURIComponent).join("/");
      }
      return seg;
    })
    .join("/");
  return missing ? null : filled;
}

/** Names of the parameters of a route path: "/a/:id/:slug" -> ["id", "slug"]; "*" -> ["*"]. */
export function paramsOf(routePath: string): string[] {
  return routePath
    .split("/")
    .filter((s) => s.startsWith(":") || s === "*")
    .map((s) => (s === "*" ? "*" : s.slice(1)));
}

/** The route a concrete pathname belongs to (static routes beat parameterised ones), or null. */
export function matchRoute<R extends { path: string }>(routes: R[], pathname: string): R | null {
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const segs = clean.split("/").filter(Boolean);
  const score = (r: R) => r.path.split("/").filter((s) => s.startsWith(":") || s === "*").length;
  const sorted = [...routes].sort((a, b) => score(a) - score(b));
  for (const r of sorted) {
    const rs = r.path.split("/").filter(Boolean);
    let ok = true;
    for (let i = 0; i < rs.length && ok; i++) {
      if (rs[i] === "*") return r;
      if (segs[i] === undefined) ok = false;
      else if (!rs[i].startsWith(":") && rs[i] !== segs[i]) ok = false;
    }
    if (ok && rs.length === segs.length) return r;
  }
  return null;
}
