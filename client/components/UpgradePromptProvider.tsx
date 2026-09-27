import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Check, ArrowRight, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/BrandLogo';

interface UpgradePromptContextType {
  showUpgradePrompt: (feature?: string) => void;
}

const UpgradePromptContext = createContext<UpgradePromptContextType | undefined>(undefined);

export const useUpgradePrompt = () => {
  const context = useContext(UpgradePromptContext);
  if (!context) {
    throw new Error('useUpgradePrompt must be used within an UpgradePromptProvider');
  }
  return context;
};

// Global reference so non-React modules (axios interceptor) can trigger the modal.
let globalShowUpgradePrompt: ((feature?: string) => void) | null = null;

export const setGlobalUpgradePromptHandler = (handler: (feature?: string) => void) => {
  globalShowUpgradePrompt = handler;
};

/**
 * Fire from anywhere (api interceptors, page handlers) to present the
 * plan-upgrade modal. Optionally pass the feature that was gated, e.g.
 * triggerUpgradePrompt("Payroll").
 */
export const triggerUpgradePrompt = (feature?: string) => {
  if (globalShowUpgradePrompt) {
    globalShowUpgradePrompt(feature);
  }
};

/** Matches the backend plan-gate response (server/middleware/auth.ts). */
export const isPlanUpgradeError = (data: any): boolean => {
  if (!data) return false;
  if (data.code === 'PLAN_UPGRADE_REQUIRED') return true;
  return (
    typeof data.error === 'string' &&
    data.error.toLowerCase().includes('upgrade your plan')
  );
};

interface UpgradePromptProviderProps {
  children: ReactNode;
}

const PLAN_BENEFITS = [
  'Unlimited access to every premium feature',
  'Advanced analytics and reporting tools',
  'Priority support from our team',
  'Cancel or change plans anytime',
];

export const UpgradePromptProvider: React.FC<UpgradePromptProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feature, setFeature] = useState<string | undefined>(undefined);
  const navigate = useNavigate();

  const showUpgradePrompt = useCallback((feat?: string) => {
    setFeature(feat);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    setGlobalUpgradePromptHandler(showUpgradePrompt);
    // Dev-only hook: lets us E2E the modal from the console.
    if (import.meta.env.DEV) {
      (window as any).__triggerUpgradePrompt = triggerUpgradePrompt;
    }
    return () => {
      setGlobalUpgradePromptHandler(null);
    };
  }, [showUpgradePrompt]);

  const handleUpgrade = useCallback(() => {
    setIsOpen(false);
    // Deep-link to the recommended tier: the Subscription page reads
    // ?plan= and highlights + scrolls to the matching plan card.
    navigate('/subscription?plan=pro');
  }, [navigate]);

  const handleLater = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <UpgradePromptContext.Provider value={{ showUpgradePrompt }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-3xl border-border/60 bg-background p-0 shadow-2xl shadow-blue-950/20 gap-0">
          {/* Gradient hero */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-6 pb-6 pt-7 text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-violet-300/25 blur-2xl"
            />
            <div className="relative flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                <BrandMark size={26} />
                MetriCorex
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Pro feature
              </span>
            </div>
            <div className="relative mt-5 flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
                <Crown className="h-7 w-7 text-amber-300" />
              </span>
              <div>
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-xl font-bold leading-tight text-white">
                    {feature ? `Unlock ${feature}` : 'Unlock the full power of MetriCorex'}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-blue-50/90">
                    This feature isn't part of your current plan. Upgrade to unlock it instantly.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-3 px-6 py-5">
            <ul className="space-y-2.5">
              {PLAN_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5 text-sm text-foreground/90">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="flex-col gap-2 px-6 pb-6 sm:flex-col">
            <Button
              onClick={handleUpgrade}
              className="h-11 w-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-violet-700 hover:shadow-blue-600/40 active:scale-[0.99]"
            >
              Upgrade now
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={handleLater}
              className="h-9 w-full rounded-full text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              Maybe later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UpgradePromptContext.Provider>
  );
};
