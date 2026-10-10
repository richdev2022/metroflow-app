import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, Gift, Loader2, Wallet, XCircle } from "lucide-react";
import { validateReferralCode, formatReferralAmount } from "@/lib/referral-api";

/**
 * ReferralInvite — public landing for referral links (/r/CODE).
 *
 * Validates the code, shows the admin-configured bonus, then funnels the
 * visitor into /register?ref=CODE so the code rides the normal signup flow.
 */
export default function ReferralInvite() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("NGN");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await validateReferralCode(code);
        if (!alive) return;
        if (result.valid) {
          setAmount(result.amount);
          setCurrency(result.currency);
          setState("valid");
        } else {
          setState("invalid");
        }
      } catch {
        if (alive) setState("invalid");
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  const continueToSignup = () => navigate(`/register?ref=${encodeURIComponent(code.toUpperCase())}`);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0A0E1A] via-[#0d1330] to-[#1a1040] px-4 py-12">
      {/* glow blobs */}
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-blue-600/25 blur-[100px]" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-72 w-72 rounded-full bg-violet-600/25 blur-[100px]" />

      <div className="relative w-full max-w-md">
        {state === "checking" && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-10 text-white backdrop-blur">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <p className="text-sm text-blue-100">Checking your invite…</p>
          </div>
        )}

        {state === "invalid" && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white backdrop-blur">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
              <XCircle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Invite not found</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-blue-100/80">
                This referral link or code isn't valid anymore. You can still create a free
                Metricorex account and start your 7-day trial.
              </p>
            </div>
            <Link
              to="/register"
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110"
            >
              Create a free account
            </Link>
          </div>
        )}

        {state === "valid" && (
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 text-white shadow-2xl backdrop-blur">
            <div className="relative border-b border-white/10 bg-gradient-to-r from-blue-600/40 to-violet-600/40 p-8 text-center">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Gift className="h-7 w-7" />
              </div>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight">You've been invited!</h1>
              <p className="mt-2 text-sm leading-relaxed text-blue-100">
                Join Metricorex — operations, meetings, chat, payroll and MetricAi in one platform.
              </p>
            </div>

            <div className="space-y-5 p-8">
              {amount > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                    <Wallet className="h-5 w-5 text-emerald-400" />
                  </div>
                  <p className="text-sm leading-relaxed text-emerald-100">
                    Your referrer earns{" "}
                    <span className="font-bold">{formatReferralAmount(amount, currency)}</span> when
                    you subscribe to any plan — and you start with a{" "}
                    <span className="font-bold">7-day free trial</span>.
                  </p>
                </div>
              )}

              <div className="space-y-2.5 text-sm text-blue-100/90">
                {[
                  "All-in-one workspace: chat, meetings, tasks, payroll",
                  "Multi-currency wallets, transfers and payment links",
                  "MetricAi built into every surface",
                ].map((line) => (
                  <p key={line} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                    {line}
                  </p>
                ))}
              </div>

              <button
                onClick={continueToSignup}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.99]"
              >
                Continue with code <span className="font-mono tracking-widest">{code.toUpperCase()}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-blue-100/60">
                Code will be applied automatically on the signup page.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
