import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverRoutes, fillRoute, importClosure, routesOfFile } from "./routes";
import { matchRoute, paramsOf } from "./route-path";

function put(root: string, rel: string, content: string) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

let vite: string;
let next: string;

beforeAll(() => {
  vite = mkdtempSync(path.join(os.tmpdir(), "ve-routes-vite-"));
  put(vite, "src/main.tsx", `
import { BrowserRouter, Routes, Route } from 'react-router';
import App from './App.tsx';
import Rank from './page/Rank.tsx';
import Detail from './components/tintuc/Detail.tsx';
createRoot(document.getElementById('root')).render(
  <BrowserRouter><Routes>
    <Route path="/" element={<App />} />
    <Route path="/rank" element={<Rank />} />
    <Route path="/tintuc/:slug" element={<Detail />} />
    <Route path="/rank" element={<Detail />} />
  </Routes></BrowserRouter>
);`);
  put(vite, "src/App.tsx", `import Banner from './components/home/Banner'; import Header from '@/layout/Header'; export default function App(){return <Banner/>}`);
  put(vite, "src/components/home/Banner.tsx", `import Shared from '../Shared'; export default function B(){return <Shared/>}`);
  put(vite, "src/components/Shared.tsx", `export default function S(){return <img/>}`);
  put(vite, "src/layout/Header.tsx", `export default function H(){return <header/>}`);
  put(vite, "src/page/Rank.tsx", `import Shared from '../components/Shared'; import Rank from '../components/home/Rank'; export default function R(){return <Rank/>}`);
  put(vite, "src/components/home/Rank.tsx", `export default function R(){return <div/>}`);
  put(vite, "src/components/tintuc/Detail.tsx", `import Shared from '../Shared'; export default function D(){return <Shared/>}`);

  next = mkdtempSync(path.join(os.tmpdir(), "ve-routes-next-"));
  put(next, "src/app/layout.tsx", `import Float from '@/components/Float'; export default function L({children}){return <html>{children}<Float/></html>}`);
  put(next, "src/app/page.tsx", `import Banner from '@/components/Banner'; export default function P(){return <Banner/>}`);
  put(next, "src/app/rank/page.tsx", `import Rank from '@/components/Rank'; export default function P(){return <Rank/>}`);
  put(next, "src/app/(site)/tin-tuc/[slug]/page.tsx", `export default function P(){return <div/>}`);
  put(next, "src/app/doc/[...parts]/page.tsx", `export default function P(){return <div/>}`);
  put(next, "src/components/Float.tsx", `export default function F(){return <div/>}`);
  put(next, "src/components/Banner.tsx", `export default function B(){return <div/>}`);
  put(next, "src/components/Rank.tsx", `import Banner from './Banner'; export default function R(){return <Banner/>}`);
});

afterAll(() => {
  rmSync(vite, { recursive: true, force: true });
  rmSync(next, { recursive: true, force: true });
});

describe("discoverRoutes: Vite + react-router", () => {
  it("lists each <Route path> once, with its component's file", async () => {
    const routes = await discoverRoutes(vite, "vite-spa");
    expect(routes.map((r) => r.path)).toEqual(["/", "/rank", "/tintuc/:slug"]);
    expect(routes.find((r) => r.path === "/rank")!.file).toBe("src/page/Rank.tsx"); // the first declaration wins
    expect(routes[0].label).toBe("Trang chủ");
  });

  it("marks parameterised paths as dynamic", async () => {
    const routes = await discoverRoutes(vite, "vite-spa");
    expect(routes.find((r) => r.path === "/tintuc/:slug")!.dynamic).toBe(true);
    expect(routes.find((r) => r.path === "/rank")!.dynamic).toBe(false);
  });

  it("follows relative and @/ imports to list the files a page draws", async () => {
    const routes = await discoverRoutes(vite, "vite-spa");
    const home = routes.find((r) => r.path === "/")!;
    expect(home.files).toEqual(["src/App.tsx", "src/components/Shared.tsx", "src/components/home/Banner.tsx", "src/layout/Header.tsx"]);
    const rank = routes.find((r) => r.path === "/rank")!;
    expect(rank.files).toContain("src/components/home/Rank.tsx");
    expect(rank.files).not.toContain("src/layout/Header.tsx");
  });

  it("a shared component belongs to every page that draws it", async () => {
    const routes = await discoverRoutes(vite, "vite-spa");
    expect(routesOfFile(routes, "src/components/Shared.tsx").map((r) => r.path)).toEqual(["/", "/rank", "/tintuc/:slug"]);
    expect(routesOfFile(routes, "src/components/home/Banner.tsx").map((r) => r.path)).toEqual(["/"]);
  });
});

describe("discoverRoutes: Next.js App Router", () => {
  it("derives the URL from the folders: groups vanish, [x] becomes :x, [...x] becomes *", async () => {
    const routes = await discoverRoutes(next, "nextjs");
    expect(routes.map((r) => r.path)).toEqual(["/", "/doc/*", "/rank", "/tin-tuc/:slug"]);
    expect(routes.filter((r) => r.dynamic).map((r) => r.path)).toEqual(["/doc/*", "/tin-tuc/:slug"]);
  });

  it("a page includes the layouts above it", async () => {
    const routes = await discoverRoutes(next, "nextjs");
    const rank = routes.find((r) => r.path === "/rank")!;
    expect(rank.files).toContain("src/app/layout.tsx");
    expect(rank.files).toContain("src/components/Float.tsx"); // reached through the layout
    expect(rank.files).toContain("src/components/Banner.tsx"); // reached through Rank
  });
});

describe("discoverRoutes: unknown or empty", () => {
  it("falls back to a single home page", async () => {
    const r = await discoverRoutes(vite, "dotnet-mvc");
    expect(r).toEqual([{ path: "/", label: "Trang chủ", dynamic: false, file: "", files: [] }]);
  });
});

describe("importClosure", () => {
  it("terminates on import cycles", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ve-routes-cycle-"));
    put(dir, "src/a.tsx", `import './b'; export default 1`);
    put(dir, "src/b.tsx", `import './a'; export default 2`);
    expect(await importClosure(dir, path.join(dir, "src/a.tsx"))).toEqual(["src/a.tsx", "src/b.tsx"]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("fillRoute", () => {
  it("fills parameters and encodes them", () => {
    expect(fillRoute("/tintuc/:slug", { slug: "bai viet" })).toBe("/tintuc/bai%20viet");
    expect(fillRoute("/rank", {})).toBe("/rank");
    expect(fillRoute("/doc/*", { "*": "a/b" })).toBe("/doc/a/b");
  });
  it("returns null while a parameter is missing", () => {
    expect(fillRoute("/tintuc/:slug", {})).toBeNull();
    expect(fillRoute("/tintuc/:slug", { slug: "  " })).toBeNull();
  });
});

describe("matchRoute / paramsOf", () => {
  const routes = [{ path: "/" }, { path: "/rank" }, { path: "/tintuc/:slug" }, { path: "/tintuc/moi" }, { path: "/doc/*" }];
  it("finds the route of a concrete address, ignoring query, hash and a trailing slash", () => {
    expect(matchRoute(routes, "/")?.path).toBe("/");
    expect(matchRoute(routes, "/rank/?x=1#top")?.path).toBe("/rank");
    expect(matchRoute(routes, "/tintuc/abc")?.path).toBe("/tintuc/:slug");
    expect(matchRoute(routes, "/doc/a/b/c")?.path).toBe("/doc/*");
  });
  it("a fixed route wins over a parameterised one", () => {
    expect(matchRoute(routes, "/tintuc/moi")?.path).toBe("/tintuc/moi");
  });
  it("returns null for an unknown address", () => {
    expect(matchRoute(routes, "/nope")).toBeNull();
    expect(matchRoute(routes, "/tintuc")).toBeNull();
  });
  it("lists the parameters of a route", () => {
    expect(paramsOf("/a/:id/b/:slug")).toEqual(["id", "slug"]);
    expect(paramsOf("/doc/*")).toEqual(["*"]);
    expect(paramsOf("/rank")).toEqual([]);
  });
});
