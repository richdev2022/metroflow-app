import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Check,
  Copy,
  Gift,
  Handshake,
  Loader2,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { getApiMessage } from "@/lib/api-response";
import {
  claimReferralCode,
  fetchReferralInfo,
  formatReferralAmount,
  type ReferralInfo,
  type ReferredUser,
} from "@/lib/referral-api";

const inputClass =
  "h-10 rounded-xl border-border/70 bg-background/70 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/60";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ user }: { user: ReferredUser }) {
  if (user.status === "paid") {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        Bonus paid
      </Badge>
    );
  }
  if (user.status === "subscribed") {
    return (
      <Badge className="border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
        Subscribed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Not subscribed yet
    </Badge>
  );
}

export default function Referrals() {
  const { toast } = useToast();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchReferralInfo();
      setInfo(data);
    } catch (err: any) {
      toast({
        title: "Couldn't load referrals",
        description: getApiMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const referralLink = info?.referralLink || "";

  const bonusText = info ? formatReferralAmount(info.config.amount, info.config.currency) : "";

  const copy = useCallback(
    async (value: string, kind: "code" | "link") => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1600);
        toast({ title: kind === "code" ? "Referral code copied" : "Referral link copied" });
      } catch {
        toast({
          title: "Copy failed",
          description: "Long-press to copy manually.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const share = useCallback(async () => {
    const text = `Join me on Metricorex — the all-in-one platform for business operations, payments and MetricAi. Use my referral link to get started: ${referralLink}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Metricorex — Refer & Earn", text, url: referralLink });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: "Invite copied", description: "Paste it anywhere to share." });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }, [referralLink, toast]);

  const handleClaim = useCallback(async () => {
    const code = claimCode.trim();
    if (!code) return;
    setClaiming(true);
    try {
      await claimReferralCode(code);
      toast({ title: "Referral code applied", description: "You're all set!" });
      setClaimCode("");
      await load();
    } catch (err: any) {
      toast({
        title: "Couldn't apply code",
        description: getApiMessage(err, "Check the code and try again."),
        variant: "destructive",
      });
    } finally {
      setClaiming(false);
    }
  }, [claimCode, load, toast]);

  // The claim box shows when the user has no referrer (backend flag on
  // /referrals/me).
  const hasReferredBy = info?.hasReferrer ?? null;

  const stats = info?.stats;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-16 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gift className="h-6 w-6 text-primary" /> Refer &amp; Earn
          </h1>
          <p className="text-sm text-muted-foreground">
            Share your referral link — when a business you referred subscribes to any plan, you earn{" "}
            <span className="font-semibold text-foreground">{bonusText || "a bonus"}</span> straight
            into your Metricorex wallet.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-3xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Code + link card */}
            <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 p-6 text-white shadow-lg shadow-blue-600/20 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-violet-400/20 blur-2xl" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">
                      Your referral code
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-3xl font-extrabold tracking-[0.18em] sm:text-4xl">
                        {info?.referralCode || "—"}
                      </span>
                      {info?.referralCode && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 rounded-full bg-white/15 text-white hover:bg-white/25"
                          onClick={() => copy(info.referralCode!, "code")}
                        >
                          {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          Copy
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="max-w-md">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">
                      Referral link
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg bg-white/10 px-3 py-2 text-sm">
                        {referralLink || "—"}
                      </code>
                      {referralLink && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9 shrink-0 rounded-full bg-white/15 text-white hover:bg-white/25"
                          aria-label="Copy referral link"
                          onClick={() => copy(referralLink, "link")}
                        >
                          {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      )}
                      {referralLink && typeof navigator !== "undefined" && "share" in navigator && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9 shrink-0 rounded-full bg-white/15 text-white hover:bg-white/25"
                          aria-label="Share referral link"
                          onClick={share}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{bonusText}</p>
                    <p className="mt-1 text-xs text-blue-100">
                      per referred business that subscribes
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">People referred</span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight">{stats?.totalReferred ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Signed up with your code or link</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Subscribed</span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight">{stats?.subscribed ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Activated a paid plan</p>
              </div>
              <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-5 shadow-sm backdrop-blur dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Total earned</span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {stats ? formatReferralAmount(stats.totalEarned, stats.earnedCurrency) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Credited to your Metricorex wallet</p>
              </div>
            </div>

            {/* Claim a code (users who signed up without one) */}
            {hasReferredBy === false && (
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Handshake className="h-4 w-4 text-primary" /> Have a referral code?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If someone referred you, enter their code here so they get credited when you subscribe.
                </p>
                <div className="mt-3 flex max-w-sm gap-2">
                  <Input
                    placeholder="e.g. K7M2PQ9X"
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                    className={inputClass}
                  />
                  <Button onClick={handleClaim} disabled={claiming || !claimCode.trim()}>
                    {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              </div>
            )}

            {/* Referred users */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <p className="text-sm font-semibold">Referred users</p>
                <Badge variant="secondary">{stats?.totalReferred ?? 0}</Badge>
              </div>
              {(info?.referred?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">No referrals yet</p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Share your referral link with friends and business owners. You'll see everyone
                    here, and earn {bonusText || "a bonus"} each time they subscribe to a plan.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {info!.referred.map((user) => (
                    <li key={user.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {user.name || user.email}
                          {user.name && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {user.email}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {user.businessName ? `${user.businessName} · ` : ""}Joined {formatDate(user.joinedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {user.status === "paid" && user.bonusAmount != null ? (
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatReferralAmount(user.bonusAmount, user.bonusCurrency || "NGN")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{bonusText} on subscribe</span>
                        )}
                        <StatusBadge user={user} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* How it works */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur sm:p-6">
              <p className="text-sm font-semibold">How it works</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: Share2,
                    title: "1. Share your link",
                    body: "Send your referral link or code to friends, clients and business owners.",
                  },
                  {
                    icon: Users,
                    title: "2. They sign up & subscribe",
                    body: "They create a workspace with your code and subscribe to any plan.",
                  },
                  {
                    icon: Wallet,
                    title: "3. You earn",
                    body: `Your ${bonusText || "bonus"} lands in your Metricorex wallet automatically.`,
                  },
                ].map((step) => (
                  <div key={step.title} className="rounded-xl border border-border/50 bg-background/60 p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <step.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
