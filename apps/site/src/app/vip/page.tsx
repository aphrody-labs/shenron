import { VipPricingCards } from "@/components/stripe/VipPricingCards";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "DBFR VIP Club — Abonnement & Soutien",
  description:
    "Accédez à une lecture manga sans publicité, en haute résolution avec des avant-premières exclusives.",
};

export default function VipPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-amber-500 selection:text-black">
      {/* Background Toriyama Dragon Aura */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-[600px] rounded-full bg-amber-500/10 blur-[140px]" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 h-80 w-80 rounded-full bg-orange-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 pt-16 pb-24">
        <VipPricingCards />
      </div>
    </div>
  );
}
