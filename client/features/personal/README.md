# Personal Features (Dormant) — Web

`Bills.tsx` and `Savings.tsx` are **Personal Metricorex** pages, not business
features. They were moved here out of the routed app until the Personal app
commences.

They are no longer imported by `App.tsx` (so they are not part of the business
bundle) and their routes (`/bills`, `/savings`), sidebar entries and pricing
rows were removed.

To reactivate when the Personal app ships:

1. Move the pages back under `client/pages/` (or import from here).
2. Re-add the routes in `client/App.tsx`:
   ```tsx
   <Route path="/bills" element={<KycProtectedRoute element={<Bills />} />} />
   <Route path="/savings" element={<KycProtectedRoute element={<Savings />} />} />
   ```
3. Re-add the sidebar entries in `client/components/layout.tsx` (inside a
   Personal nav group) and the plan-knob rows in `client/pages/Subscription.tsx`
   (the plan fields `bills_enabled`, `max_bills_per_day`,
   `bill_fee_discount_percent`, `savings_enabled`, `max_savings_vaults`,
   `savings_break_fee_discount_percent` are still served by the API).

The matching backend code lives at
`metroflow-backend/server/features/personal/` (see its README).
