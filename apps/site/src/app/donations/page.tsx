import { DonationsClientView } from "@/components/stripe/DonationsClientView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Soutenir Dragon Ball FR — Dons & Genki Dama",
  description: "Participez au financement de l'archive Dragon Ball FR par un don ponctuel.",
};

export default function DonationsPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-orange-500 selection:text-black">
      {/* Background Aura */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-[700px] rounded-full bg-orange-600/10 blur-[150px]" />
        <div className="absolute top-2/3 right-1/4 h-72 w-72 rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      <div className="relative z-10 pt-16 pb-24">
        <DonationsClientView />
      </div>
    </div>
  );
}
