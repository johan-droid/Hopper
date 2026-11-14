import React from 'react';
import { DotGridBackground } from '../../components/ui/DotGridBackground';
import { LandingNavigation } from './components/LandingNavigation';
import { HeroSection } from './components/HeroSection';
import { ProblemSection } from './components/ProblemSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { ProductPreviewSection } from './components/ProductPreviewSection';
import { BackendStateVisualization } from './components/BackendStateVisualization';
import { IntegrationsSection } from './components/IntegrationsSection';
import { PricingSection } from './components/PricingSection';
import { LandingFooter } from './components/LandingFooter';

export const LandingPage: React.FC = () => {
  return (
    <div className="relative min-h-screen w-full bg-canvas text-ink antialiased selection:bg-rose-500/20 selection:text-white">
      {/* Background ambient lighting with signature crimson hue */}
      <DotGridBackground glowColor="crimson" />

      {/* Main Content Layout */}
      <div className="relative z-10 flex flex-col">
        {/* Section A: Navigation */}
        <LandingNavigation />

        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {/* Section B: Hero with Interactive Pipeline Flow */}
          <HeroSection />

          {/* Section C: The Problem (Raw Failure vs Hopper Investigation) */}
          <ProblemSection />

          {/* Section D: How Hopper Works (5-Stage Connected Lifecycle) */}
          <HowItWorksSection />

          {/* Section E: Real Product Previews (Sandbox, Moat, Sticky PR) */}
          <ProductPreviewSection />

          {/* Section F: Live Backend State & Outbox State Machine (Signature Section) */}
          <BackendStateVisualization />

          {/* Section G: Verified Architectural Integrations */}
          <IntegrationsSection />

          {/* Section H: Transparent Commercial Pricing */}
          <PricingSection />
        </main>

        {/* Section I: Final CTA & Technical Footer */}
        <LandingFooter />
      </div>
    </div>
  );
};

export default LandingPage;
