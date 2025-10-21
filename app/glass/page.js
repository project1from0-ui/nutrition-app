"use client";
import React, { useState } from "react";

const glassBase =
  "backdrop-blur-xl bg-white/20 dark:bg-white/10 border border-white/20 dark:border-white/10 " +
  "shadow-[0_8px_32px_0_rgba(31,38,135,0.25)] rounded-2xl";

const glassSurface =
  `${glassBase} relative overflow-hidden before:content-[''] before:absolute before:inset-0 ` +
  "before:bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.22),rgba(255,255,255,0))] " +
  "after:content-[''] after:absolute after:-top-1/2 after:-left-1/4 after:w-[150%] after:h-[150%] " +
  "after:bg-[conic-gradient(from_180deg_at_50%_50%,rgba(255,255,255,0.08),rgba(173,216,230,0.10),rgba(255,255,255,0.06),rgba(255,192,203,0.10),rgba(255,255,255,0.08))] after:opacity-60 after:blur-3xl";

const textMuted = "text-slate-600 dark:text-slate-300";
const textStrong = "text-slate-900 dark:text-white";

function GlassCard({ title, description, children }) {
  return (
    <div className={`${glassSurface} p-5`}>
      <div className="relative z-10">
        <h3 className={`text-lg font-semibold ${textStrong}`}>{title}</h3>
        {description && <p className={`mt-1 text-sm ${textMuted}`}>{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function GlassButton({ children, variant = "primary", className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/40 dark:focus-visible:ring-white/30";

  const variants = {
    primary:
      `${glassBase} bg-white/25 dark:bg-white/10 border-white/30 dark:border-white/10 ` +
      "hover:bg-white/35 active:bg-white/40",
    soft:
      `${glassBase} bg-gradient-to-b from-white/20 to-white/10 dark:from-white/10 dark:to-white/5 border-white/20 ` +
      "hover:from-white/30 hover:to-white/15",
    outline:
      `border border-white/40 dark:border-white/20 bg-transparent backdrop-blur-xl rounded-xl ` +
      "hover:bg-white/10",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function GlassInput({ label, ...props }) {
  return (
    <label className="block">
      {label && <span className={`mb-1 block text-sm ${textMuted}`}>{label}</span>}
      <input
        className={
          `${glassBase} w-full px-4 py-2 bg-white/15 dark:bg-white/10 border-white/25 ` +
          "placeholder-white/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        }
        {...props}
      />
    </label>
  );
}

function GlassToggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={
        `${glassBase} w-14 h-8 p-1 flex items-center transition ${checked ? "bg-white/30" : "bg-white/15"}`
      }
    >
      <span
        className={
          `h-6 w-6 rounded-full bg-white/90 dark:bg-white/80 shadow ` +
          `transform transition ${checked ? "translate-x-6" : "translate-x-0"}`
        }
      />
    </button>
  );
}

function GlassNavbar() {
  return (
    <nav
      className={
        `${glassSurface} sticky top-4 z-50 mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-3`
      }
    >
      <div className="relative z-10 flex items-center gap-2">
        <div className="h-7 w-7 rounded-xl bg-white/70 dark:bg-white/60" />
        <span className={`font-semibold ${textStrong}`}>Liquid Glass</span>
      </div>
      <div className="relative z-10 hidden gap-2 md:flex">
        <GlassButton variant="outline">Features</GlassButton>
        <GlassButton variant="outline">Pricing</GlassButton>
        <GlassButton variant="primary">Get Started</GlassButton>
      </div>
    </nav>
  );
}

function GlassModal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`${glassSurface} relative z-10 w-[min(92vw,560px)] p-6`}>{children}</div>
    </div>
  );
}

export default function Page() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_20%_10%,#9bdcff_0%,transparent_60%),radial-gradient(120%_120%_at_80%_0%,#ffc0cb_0%,transparent_60%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] text-white/95 p-4 md:p-8">
      <GlassNavbar />

      <main className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-2">
        <GlassCard title="Search" description="Type to try the glass input.">
          <div className="flex items-center gap-3">
            <GlassInput placeholder="Find restaurants…" />
            <GlassButton>Go</GlassButton>
          </div>
        </GlassCard>

        <GlassCard title="Quick Actions" description="Buttons with different glass variants.">
          <div className="flex flex-wrap gap-3">
            <GlassButton variant="primary">Primary</GlassButton>
            <GlassButton variant="soft">Soft</GlassButton>
            <GlassButton variant="outline">Outline</GlassButton>
            <GlassButton onClick={() => setOpen(true)}>Open Modal</GlassButton>
          </div>
        </GlassCard>

        <GlassCard title="Preferences" description="Try the iOS-like toggle.">
          <div className="flex items-center gap-4">
            <GlassToggle checked={enabled} onChange={setEnabled} />
            <span className={textMuted}>Notifications: {enabled ? "On" : "Off"}</span>
          </div>
        </GlassCard>

        <GlassCard title="Info" description="Use this surface for cards, sheets, menus.">
          <ul className="list-disc pl-6 text-sm leading-relaxed text-white/90">
            <li>Backdrop blur with subtle gradient sheen.</li>
            <li>Soft border and shadow for depth.</li>
            <li>Works in light/dark — try adding <code>className=\"dark\"</code> on <code>&lt;html&gt;</code>.</li>
          </ul>
        </GlassCard>
      </main>

      <GlassModal open={open} onClose={() => setOpen(false)}>
        <h3 className={`text-xl font-semibold ${textStrong}`}>Liquid Glass Modal</h3>
        <p className={`mt-2 ${textMuted}`}>
          This modal demonstrates the same liquid surface treatment with a dimmed backdrop.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <GlassButton variant="outline" onClick={() => setOpen(false)}>Cancel</GlassButton>
          <GlassButton onClick={() => setOpen(false)}>Confirm</GlassButton>
        </div>
      </GlassModal>

      <footer className="mx-auto mt-12 max-w-5xl text-center text-xs text-white/60">
        Tip: tune intensity by editing bg opacities (e.g., bg-white/20→/30), border opacity, and blur radius.
      </footer>
    </div>
  );
}


