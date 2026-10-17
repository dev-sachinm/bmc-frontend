import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken, currentUsername } from "./session";

const wideMenuQuery = "(min-width: 1024px)";

function isWideScreen() {
  return typeof window.matchMedia === "function" && window.matchMedia(wideMenuQuery).matches;
}

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(isWideScreen);

  const me = currentUsername();
  const isAdmin = me === "systemadmin";

  const baseLinks = [
    { to: "/", label: "Tanks", hint: "Live readings", end: true },
    { to: "/tanks/new", label: "New tank", hint: "Formula and model", end: false },
  ];

  const adminLinks = isAdmin
    ? [{ to: "/users", label: "Users", hint: "Manage accounts", end: false }]
    : [];

  const links = [...baseLinks, ...adminLinks];

  useEffect(() => {
    if (!isWideScreen()) {
      setOpen(false);
    }
  }, [location.pathname]);

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="flex min-h-dvh w-full">
      {open ? (
        <button
          type="button"
          className="fixed top-12 right-0 bottom-0 left-0 z-30 bg-stone-950/45 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        id="main-menu"
        className={`fixed top-12 bottom-0 left-0 z-40 flex w-[18.5rem] max-w-[85vw] min-w-0 flex-col border-r border-white/10 bg-[#10211c] text-[#f6f1e7] transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:bottom-auto lg:z-auto lg:h-dvh lg:max-w-none lg:shrink-0 ${
          open
            ? "translate-x-0 overflow-y-auto lg:w-[18.5rem]"
            : "-translate-x-full overflow-hidden border-r-0 lg:w-0 lg:translate-x-0"
        }`}
      >
        <div className="border-b border-white/10 px-6 py-7">
          <p className="text-[0.7rem] font-semibold tracking-[0.28em] text-[#c4a574] uppercase">
            Bulk milk cooler monitoring
          </p>
          <p className="font-display mt-3 text-3xl leading-none text-white">Chilling floor</p>
          <p className="mt-3 max-w-[16rem] text-sm leading-6 text-[#d7e3dc]/75">
            Tank formulas, live volume, and temperature at one place.
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-5" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `group rounded-2xl px-4 py-3 transition ${
                  isActive ? "bg-white/10 shadow-[inset_3px_0_0_#c4a574]" : "hover:bg-white/10"
                }`
              }
            >
              <span className="block text-sm font-semibold text-white">{link.label}</span>
              <span className="mt-0.5 block text-xs text-[#d7e3dc]/65">{link.hint}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          {me ? (
            <p className="mb-2 truncate px-3 text-xs font-medium text-[#d7e3dc]/60">{me}</p>
          ) : null}
          <button
            type="button"
            className="min-h-11 w-full rounded-2xl px-3 text-sm font-semibold text-[#f3e6cf] hover:bg-white/10"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-1 border-b border-stone-200/80 bg-[#f6f1e7] px-2">
          <button
            type="button"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[#1f4d42]"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="main-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="flex w-5 flex-col gap-[5px]" aria-hidden="true">
              <span className="block h-0.5 w-full rounded-full bg-current" />
              <span className="block h-0.5 w-full rounded-full bg-current" />
              <span className="block h-0.5 w-full rounded-full bg-current" />
            </span>
          </button>
          <p className="font-display text-lg leading-none text-[#1f4d42]">BMC</p>
        </div>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
