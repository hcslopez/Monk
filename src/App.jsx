import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, RotateCcw, SkipForward, Flame, Sparkles, Settings as SettingsIcon,
  Minus, Plus, Volume2, VolumeX, X, ChevronLeft, ChevronRight, Check, Clock, Trophy,
  Lock, LogOut, Crown, KeyRound, Mail, Eye, EyeOff, ChevronDown, ShieldCheck, DollarSign
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell
} from "recharts";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ================================================================== */
/*  Theme + helpers                                                    */
/* ================================================================== */
const C = {
  bg: "#0A0F0D", win: "#0C1310", surface: "#121A16", elevated: "#18211C",
  line: "rgba(140,200,170,0.09)", lineStrong: "rgba(140,200,170,0.18)",
  textHi: "#ECF2EE", textMid: "#93A39A", textLo: "#5C6B62",
  accent: "#3DDC97", accentDim: "#2BBE82", accentDeep: "#1B8E63",
  accentGlow: "rgba(61,220,151,0.20)", danger: "#F2696B", gold: "#F0C26E",
};
const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const OWNER_PASSWORD = "Ilovethegym.1";   // prototype gate — replace with real owner auth in production
const OWNER_EMAIL = "johanlopezba1@gmail.com";
const PRICE = 7;
const TRIAL_DAYS = 3;

const mem = {};
const store = {
  async get(k) {
    try { const v = localStorage.getItem(k); if (v !== null) return v; } catch (_) {}
    return k in mem ? mem[k] : null;
  },
  async set(k, v) {
    try { localStorage.setItem(k, v); return; } catch (_) {}
    mem[k] = v;
  },
};

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mondayOf = (date) => { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
function fmtDuration(sec) { if (!sec) return "0m"; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); if (h && m) return `${h}h ${m}m`; if (h) return `${h}h`; return `${m}m`; }
const fmtClock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const DEFAULT_SETTINGS = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: true, soundOn: true, name: "You" };
const MODES = { focus: { label: "Focus" }, short: { label: "Short Break" }, long: { label: "Long Break" } };

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx(); const now = ctx.currentTime;
    [659.25, 987.77].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq; const t = now + i * 0.16;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.95);
    });
    setTimeout(() => ctx.close(), 1400);
  } catch (_) {}
}

/* ================================================================== */
/*  Root: auth gate → app                                              */
/* ================================================================== */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [proMap, setProMap] = useState({});
  const [tx, setTx] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session?.user ?? null);
      setBooting(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [proLoaded, setProLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    setProLoaded(false);
    (async () => {
      const { data } = await supabase.from("user_data").select("pro, tx").eq("user_id", session.id).single();
      if (data) {
        if (data.pro && Object.keys(data.pro).length) setProMap(data.pro);
        if (data.tx && data.tx.length) setTx(data.tx);
      }
      setProLoaded(true);
    })();
  }, [session?.id]);

  useEffect(() => {
    if (!session || !proLoaded) return;
    supabase.from("user_data").upsert({ user_id: session.id, pro: proMap, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }, [proMap, session?.id, proLoaded]);

  useEffect(() => {
    if (!session || !proLoaded) return;
    supabase.from("user_data").upsert({ user_id: session.id, tx, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }, [tx, session?.id, proLoaded]);

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    setTx((prev) => [{ email, type: "signup", amount: 0, ts: Date.now() }, ...prev]);
    return null;
  };
  const logIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return error ? error.message : null;
  };
  const logOut = () => supabase.auth.signOut();

  const startTrial = () => {
    const ends = Date.now() + TRIAL_DAYS * 86400000;
    setProMap((prev) => ({ ...prev, status: "trial", trialEnds: ends }));
    setTx((prev) => [{ email: session.email, type: "trial", amount: 0, ts: Date.now() }, ...prev]);
  };
  const buyLifetime = () => {
    setProMap({ status: "lifetime", trialEnds: 0, purchasedAt: Date.now() });
    setTx((prev) => [{ email: session.email, type: "lifetime", amount: PRICE, ts: Date.now() }, ...prev]);
  };


  const proState = useMemo(() => {
    const p = proMap;
    if (!p?.status) return { isPro: false, status: "free", trialLeft: 0 };
    if (p.status === "lifetime") return { isPro: true, status: "lifetime", trialLeft: 0 };
    if (p.status === "trial" && Date.now() < p.trialEnds) {
      return { isPro: true, status: "trial", trialLeft: Math.ceil((p.trialEnds - Date.now()) / 86400000) };
    }
    return { isPro: false, status: p.status === "trial" ? "expired" : "free", trialLeft: 0 };
  }, [proMap]);

  const [showLanding, setShowLanding] = useState(!session);

  // Once user logs in, skip landing
  useEffect(() => { if (session) setShowLanding(false); }, [session]);

  if (booting || (session && !proLoaded)) return <div style={S.bootRoot}><style>{CSS}</style><div className="flow-spin" style={S.spinner} /></div>;

  return (
    <div style={S.appRoot}>
      <style>{CSS}</style>
      {showLanding && !session ? (
        <LandingPage onGetStarted={() => setShowLanding(false)} />
      ) : !session ? (
        <AuthScreen onSignUp={signUp} onLogIn={logIn} onReset={resetPassword} onBack={() => setShowLanding(true)} />
      ) : (
        <MainApp
          email={session.email}
          proState={proState}
          tx={tx}
          onLogOut={logOut}
          onStartTrial={startTrial}
          onBuyLifetime={buyLifetime}
          onOpenAdmin={() => setShowAdmin(true)}
          onProLoad={(p) => setProMap(p)}
          onTxLoad={(t) => setTx(t)}
        />
      )}
      {showAdmin && (
        <AdminDashboard proMap={proMap} tx={tx} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Landing page                                                       */
/* ================================================================== */
function LandingPage({ onGetStarted }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = document.getElementById("bemonk-landing");
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 40);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div id="bemonk-landing" style={LS.root} className="flow-fade">
      {/* Nav */}
      <nav style={{ ...LS.nav, background: scrolled ? "rgba(10,15,13,0.92)" : "transparent", backdropFilter: scrolled ? "blur(16px)" : "none", borderBottom: scrolled ? `1px solid ${C.line}` : "1px solid transparent" }}>
        <div style={LS.navInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.accent, boxShadow: `0 0 10px ${C.accentGlow}`, display: "block" }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: C.textHi, letterSpacing: "-0.01em" }}>Bemonk</span>
          </div>
          <button className="flow-press flow-focus" style={LS.navCta} onClick={onGetStarted}>Get started — free</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={LS.hero}>
        <div style={LS.heroEyebrow}>Built by a nursing student. Priced like it.</div>
        <h1 style={LS.heroH1}>
          What can't be measured<br />can't be improved.
        </h1>
        <p style={LS.heroSub}>
          Track every focus session. See your output. Build the streak. The number on the screen becomes the target — and that changes how you study.
        </p>
        <div style={LS.heroCtas}>
          <button className="flow-press flow-focus" style={LS.primaryBtn} onClick={onGetStarted}>Start for free</button>
          <span style={{ color: C.textLo, fontSize: 13.5 }}>$7 once for lifetime Pro · no subscription</span>
        </div>
        <div style={LS.heroPreview}>
          <img
            src="/app-preview.png"
            alt="Bemonk interface"
            style={{ width: "100%", borderRadius: 12, display: "block" }}
          />
        </div>
      </section>

      {/* Science */}
      <section style={{ ...LS.section, background: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div style={LS.sectionInner}>
          <div style={LS.eyebrow}>The research</div>
          <h2 style={LS.h2}>Progress itself is the motivation.</h2>
          <div style={LS.quoteCard}>
            <div style={LS.quoteAccent} />
            <div>
              <p style={{ ...LS.body, margin: 0, color: C.textHi, lineHeight: 1.7 }}>
                Harvard researchers at HBS studied 238 professionals through thousands of diary entries and found one thing drove motivation more than anything else — not rewards, not recognition, but simply <strong style={{ color: C.accent, fontWeight: 650 }}>making progress in meaningful work</strong>. Even small steps forward had a measurable effect on inner drive.
              </p>
              <p style={{ fontSize: 12, color: C.textLo, marginTop: 12 }}>
                Amabile & Kramer, <em>The Progress Principle</em> — Harvard Business School, 2011
              </p>
            </div>
          </div>
          <p style={LS.body}>
            That's exactly what a flow count does. Seeing 6 sessions on Tuesday and 4 on Wednesday doesn't just inform you — it challenges you. The bar on your screen becomes a quiet target. That's not gamification. That's how progress works.
          </p>
        </div>
      </section>

      {/* Comparison */}
      <section style={LS.section}>
        <div style={LS.sectionInner}>
          <div style={LS.eyebrow}>vs. the competition</div>
          <h2 style={LS.h2}>Full features. One price. No catch.</h2>
          <div style={LS.compGrid}>
            <div style={LS.compCard}>
              <div style={LS.compName}>Other apps</div>
              {["$49/year to unlock charts","Weekly stats behind paywall","Monthly view = premium","Yearly view = premium","Streak tracking = premium","No lifetime option"].map((item, i) => (
                <div key={i} style={LS.compRow}>
                  <span style={{ color: C.danger, fontSize: 16 }}>×</span>
                  <span style={{ color: C.textMid, fontSize: 14 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ ...LS.compCard, border: `1px solid ${C.accent}`, background: "rgba(61,220,151,0.04)" }}>
              <div style={{ ...LS.compName, color: C.accent }}>Bemonk Pro</div>
              {["$7 once — forever","Weekly charts included","Monthly view included","Yearly view included","Streak tracking included","No renewal ever"].map((item, i) => (
                <div key={i} style={LS.compRow}>
                  <span style={{ color: C.accent, fontSize: 16 }}>✓</span>
                  <span style={{ color: C.textHi, fontSize: 14 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...LS.section, textAlign: "center" }}>
        <div style={{ ...LS.sectionInner, alignItems: "center" }}>
          <div style={LS.eyebrow}>Get started</div>
          <h2 style={{ ...LS.h2, textAlign: "center" }}>Free to start. $7 to unlock everything.</h2>
          <p style={{ ...LS.body, textAlign: "center", maxWidth: 480, margin: "0 auto 28px" }}>
            Create an account in under a minute. The timer is free forever. Upgrade to Pro when you want the full picture.
          </p>
          <button className="flow-press flow-focus" style={{ ...LS.primaryBtn, fontSize: 16, padding: "16px 40px" }} onClick={onGetStarted}>
            Create your account
          </button>
          <p style={{ color: C.textLo, fontSize: 12.5, marginTop: 16 }}>No credit card required to start</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={LS.footer}>
        <span style={{ color: C.textLo, fontSize: 12 }}>© 2026 Bemonk · Built by a nursing student who got tired of paying too much for a timer.</span>
      </footer>
    </div>
  );
}

const LS = {
  root: { height: "100vh", overflowY: "auto", background: C.bg, fontFamily: FONT, color: C.textHi, scrollBehavior: "smooth" },
  nav: { position: "sticky", top: 0, zIndex: 10, transition: "all .3s ease" },
  navInner: { maxWidth: 960, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  navCta: { background: C.accent, color: C.bg, border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 650, cursor: "pointer", fontFamily: FONT },
  hero: { maxWidth: 720, margin: "0 auto", padding: "100px 24px 80px", textAlign: "center" },
  heroEyebrow: { fontSize: 12.5, fontWeight: 600, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 },
  heroH1: { fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 720, lineHeight: 1.12, letterSpacing: "-0.03em", color: C.textHi, margin: "0 0 22px" },
  heroSub: { fontSize: 17, color: C.textMid, lineHeight: 1.7, maxWidth: 540, margin: "0 auto 32px" },
  heroCtas: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  primaryBtn: { background: C.accent, color: C.bg, border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 15, fontWeight: 680, cursor: "pointer", fontFamily: FONT, boxShadow: `0 8px 30px ${C.accentGlow}` },
  heroPreview: { marginTop: 56, background: C.surface, border: `1px solid ${C.lineStrong}`, borderRadius: 16, overflow: "hidden", maxWidth: 480, margin: "56px auto 0" },
  previewBar: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.elevated },
  previewDot: { width: 10, height: 10, borderRadius: "50%" },
  previewBody: { padding: "20px 16px 16px" },
  section: { padding: "80px 24px" },
  sectionInner: { maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column" },
  eyebrow: { fontSize: 11.5, fontWeight: 600, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 },
  h2: { fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 720, letterSpacing: "-0.025em", color: C.textHi, margin: "0 0 20px", lineHeight: 1.2 },
  body: { fontSize: 16, color: C.textMid, lineHeight: 1.75, marginBottom: 16 },
  quoteCard: { display: "flex", gap: 20, background: C.elevated, border: `1px solid ${C.lineStrong}`, borderRadius: 16, padding: "24px 22px", margin: "8px 0 24px" },
  quoteAccent: { width: 3, borderRadius: 99, background: C.accent, flexShrink: 0 },
  compGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 },
  compCard: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 18px" },
  compName: { fontWeight: 700, color: C.textMid, fontSize: 14, marginBottom: 16, letterSpacing: "0.02em" },
  compRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.line}` },
  featGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 },
  featCard: { background: C.elevated, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 18px" },
  footer: { borderTop: `1px solid ${C.line}`, padding: "24px", textAlign: "center" },
};

/* ================================================================== */
/*  Auth screen (login / signup / forgot)                              */
/* ================================================================== */
function AuthScreen({ onSignUp, onLogIn, onReset, onBack }) {
  const [view, setView] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPw, setNewPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const submit = async () => {
    setErr(""); setDone("");
    if (!validEmail(email)) return setErr("Enter a valid email address.");
    if (view === "forgot") {
      const e = await onReset(email.trim());
      if (e) return setErr(e);
      setDone("Check your email for a reset link.");
      return;
    }
    if (password.length < 6) return setErr("Password needs at least 6 characters.");
    if (view === "signup") {
      const e = await onSignUp(email, password);
      if (e) return setErr(e);
      setDone("Account created! Check your email to confirm, then log in.");
      setView("login");
    } else {
      const e = await onLogIn(email, password);
      if (e) return setErr(e);
    }
  };

  return (
    <div style={S.authRoot}>
      <div style={S.authCard} className="flow-fade">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textMid, display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontFamily: FONT, padding: 0 }}>
            <ChevronLeft size={16} color={C.textMid} /> Back
          </button>
        </div>
        <div style={S.authBrand}>
          <span style={S.brandDotLg} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Bemonk</span>
        </div>
        <div style={S.authTitle}>
          {view === "login" ? "Welcome back" : view === "signup" ? "Create your account" : "Reset your password"}
        </div>
        <div style={S.authSub}>
          {view === "login" ? "Log in to pick up where you left off."
            : view === "signup" ? "Track every flow. Build the streak."
            : "Enter your email and choose a new password."}
        </div>

        {view !== "forgot" && (
          <div style={S.authTabs}>
            {["login", "signup"].map((v) => (
              <button key={v} className="flow-press flow-focus" onClick={() => { setView(v); setErr(""); setDone(""); }}
                style={{ ...S.authTab, color: view === v ? C.bg : C.textMid, background: view === v ? C.accent : "transparent", fontWeight: view === v ? 650 : 500 }}>
                {v === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
        )}

        <label style={S.authLabel}>Email</label>
        <div style={S.inputWrap}>
          <Mail size={15} color={C.textLo} />
          <input className="flow-input flow-focus" style={S.authInput} value={email} type="email" autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>

        {view !== "forgot" ? (
          <>
            <label style={S.authLabel}>Password</label>
            <div style={S.inputWrap}>
              <KeyRound size={15} color={C.textLo} />
              <input className="flow-input flow-focus" style={S.authInput} value={password} type={show ? "text" : "password"}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button className="flow-focus" style={S.eyeBtn} onClick={() => setShow((s) => !s)} aria-label="Toggle password">
                {show ? <EyeOff size={15} color={C.textLo} /> : <Eye size={15} color={C.textLo} />}
              </button>
            </div>
          </>
        ) : (
          <div style={S.demoNote}>Enter your email above and we'll send you a reset link.</div>
        )}

        {err && <div style={S.authErr}>{err}</div>}
        {done && <div style={S.authOk}>{done}</div>}

        <button className="flow-press flow-focus" style={S.authPrimary} onClick={submit}>
          {view === "login" ? "Log in" : view === "signup" ? "Create account" : "Send reset link"}
        </button>

        <div style={S.authFoot}>
          {view === "login" && <button className="flow-focus" style={S.linkBtn} onClick={() => { setView("forgot"); setErr(""); setDone(""); }}>Forgot password?</button>}
          {view === "forgot" && <button className="flow-focus" style={S.linkBtn} onClick={() => { setView("login"); setErr(""); setDone(""); }}>Back to log in</button>}
          {view === "signup" && <span style={{ color: C.textLo, fontSize: 12.5 }}>Free to start · upgrade anytime</span>}
        </div>
      </div>
      <div style={S.authLegal}>Accounts are real and saved securely via Supabase.</div>
    </div>
  );
}

/* ================================================================== */
/*  Main app                                                           */
/* ================================================================== */
function MainApp({ email, proState, tx, onLogOut, onStartTrial, onBuyLifetime, onOpenAdmin, onProLoad, onTxLoad }) {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [history, setHistory] = useState({});
  const [range, setRange] = useState("week");
  const [offset, setOffset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [saveState, setSaveState] = useState("saved");

  // Load from Supabase
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoaded(false);
      const { data } = await supabase.from("user_data").select("*").single();
      if (!alive) return;
      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
        setHistory(data.history || {});
        if (data.pro && Object.keys(data.pro).length) onProLoad(data.pro);
        if (data.tx && data.tx.length) onTxLoad(data.tx);
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [email]);

  // Save to Supabase on change
  const saveToSupabase = useCallback(async (newHistory, newSettings, newPro, newTx) => {
    setSaveState("saving");
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_data").upsert({
      user_id: user.id,
      history: newHistory,
      settings: newSettings,
      pro: newPro,
      tx: newTx,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaveState("saved");
  }, []);

  useEffect(() => { if (loaded) saveToSupabase(history, settings, proState, tx); }, [history, settings, proState, tx, loaded]);

  const recordFlow = useCallback((seconds) => {
    const k = todayKey(); const hr = new Date().getHours();
    setHistory((prev) => {
      const day = prev[k] || { flows: 0, focusSeconds: 0, hours: {} };
      const hours = { ...(day.hours || {}) }; hours[hr] = (hours[hr] || 0) + 1;
      return { ...prev, [k]: { flows: day.flows + 1, focusSeconds: day.focusSeconds + seconds, hours } };
    });
  }, []);

  const isPro = proState.isPro;
  const todayFlows = history[todayKey()]?.flows || 0;

  return (
    <div style={S.root}>
      <div style={S.window}>
        <TitleBar
          email={email} proState={proState} saveState={saveState}
          onUpgrade={() => setShowUpgrade(true)} onSettings={() => setShowSettings(true)}
          menuOpen={menuOpen} setMenuOpen={setMenuOpen} onLogOut={onLogOut}
          onOwner={() => { setMenuOpen(false); setAdminPrompt(true); }}
        />
        {!loaded ? (
          <div style={S.loading}><div className="flow-spin" style={S.spinner} /></div>
        ) : (
          <div style={S.body}>
            <StatsPanel history={history} range={range} offset={offset} isPro={isPro} onUpgrade={() => setShowUpgrade(true)} />
            <ChartPanel history={history} range={range} setRange={setRange} offset={offset} setOffset={setOffset} isPro={isPro} onUpgrade={() => setShowUpgrade(true)} />
            <TimerPanel settings={settings} recordFlow={recordFlow} todayFlows={todayFlows} />
          </div>
        )}
      </div>

      {showSettings && <SettingsModal settings={settings} setSettings={setSettings} setHistory={setHistory} onClose={() => setShowSettings(false)} />}
      {showUpgrade && <UpgradeModal proState={proState} onClose={() => setShowUpgrade(false)} onStartTrial={onStartTrial} onBuyLifetime={onBuyLifetime} />}
      {adminPrompt && <OwnerGate onClose={() => setAdminPrompt(false)} onPass={() => { setAdminPrompt(false); onOpenAdmin(); }} />}
    </div>
  );
}
const safeParse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch (_) { return fb; } };

/* ------------------------------------------------------------------ */
/*  Title bar                                                          */
/* ------------------------------------------------------------------ */
function TitleBar({ email, proState, saveState, onUpgrade, onSettings, menuOpen, setMenuOpen, onLogOut, onOwner }) {
  const initial = email.charAt(0).toUpperCase();
  return (
    <div style={S.titleBar}>
      <div style={S.brand}><span style={S.brandDot} />Bemonk</div>

      <div style={S.titleRight}>
        {proState.isPro ? (
          <div style={S.proBadge}>
            <Crown size={12} color={C.gold} />
            {proState.status === "trial" ? `Trial · ${proState.trialLeft}d left` : "Pro"}
          </div>
        ) : (
          <button className="flow-press flow-focus" style={S.unlockBtn} onClick={onUpgrade}>
            <Crown size={13} color={C.bg} /> Unlock Monk Pro
          </button>
        )}

        <div style={S.saveBadge} title="Saves automatically">
          {saveState === "saving" ? <><span className="flow-spin" style={S.miniSpin} /><span>Saving…</span></> : <><Check size={12} color={C.accent} /><span>Saved</span></>}
        </div>

        <button className="flow-press flow-focus" style={S.gearBtn} onClick={onSettings} aria-label="Settings"><SettingsIcon size={16} color={C.textMid} /></button>

        <div style={{ position: "relative" }}>
          <button className="flow-press flow-focus" style={S.avatarBtn} onClick={() => setMenuOpen((o) => !o)} aria-label="Account">
            <span style={S.avatarSm}>{initial}</span>
            <ChevronDown size={13} color={C.textMid} />
          </button>
          {menuOpen && (
            <>
              <div style={S.menuScrim} onClick={() => setMenuOpen(false)} />
              <div style={S.menu} className="flow-fade">
                <div style={S.menuEmail}>{email}</div>
                <div style={S.menuStatus}>{proState.isPro ? (proState.status === "trial" ? "Pro trial active" : "Lifetime Pro") : "Free plan"}</div>
                <div style={S.menuDiv} />
                <button className="flow-press flow-focus" style={S.menuItem} onClick={() => { setMenuOpen(false); onLogOut(); }}>
                  <LogOut size={15} color={C.textMid} /> Log out
                </button>
                <button className="flow-press flow-focus" style={{ ...S.menuItem, color: C.textLo }} onClick={onOwner} title="Owner only">
                  <KeyRound size={15} color={C.textLo} /> Owner access
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Left — Stats (locked for free users)                               */
/* ================================================================== */
function StatsPanel({ history, range, offset, isPro, onUpgrade }) {
  const data = useMemo(() => buildRange(history, range, offset), [history, range, offset]);
  const streak = useMemo(() => currentStreak(history), [history]);
  const lifetime = useMemo(() => { let f = 0, s = 0; Object.values(history).forEach((d) => { f += d.flows; s += d.focusSeconds; }); return { f, s }; }, [history]);
  const rangeWord = { day: "today", week: "this week", month: "this month", year: "this year" }[range];

  return (
    <aside style={S.leftPanel}>
      <div style={{ filter: isPro ? "none" : "blur(7px)", pointerEvents: isPro ? "auto" : "none", userSelect: isPro ? "auto" : "none", flex: 1, display: "flex", flexDirection: "column" }} aria-hidden={!isPro}>
        <div style={S.panelLabel}>Statistics</div>
        <div style={S.bigStat}>
          <div style={S.bigStatValue}>{data.totalFlows}</div>
          <div style={S.bigStatLabel}>flows {offset === 0 ? rangeWord : data.periodLabel.toLowerCase()}</div>
        </div>
        <StatLine icon={<Clock size={14} color={C.textMid} />} label="Focus time" value={fmtDuration(data.totalFocus)} />
        <StatLine icon={<Sparkles size={14} color={C.textMid} />} label={data.avgLabel} value={data.avgValue} />
        <div style={S.divider} />
        <div style={S.panelLabel}>All time</div>
        <StatLine icon={<Flame size={14} color={streak > 0 ? "#F2A65A" : C.textMid} />} label="Day streak" value={streak} valueColor={streak > 0 ? C.accent : C.textHi} />
        <StatLine icon={<Trophy size={14} color={C.textMid} />} label="Total flows" value={lifetime.f} />
        <StatLine icon={<Clock size={14} color={C.textMid} />} label="Total focus" value={fmtDuration(lifetime.s)} />
      </div>

      {!isPro && (
        <div style={S.lockWrap}>
          <div style={S.lockBadge}><Lock size={18} color={C.accent} /></div>
          <div style={{ fontWeight: 650, color: C.textHi, fontSize: 14 }}>Your stats, unlocked with Pro</div>
          <div style={{ color: C.textMid, fontSize: 12.5, marginTop: 4, lineHeight: 1.5, padding: "0 10px" }}>
            Weekly focus, averages, streaks and lifetime totals are part of Monk Pro.
          </div>
          <button className="flow-press flow-focus" style={S.lockBtn} onClick={onUpgrade}><Crown size={13} color={C.bg} /> Unlock Monk Pro</button>
        </div>
      )}
    </aside>
  );
}
function StatLine({ icon, label, value, valueColor }) {
  return (
    <div style={S.statLine}>
      <div style={S.statLineLabel}>{icon} {label}</div>
      <div style={{ ...S.statLineValue, color: valueColor || C.textHi }}>{value}</div>
    </div>
  );
}

/* ================================================================== */
/*  Center — Chart (Month/Year locked for free users)                  */
/* ================================================================== */
const RANGES = [
  { key: "day", label: "Day", pro: false },
  { key: "week", label: "Week", pro: false },
  { key: "month", label: "Month", pro: true },
  { key: "year", label: "Year", pro: true },
];

function ChartPanel({ history, range, setRange, offset, setOffset, isPro, onUpgrade }) {
  const data = useMemo(() => buildRange(history, range, offset), [history, range, offset]);
  const rangeLocked = !isPro && RANGES.find((r) => r.key === range)?.pro;

  return (
    <section style={S.centerPanel}>
      <div style={S.chartHead}>
        <div style={S.segment}>
          {RANGES.map((r) => {
            const locked = !isPro && r.pro;
            return (
              <button key={r.key} className="flow-press flow-focus" onClick={() => { setRange(r.key); setOffset(0); }}
                style={{ ...S.segBtn, color: range === r.key ? C.bg : C.textMid, background: range === r.key ? C.accent : "transparent", fontWeight: range === r.key ? 650 : 500, display: "flex", alignItems: "center", gap: 5 }}>
                {r.label}{locked && <Lock size={11} color={range === r.key ? C.bg : C.textLo} />}
              </button>
            );
          })}
        </div>
        <div style={S.periodNav}>
          <button className="flow-press flow-focus" style={S.navArrow} onClick={() => setOffset((o) => o + 1)} aria-label="Previous"><ChevronLeft size={18} color={C.textMid} /></button>
          <span style={S.periodLabel}>{data.periodLabel}</span>
          <button className="flow-press flow-focus" style={{ ...S.navArrow, opacity: offset === 0 ? 0.3 : 1, pointerEvents: offset === 0 ? "none" : "auto" }} onClick={() => setOffset((o) => Math.max(0, o - 1))} aria-label="Next"><ChevronRight size={18} color={C.textMid} /></button>
        </div>
      </div>

      <div style={S.chartSummary}>
        <span style={{ color: C.accent, fontWeight: 700 }}>{data.totalFlows} flows</span>
        <span style={{ color: C.textLo }}>·</span>
        <span style={{ color: C.textMid }}>{fmtDuration(data.totalFocus)} focused</span>
      </div>

      <div style={{ ...S.chartArea, position: "relative" }}>
        {rangeLocked ? (
          <div style={S.chartLock}>
            <div style={S.lockBadge}><Lock size={20} color={C.accent} /></div>
            <div style={{ fontWeight: 650, color: C.textHi, marginTop: 12, fontSize: 15 }}>
              {range === "month" ? "Monthly" : "Yearly"} view is a Pro feature
            </div>
            <div style={{ color: C.textMid, fontSize: 13, marginTop: 5 }}>Day and Week are free. Unlock the long view with Pro.</div>
            <button className="flow-press flow-focus" style={{ ...S.lockBtn, marginTop: 16 }} onClick={onUpgrade}><Crown size={13} color={C.bg} /> Unlock Monk Pro</button>
          </div>
        ) : data.hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bars} margin={{ top: 10, right: 8, left: -16, bottom: 0 }} barCategoryGap={range === "month" ? "10%" : "24%"}>
              <XAxis dataKey="label" tick={{ fill: C.textLo, fontSize: 11 }} axisLine={false} tickLine={false} interval={range === "month" ? 2 : range === "day" ? 2 : 0} />
              <YAxis tick={{ fill: C.textLo, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={range === "month" ? 16 : 44}>
                {data.bars.map((b, i) => <Cell key={i} fill={b.value > 0 ? C.accent : C.elevated} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={S.emptyChart}>
            <div style={S.emptyRing} />
            <div style={{ fontWeight: 600, color: C.textHi, marginTop: 14 }}>No flows in this period</div>
            <div style={{ color: C.textMid, fontSize: 13, marginTop: 4 }}>Start the timer on the right — your bars appear here.</div>
          </div>
        )}
      </div>
    </section>
  );
}
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return <div style={S.tip}><div style={{ color: C.textMid, fontSize: 11 }}>{label}</div><div style={{ color: C.textHi, fontWeight: 650, fontSize: 14 }}>{v} {v === 1 ? "flow" : "flows"}</div></div>;
}

/* ================================================================== */
/*  Right — Timer (PAUSE BUG FIXED)                                    */
/* ================================================================== */
function TimerPanel({ settings, recordFlow, todayFlows }) {
  const durationFor = useCallback(
    (m) => (m === "focus" ? settings.focusMin : m === "short" ? settings.shortMin : settings.longMin) * 60,
    [settings.focusMin, settings.shortMin, settings.longMin]
  );
  const [mode, setMode] = useState("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(() => settings.focusMin * 60);
  const [cycle, setCycle] = useState(0);
  const [pulse, setPulse] = useState(false);

  const endRef = useRef(0);
  const completeRef = useRef(() => {});
  const runningRef = useRef(running); runningRef.current = running;
  const modeRef = useRef(mode); modeRef.current = mode;

  const total = durationFor(mode);

  // Only re-sync remaining when the *durations* change while idle.
  // Crucially NOT keyed on `running`, so pausing never resets the clock.
  const durKey = `${settings.focusMin}-${settings.shortMin}-${settings.longMin}`;
  useEffect(() => {
    if (!runningRef.current) setRemaining(durationFor(modeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durKey]);

  const advance = useCallback((from) => {
    if (from === "focus") {
      const c = cycle + 1; setCycle(c);
      return c % settings.longEvery === 0 ? "long" : "short";
    }
    return "focus";
  }, [cycle, settings.longEvery]);

  useEffect(() => {
    completeRef.current = () => {
      if (settings.soundOn) playChime();
      if (mode === "focus") { recordFlow(durationFor("focus")); setPulse(true); setTimeout(() => setPulse(false), 900); }
      const next = advance(mode);
      setMode(next);
      const len = durationFor(next);
      if (settings.autoStart) { endRef.current = Date.now() + len * 1000; setRemaining(len); setRunning(true); }
      else { setRemaining(len); setRunning(false); }
    };
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { clearInterval(id); completeRef.current(); }
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  const selectMode = (m) => { setRunning(false); setMode(m); setRemaining(durationFor(m)); };
  const start = () => { endRef.current = Date.now() + remaining * 1000; setRunning(true); };
  const pause = () => setRunning(false);                       // ← holds remaining, no reset
  const reset = () => { setRunning(false); setRemaining(durationFor(mode)); };
  const skip = () => { setRunning(false); const n = advance(mode); setMode(n); setRemaining(durationFor(n)); };

  const frac = total > 0 ? remaining / total : 0;
  const accent = mode === "focus" ? C.accent : "#5BC8E8";
  const accentDeep = mode === "focus" ? C.accentDeep : "#2E7E97";
  const flowsToLong = settings.longEvery - (cycle % settings.longEvery);

  return (
    <aside style={S.rightPanel}>
      <div style={S.modeRow}>
        {Object.entries(MODES).map(([k, m]) => (
          <button key={k} className="flow-press flow-focus" onClick={() => selectMode(k)}
            style={{ ...S.modePill, color: mode === k ? C.bg : C.textMid, background: mode === k ? accent : "transparent", fontWeight: mode === k ? 650 : 500 }}>
            {m.label.split(" ")[0]}
          </button>
        ))}
      </div>

      <div style={S.ringHolder}>
        <Ring frac={frac} accent={accent} accentDeep={accentDeep} running={running} pulse={pulse} size={224}>
          <div style={S.ringTime}>{fmtClock(remaining)}</div>
          <div style={S.ringMode}>{MODES[mode].label}</div>
        </Ring>
      </div>

      <div style={S.beadRow}>
        {Array.from({ length: settings.longEvery }).map((_, i) => {
          const filled = (cycle % settings.longEvery) > i;
          return <span key={i} style={{ ...S.bead, background: filled ? accent : C.lineStrong, boxShadow: filled ? `0 0 10px ${C.accentGlow}` : "none" }} />;
        })}
      </div>
      {mode === "focus" && (
        <div style={S.toLong}>{flowsToLong === settings.longEvery ? `${settings.longEvery} flows to a long break` : `${flowsToLong} ${flowsToLong === 1 ? "flow" : "flows"} to long break`}</div>
      )}

      <div style={S.controls}>
        <IconBtn onClick={reset} aria="Reset"><RotateCcw size={18} /></IconBtn>
        <button className="flow-press flow-focus" style={{ ...S.bigBtn, background: accent, boxShadow: `0 12px 36px ${mode === "focus" ? C.accentGlow : "rgba(91,200,232,0.22)"}` }} onClick={running ? pause : start} aria-label={running ? "Pause" : "Start"}>
          {running ? <Pause size={26} fill={C.bg} color={C.bg} /> : <Play size={26} fill={C.bg} color={C.bg} style={{ marginLeft: 3 }} />}
        </button>
        <IconBtn onClick={skip} aria="Skip"><SkipForward size={18} /></IconBtn>
      </div>

      <div style={S.todayRow}>
        <Sparkles size={13} color={C.accent} />
        <span style={{ color: C.textHi, fontWeight: 650 }}>{todayFlows}</span>
        <span style={{ color: C.textMid }}>{todayFlows === 1 ? "flow" : "flows"} today</span>
      </div>
    </aside>
  );
}

function Ring({ frac, accent, accentDeep, running, pulse, size = 224, children }) {
  const stroke = 13, r = (size - stroke) / 2, cx = size / 2, Ccirc = 2 * Math.PI * r;
  const offset = Ccirc * (1 - frac);
  const gid = useMemo(() => "g" + Math.random().toString(36).slice(2, 7), []);
  return (
    <div className={pulse ? "flow-pulse" : running ? "flow-breathe" : ""} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={accentDeep} /><stop offset="100%" stopColor={accent} /></linearGradient></defs>
        <circle cx={cx} cy={cx} r={r} stroke={C.elevated} strokeWidth={stroke} fill="none" />
        <circle cx={cx} cy={cx} r={r} stroke={`url(#${gid})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={Ccirc} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.3s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>{children}</div>
    </div>
  );
}
function IconBtn({ children, onClick, aria }) {
  return <button className="flow-press flow-focus" style={S.iconBtn} onClick={onClick} aria-label={aria}>{React.cloneElement(children, { color: C.textMid })}</button>;
}

/* ================================================================== */
/*  Upgrade modal (trial + $7 lifetime) — simulated checkout           */
/* ================================================================== */
function UpgradeModal({ proState, onClose, onStartTrial, onBuyLifetime }) {
  const [step, setStep] = useState("plans"); // plans | checkout
  const [plan, setPlan] = useState(null);    // 'trial' | 'lifetime'

  const choose = (p) => { setPlan(p); setStep("checkout"); };
  const confirm = () => { if (plan === "trial") onStartTrial(); else onBuyLifetime(); onClose(); };

  return (
    <div style={S.overlay} className="flow-fade" onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 680, fontSize: 16 }}><Crown size={17} color={C.gold} /> Monk Pro</span>
          <button className="flow-press flow-focus" style={S.closeBtn} onClick={onClose} aria-label="Close"><X size={16} color={C.textMid} /></button>
        </div>

        {step === "plans" ? (
          <>
            <div style={{ color: C.textMid, fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
              Unlock your full statistics panel plus the monthly and yearly views. One price, yours for life.
            </div>

            <button className="flow-press flow-focus" style={S.planCard} onClick={() => choose("trial")}>
              <div>
                <div style={{ fontWeight: 650, color: C.textHi, fontSize: 15 }}>Start 3-day free trial</div>
                <div style={{ color: C.textMid, fontSize: 12.5, marginTop: 3 }}>Full Pro now · then ${PRICE} once</div>
              </div>
              <ChevronRight size={18} color={C.textMid} />
            </button>

            <button className="flow-press flow-focus" style={{ ...S.planCard, borderColor: C.accent, background: "rgba(61,220,151,0.06)" }} onClick={() => choose("lifetime")}>
              <div>
                <div style={{ fontWeight: 650, color: C.textHi, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                  Lifetime access <span style={S.bestTag}>BEST VALUE</span>
                </div>
                <div style={{ color: C.textMid, fontSize: 12.5, marginTop: 3 }}>${PRICE} once · yours forever, no subscription</div>
              </div>
              <ChevronRight size={18} color={C.accent} />
            </button>

            <div style={S.demoNote}>Prototype — no real charge happens. The live app uses Stripe’s secure checkout for payment.</div>
          </>
        ) : (
          <>
            <button className="flow-focus" style={{ ...S.linkBtn, marginBottom: 12 }} onClick={() => setStep("plans")}>← Back</button>
            <div style={S.checkoutSummary}>
              <span style={{ color: C.textHi, fontWeight: 600 }}>{plan === "trial" ? "3-day free trial" : "Lifetime access"}</span>
              <span style={{ color: C.accent, fontWeight: 700, fontSize: 18 }}>{plan === "trial" ? "$0.00 today" : `$${PRICE}.00`}</span>
            </div>
            {plan === "trial" && <div style={{ color: C.textMid, fontSize: 12.5, marginBottom: 14 }}>You won’t be charged today. After {TRIAL_DAYS} days it’s a one-time ${PRICE}.</div>}

            <div style={S.fakeCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.textMid, fontSize: 12, marginBottom: 10 }}>
                <ShieldCheck size={14} color={C.accent} /> Secure checkout (demo preview)
              </div>
              <div style={S.fakeField}>Card number — handled by Stripe in the live app</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ ...S.fakeField, flex: 1 }}>MM / YY</div>
                <div style={{ ...S.fakeField, flex: 1 }}>CVC</div>
              </div>
            </div>

            <div style={S.demoNote}>Do not enter a real card. This is a simulation — pressing the button below just unlocks Pro so you can test it.</div>

            <button className="flow-press flow-focus" style={S.authPrimary} onClick={confirm}>
              {plan === "trial" ? "Start free trial" : `Pay $${PRICE} & unlock`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Owner gate + dashboard                                             */
/* ================================================================== */
function OwnerGate({ onClose, onPass }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = () => { if (pw === OWNER_PASSWORD) onPass(); else setErr("Incorrect password."); };
  return (
    <div style={S.overlay} className="flow-fade" onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 680, fontSize: 16 }}><KeyRound size={16} color={C.accent} /> Owner access</span>
          <button className="flow-press flow-focus" style={S.closeBtn} onClick={onClose} aria-label="Close"><X size={16} color={C.textMid} /></button>
        </div>
        <div style={{ color: C.textMid, fontSize: 13, marginBottom: 14 }}>Enter the owner password to view revenue.</div>
        <input className="flow-input flow-focus" type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Password" style={S.input} />
        {err && <div style={S.authErr}>{err}</div>}
        <button className="flow-press flow-focus" style={{ ...S.authPrimary, marginTop: 14 }} onClick={submit}>Unlock dashboard</button>
      </div>
    </div>
  );
}

function AdminDashboard({ proMap, tx, onClose }) {
  const lifetimeTx = tx.filter((t) => t.type === "lifetime");
  const revenue = lifetimeTx.reduce((s, t) => s + t.amount, 0);
  const isPro = proMap?.status === "lifetime";
  const isTrial = proMap?.status === "trial";
  const signups = tx.filter((t) => t.type === "signup");

  return (
    <div style={S.overlay} className="flow-fade" onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 17 }}><DollarSign size={18} color={C.accent} /> Owner dashboard</span>
          <button className="flow-press flow-focus" style={S.closeBtn} onClick={onClose} aria-label="Close"><X size={16} color={C.textMid} /></button>
        </div>

        <div style={S.adminGrid}>
          <AdminTile label="Revenue" value={`$${revenue.toFixed(2)}`} accent />
          <AdminTile label="Sign-ups" value={signups.length} />
          <AdminTile label="Lifetime member" value={isPro ? "Yes" : "No"} />
          <AdminTile label="Trial active" value={isTrial ? "Yes" : "No"} />
        </div>

        <div style={S.payoutCard}>
          <div>
            <div style={{ color: C.textMid, fontSize: 12 }}>Available to withdraw</div>
            <div style={{ color: C.textHi, fontWeight: 700, fontSize: 22 }}>${revenue.toFixed(2)}</div>
          </div>
          <button className="flow-press flow-focus" style={S.payoutBtn} onClick={() => alert("In the live app, Stripe deposits this to your bank automatically (about 2 days after each sale). No manual claim needed — I’ll connect your bank during setup.")}>
            Withdraw to bank
          </button>
        </div>

        <div style={S.adminSection}>Recent sign-ups → notify {OWNER_EMAIL}</div>
        <div style={S.adminList}>
          {signups.length === 0 ? <div style={S.adminEmpty}>No sign-ups yet.</div> :
            signups.slice(0, 8).map((s, i) => (
              <div key={i} style={S.adminRow}><span style={{ color: C.textHi }}>{s.email}</span><span style={{ color: C.textLo, fontSize: 12 }}>{fmtDate(s.ts)}</span></div>
            ))}
        </div>

        <div style={S.adminSection}>Payments</div>
        <div style={S.adminList}>
          {lifetimeTx.length === 0 ? <div style={S.adminEmpty}>No payments yet.</div> :
            lifetimeTx.slice(0, 8).map((t, i) => (
              <div key={i} style={S.adminRow}><span style={{ color: C.textHi }}>{t.email}</span><span style={{ color: C.accent, fontWeight: 600 }}>+${t.amount.toFixed(2)}</span></div>
            ))}
        </div>

        <div style={S.demoNote}>Prototype figures from test activity on this device. Connected to Stripe, this shows your real revenue, customers and payouts.</div>
      </div>
    </div>
  );
}
function AdminTile({ label, value, accent }) {
  return <div style={S.adminTile}><div style={{ color: C.textMid, fontSize: 12 }}>{label}</div><div style={{ color: accent ? C.accent : C.textHi, fontWeight: 720, fontSize: 24, marginTop: 4 }}>{value}</div></div>;
}

/* ================================================================== */
/*  Settings modal                                                     */
/* ================================================================== */
function SettingsModal({ settings, setSettings, setHistory, onClose }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return (
    <div style={S.overlay} className="flow-fade" onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}><span style={{ fontWeight: 680, fontSize: 16 }}>Settings</span><button className="flow-press flow-focus" style={S.closeBtn} onClick={onClose} aria-label="Close"><X size={16} color={C.textMid} /></button></div>
        <div style={S.modalSection}>Display name</div>
        <input className="flow-input flow-focus" value={settings.name} maxLength={20} onChange={(e) => set({ name: e.target.value })} placeholder="Shown on the leaderboard" style={S.input} />
        <div style={S.modalSection}>Durations</div>
        <div style={S.sectionBody}>
          <Stepper label="Focus" suffix="min" value={settings.focusMin} min={1} max={90} onChange={(v) => set({ focusMin: v })} />
          <Stepper label="Short break" suffix="min" value={settings.shortMin} min={1} max={30} onChange={(v) => set({ shortMin: v })} />
          <Stepper label="Long break" suffix="min" value={settings.longMin} min={5} max={60} step={5} onChange={(v) => set({ longMin: v })} />
          <Stepper label="Long break every" suffix="flows" value={settings.longEvery} min={2} max={8} onChange={(v) => set({ longEvery: v })} last />
        </div>
        <div style={S.modalSection}>Behaviour</div>
        <div style={S.sectionBody}>
          <Toggle label="Auto-start next session" on={settings.autoStart} onChange={(v) => set({ autoStart: v })} />
          <Toggle label="Completion chime" icon={settings.soundOn ? <Volume2 size={15} color={C.textMid} /> : <VolumeX size={15} color={C.textMid} />} on={settings.soundOn} onChange={(v) => set({ soundOn: v })} last />
        </div>
        <div style={S.modalSection}>Data</div>
        {!confirmReset ? (
          <button className="flow-press flow-focus" style={S.dangerBtn} onClick={() => setConfirmReset(true)}>Reset my flow data</button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="flow-press flow-focus" style={{ ...S.dangerBtn, flex: 1, background: C.danger, color: C.bg, borderColor: C.danger }} onClick={() => { setHistory({}); setConfirmReset(false); }}>Erase everything</button>
            <button className="flow-press flow-focus" style={{ ...S.dangerBtn, flex: 1 }} onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        )}
        <div style={S.modalNote}>Everything saves automatically — there’s no save button to forget.</div>
      </div>
    </div>
  );
}
function Stepper({ label, value, onChange, min, max, step = 1, suffix, last }) {
  const smartStep = (current, direction) => {
    if (suffix === "min") {
      if (direction === 1) {
        if (current < 5) return Math.min(current + 1, 5);
        return Math.min(current + 5, max);
      } else {
        if (current <= 5) return Math.max(current - 1, min);
        return Math.max(current - 5, 5);
      }
    }
    return direction === 1 ? Math.min(current + step, max) : Math.max(current - step, min);
  };
  return (
    <div style={{ ...S.rowItem, borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <span style={{ color: C.textHi, fontSize: 14 }}>{label}</span>
      <div style={S.stepper}>
        <button className="flow-press flow-focus" style={S.stepBtn} onClick={() => onChange(smartStep(value, -1))} aria-label={`Decrease ${label}`}><Minus size={14} color={C.textHi} /></button>
        <span style={S.stepVal}>{value}<span style={{ color: C.textLo, fontSize: 11, marginLeft: 3, fontWeight: 500 }}>{suffix}</span></span>
        <button className="flow-press flow-focus" style={S.stepBtn} onClick={() => onChange(smartStep(value, 1))} aria-label={`Increase ${label}`}><Plus size={14} color={C.textHi} /></button>
      </div>
    </div>
  );
}
function Toggle({ label, on, onChange, icon, last }) {
  return (
    <div style={{ ...S.rowItem, borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <span style={{ color: C.textHi, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>{icon}{label}</span>
      <button className="flow-press flow-focus" onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={label} style={{ ...S.switch, background: on ? C.accent : C.elevated, justifyContent: on ? "flex-end" : "flex-start" }}><span style={S.knob} /></button>
    </div>
  );
}

/* ================================================================== */
/*  Data builders                                                      */
/* ================================================================== */
const getDay = (h, k) => h[k] || { flows: 0, focusSeconds: 0, hours: {} };
function buildRange(history, range, offset) {
  const now = new Date();
  if (range === "day") {
    const d = addDays(now, -offset); const day = getDay(history, dayKey(d));
    const bars = Array.from({ length: 24 }, (_, h) => ({ label: h % 12 === 0 ? (h === 0 ? "12a" : "12p") : `${h % 12}${h < 12 ? "a" : "p"}`, value: day.hours?.[h] || 0 }));
    const best = bars.reduce((m, b) => (b.value > m.value ? b : m), { value: 0, label: "—" });
    return { bars, periodLabel: offset === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), totalFlows: day.flows, totalFocus: day.focusSeconds, avgLabel: "Peak hour", avgValue: best.value > 0 ? best.label : "—", hasData: day.flows > 0 };
  }
  if (range === "week") {
    const start = addDays(mondayOf(now), -offset * 7); let tf = 0, tfocus = 0;
    const bars = DOW.map((lbl, i) => { const day = getDay(history, dayKey(addDays(start, i))); tf += day.flows; tfocus += day.focusSeconds; return { label: lbl, value: day.flows }; });
    const end = addDays(start, 6); const sameMonth = start.getMonth() === end.getMonth();
    const periodLabel = offset === 0 ? "This week" : `${MON[start.getMonth()]} ${start.getDate()} – ${sameMonth ? "" : MON[end.getMonth()] + " "}${end.getDate()}`;
    return { bars, periodLabel, totalFlows: tf, totalFocus: tfocus, avgLabel: "Avg / day", avgValue: (tf / 7).toFixed(1), hasData: tf > 0 };
  }
  if (range === "month") {
    const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const daysIn = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); let tf = 0, tfocus = 0;
    const bars = Array.from({ length: daysIn }, (_, i) => { const day = getDay(history, dayKey(new Date(base.getFullYear(), base.getMonth(), i + 1))); tf += day.flows; tfocus += day.focusSeconds; return { label: String(i + 1), value: day.flows }; });
    const active = bars.filter((b) => b.value > 0).length || 1;
    return { bars, periodLabel: `${MON[base.getMonth()]} ${base.getFullYear()}`, totalFlows: tf, totalFocus: tfocus, avgLabel: "Avg / active day", avgValue: (tf / active).toFixed(1), hasData: tf > 0 };
  }
  const year = now.getFullYear() - offset; let tf = 0, tfocus = 0;
  const bars = MON.map((lbl, m) => { let mf = 0, mfocus = 0; const daysIn = new Date(year, m + 1, 0).getDate(); for (let i = 1; i <= daysIn; i++) { const day = getDay(history, dayKey(new Date(year, m, i))); mf += day.flows; mfocus += day.focusSeconds; } tf += mf; tfocus += mfocus; return { label: lbl.slice(0, 1), value: mf }; });
  return { bars, periodLabel: String(year), totalFlows: tf, totalFocus: tfocus, avgLabel: "Avg / month", avgValue: (tf / 12).toFixed(1), hasData: tf > 0 };
}
function currentStreak(history) { let n = 0, d = new Date(); if (!(history[dayKey(d)]?.flows > 0)) d = addDays(d, -1); while (history[dayKey(d)]?.flows > 0) { n++; d = addDays(d, -1); } return n; }

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */
const S = {
  bootRoot: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg },
  appRoot: { minHeight: "100vh", width: "100%", fontFamily: FONT, color: C.textHi },

  /* auth */
  authRoot: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(140deg, #060A08 0%, #0A1310 60%, #0B1A14 100%)", padding: 20, boxSizing: "border-box" },
  authCard: { width: "100%", maxWidth: 380, background: C.win, border: `1px solid ${C.lineStrong}`, borderRadius: 20, padding: 28, boxShadow: "0 40px 120px rgba(0,0,0,0.55)" },
  authBrand: { display: "flex", alignItems: "center", gap: 9, marginBottom: 18 },
  brandDotLg: { width: 11, height: 11, borderRadius: "50%", background: C.accent, boxShadow: `0 0 12px ${C.accentGlow}` },
  authTitle: { fontSize: 21, fontWeight: 720, letterSpacing: "-0.02em", color: C.textHi },
  authSub: { fontSize: 13.5, color: C.textMid, marginTop: 4, marginBottom: 18 },
  authTabs: { display: "flex", gap: 4, background: C.bg, border: `1px solid ${C.line}`, padding: 4, borderRadius: 12, marginBottom: 18 },
  authTab: { flex: 1, border: "none", borderRadius: 9, padding: "9px 0", fontSize: 13, cursor: "pointer", fontFamily: FONT, transition: "all .2s" },
  authLabel: { fontSize: 12, color: C.textMid, fontWeight: 600, margin: "12px 0 7px 2px", display: "block" },
  inputWrap: { display: "flex", alignItems: "center", gap: 9, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "0 12px" },
  authInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: C.textHi, fontSize: 14.5, fontFamily: FONT, padding: "12px 0" },
  eyeBtn: { background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 4 },
  authErr: { color: C.danger, fontSize: 12.5, marginTop: 12, background: "rgba(242,105,107,0.08)", border: "1px solid rgba(242,105,107,0.2)", padding: "9px 12px", borderRadius: 10 },
  authOk: { color: C.accent, fontSize: 12.5, marginTop: 12, background: "rgba(61,220,151,0.08)", border: "1px solid rgba(61,220,151,0.2)", padding: "9px 12px", borderRadius: 10 },
  authPrimary: { width: "100%", marginTop: 18, background: C.accent, color: C.bg, border: "none", borderRadius: 12, padding: "13px 0", fontSize: 14.5, fontWeight: 680, cursor: "pointer", fontFamily: FONT },
  authFoot: { marginTop: 14, display: "flex", justifyContent: "center" },
  linkBtn: { background: "transparent", border: "none", color: C.accent, fontSize: 12.5, cursor: "pointer", fontFamily: FONT, fontWeight: 600, padding: 4 },
  authLegal: { marginTop: 18, fontSize: 11.5, color: C.textLo, textAlign: "center", maxWidth: 360 },
  demoNote: { fontSize: 11.5, color: C.textLo, lineHeight: 1.5, marginTop: 12, background: C.surface, border: `1px dashed ${C.lineStrong}`, borderRadius: 10, padding: "9px 11px" },

  /* window */
  root: { minHeight: "100vh", width: "100%", display: "flex", background: C.bg, boxSizing: "border-box" },
  window: { width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: C.win, overflow: "hidden" },
  titleBar: { height: 52, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,0.015)", gap: 14, flexShrink: 0 },
  lights: { display: "flex", gap: 8 },
  light: { width: 12, height: 12, borderRadius: "50%" },
  brand: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 680, letterSpacing: "-0.01em" },
  brandDot: { width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accentGlow}` },
  titleRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 },
  unlockBtn: { display: "flex", alignItems: "center", gap: 6, background: C.accent, color: C.bg, border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 680, cursor: "pointer", fontFamily: FONT },
  proBadge: { display: "flex", alignItems: "center", gap: 6, background: "rgba(240,194,110,0.1)", border: "1px solid rgba(240,194,110,0.3)", color: C.gold, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600 },
  saveBadge: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.textMid, background: C.surface, border: `1px solid ${C.line}`, padding: "5px 10px", borderRadius: 999 },
  miniSpin: { width: 11, height: 11, border: `1.5px solid ${C.elevated}`, borderTopColor: C.accent, borderRadius: "50%" },
  gearBtn: { width: 30, height: 30, borderRadius: 8, background: "transparent", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  avatarBtn: { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 8px 4px 4px", cursor: "pointer" },
  avatarSm: { width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accentDeep}, ${C.accent})`, color: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 },
  menuScrim: { position: "fixed", inset: 0, zIndex: 30 },
  menu: { position: "absolute", top: 38, right: 0, width: 220, background: C.elevated, border: `1px solid ${C.lineStrong}`, borderRadius: 14, padding: 8, zIndex: 31, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" },
  menuEmail: { fontSize: 12.5, color: C.textHi, fontWeight: 600, padding: "6px 8px 0", wordBreak: "break-all" },
  menuStatus: { fontSize: 11.5, color: C.textMid, padding: "2px 8px 6px" },
  menuDiv: { height: 1, background: C.line, margin: "6px 0" },
  menuItem: { width: "100%", display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none", color: C.textHi, fontSize: 13.5, padding: "9px 8px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, textAlign: "left" },

  loading: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  spinner: { width: 28, height: 28, border: `2.5px solid ${C.elevated}`, borderTopColor: C.accent, borderRadius: "50%" },
  body: { flex: 1, display: "grid", gridTemplateColumns: "300px 1fr 340px", gap: 20, padding: 20, minHeight: 0 },

  leftPanel: { position: "relative", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", overflow: "hidden" },
  panelLabel: { fontSize: 11, fontWeight: 600, color: C.textLo, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 },
  bigStat: { marginBottom: 18 },
  bigStatValue: { fontSize: 46, fontWeight: 720, color: C.accent, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  bigStatLabel: { fontSize: 13, color: C.textMid, marginTop: 6 },
  statLine: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" },
  statLineLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.textMid },
  statLineValue: { fontSize: 15, fontWeight: 650, fontVariantNumeric: "tabular-nums" },
  divider: { height: 1, background: C.line, margin: "10px 0 18px" },
  lockWrap: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, background: "rgba(12,19,16,0.55)" },
  lockBadge: { width: 46, height: 46, borderRadius: 14, background: "rgba(61,220,151,0.1)", border: "1px solid rgba(61,220,151,0.25)", display: "flex", alignItems: "center", justifyContent: "center" },
  lockBtn: { marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, background: C.accent, color: C.bg, border: "none", borderRadius: 999, padding: "9px 16px", fontSize: 12.5, fontWeight: 680, cursor: "pointer", fontFamily: FONT },

  centerPanel: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minWidth: 0 },
  chartHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  segment: { display: "inline-flex", gap: 3, background: C.bg, border: `1px solid ${C.line}`, padding: 4, borderRadius: 12 },
  segBtn: { border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: FONT, transition: "all .2s" },
  periodNav: { display: "flex", alignItems: "center", gap: 8 },
  navArrow: { width: 32, height: 32, borderRadius: 9, background: C.bg, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  periodLabel: { fontSize: 13.5, fontWeight: 600, color: C.textHi, minWidth: 96, textAlign: "center" },
  chartSummary: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "16px 2px 4px" },
  chartArea: { flex: 1, minHeight: 0, marginTop: 8 },
  chartLock: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 30px" },
  emptyChart: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 30px" },
  emptyRing: { width: 56, height: 56, borderRadius: "50%", border: `4px solid ${C.elevated}`, borderTopColor: C.lineStrong },
  tip: { background: C.elevated, border: `1px solid ${C.lineStrong}`, borderRadius: 10, padding: "7px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },

  rightPanel: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", alignItems: "center" },
  modeRow: { display: "flex", gap: 3, background: C.bg, border: `1px solid ${C.line}`, padding: 4, borderRadius: 12, width: "100%", boxSizing: "border-box" },
  modePill: { flex: 1, border: "none", borderRadius: 9, padding: "8px 0", fontSize: 12, cursor: "pointer", fontFamily: FONT, transition: "all .2s" },
  ringHolder: { display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: "12px 0", minHeight: 0 },
  ringTime: { fontWeight: 300, fontSize: 50, letterSpacing: "-0.02em", color: C.textHi, fontVariantNumeric: "tabular-nums" },
  ringMode: { fontSize: 12.5, color: C.textMid, fontWeight: 500, marginTop: 4 },
  beadRow: { display: "flex", gap: 7, justifyContent: "center", marginBottom: 8 },
  bead: { width: 7, height: 7, borderRadius: "50%", transition: "all .3s" },
  toLong: { fontSize: 11.5, color: C.textLo, marginBottom: 16 },
  controls: { display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 16 },
  iconBtn: { width: 46, height: 46, borderRadius: "50%", background: C.bg, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  bigBtn: { width: 68, height: 68, borderRadius: "50%", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  todayRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: C.bg, border: `1px solid ${C.line}`, padding: "8px 14px", borderRadius: 999 },

  overlay: { position: "fixed", inset: 0, background: "rgba(4,7,6,0.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 },
  modal: { width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", background: C.win, border: `1px solid ${C.lineStrong}`, borderRadius: 18, padding: 22, boxShadow: "0 30px 90px rgba(0,0,0,0.6)" },
  modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  closeBtn: { width: 30, height: 30, borderRadius: 8, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  modalSection: { fontSize: 11, fontWeight: 600, color: C.textLo, textTransform: "uppercase", letterSpacing: "0.06em", margin: "16px 0 9px 2px" },
  sectionBody: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" },
  input: { width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", color: C.textHi, fontSize: 14, fontFamily: FONT, outline: "none" },
  rowItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px" },
  stepper: { display: "flex", alignItems: "center", gap: 11 },
  stepBtn: { width: 28, height: 28, borderRadius: 8, background: C.elevated, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  stepVal: { minWidth: 50, textAlign: "center", color: C.textHi, fontWeight: 650, fontSize: 14, fontVariantNumeric: "tabular-nums" },
  switch: { width: 44, height: 26, borderRadius: 999, border: "none", display: "flex", alignItems: "center", padding: 3, cursor: "pointer", transition: "background .2s" },
  knob: { width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" },
  dangerBtn: { width: "100%", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 11, padding: "12px 0", color: C.danger, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
  modalNote: { fontSize: 12, color: C.textMid, marginTop: 12, lineHeight: 1.5, textAlign: "center" },

  /* upgrade */
  planCard: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", textAlign: "left", fontFamily: FONT },
  bestTag: { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", color: C.bg, background: C.accent, padding: "2px 6px", borderRadius: 5 },
  checkoutSummary: { display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 },
  fakeCard: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 4 },
  fakeField: { background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px 12px", color: C.textLo, fontSize: 12.5, marginBottom: 8 },

  /* admin */
  adminGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 },
  adminTile: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" },
  payoutCard: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(61,220,151,0.06)", border: `1px solid rgba(61,220,151,0.22)`, borderRadius: 14, padding: "14px 16px", marginBottom: 6 },
  payoutBtn: { background: C.accent, color: C.bg, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 680, cursor: "pointer", fontFamily: FONT },
  adminSection: { fontSize: 11, fontWeight: 600, color: C.textLo, textTransform: "uppercase", letterSpacing: "0.06em", margin: "18px 0 8px 2px" },
  adminList: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" },
  adminRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 13.5 },
  adminEmpty: { padding: "16px", color: C.textLo, fontSize: 13, textAlign: "center" },
};

const CSS = `
* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
.flow-fade { animation: flowFade .3s ease both; }
@keyframes flowFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
.flow-spin { animation: flowSpin .8s linear infinite; }
@keyframes flowSpin { to { transform: rotate(360deg); } }
.flow-breathe { animation: flowBreathe 4s ease-in-out infinite; }
@keyframes flowBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
.flow-pulse { animation: flowPulse .9s ease; }
@keyframes flowPulse { 0% { transform: scale(1); } 30% { transform: scale(1.05); filter: drop-shadow(0 0 18px ${C.accentGlow}); } 100% { transform: scale(1); } }
.flow-press { transition: transform .12s ease, opacity .12s ease; }
.flow-press:active { transform: scale(0.95); opacity: 0.9; }
.flow-focus:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
.flow-input::placeholder { color: ${C.textLo}; }
*::-webkit-scrollbar { width: 7px; height: 7px; }
*::-webkit-scrollbar-thumb { background: ${C.elevated}; border-radius: 99px; }
@media (prefers-reduced-motion: reduce) { .flow-breathe,.flow-pulse,.flow-fade,.flow-spin { animation: none !important; } }
`;