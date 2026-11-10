import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from './PublicSite';
import home from './design-pages/home.html?raw';
import homeCss from './design-pages/home.css?raw';
import explore from './design-pages/explore.html?raw';
import exploreCss from './design-pages/explore.css?raw';
import learning from './design-pages/learning.html?raw';
import learningCss from './design-pages/learning.css?raw';
import schools from './design-pages/schools.html?raw';
import schoolsCss from './design-pages/schools.css?raw';
import pricing from './design-pages/pricing.html?raw';
import pricingCss from './design-pages/pricing.css?raw';
import about from './design-pages/about.html?raw';
import aboutCss from './design-pages/about.css?raw';
import help from './design-pages/help.html?raw';
import helpCss from './design-pages/help.css?raw';
import contact from './design-pages/contact.html?raw';
import contactCss from './design-pages/contact.css?raw';
import ai from './design-pages/ai.html?raw';
import aiCss from './design-pages/ai.css?raw';
import accessibility from './design-pages/accessibility.html?raw';
import accessibilityCss from './design-pages/accessibility.css?raw';

const PAGES = {
  home: [home, homeCss], explore: [explore, exploreCss], learning: [learning, learningCss],
  schools: [schools, schoolsCss], pricing: [pricing, pricingCss], about: [about, aboutCss],
  help: [help, helpCss], contact: [contact, contactCss], ai: [ai, aiCss],
  accessibility: [accessibility, accessibilityCss],
} as const;

export type DesignPageName = keyof typeof PAGES;

export function DesignPage({ page }: { page: DesignPageName }) {
  const navigate = useNavigate();
  const [html, css] = PAGES[page];
  const followInternalLink = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    if (url.pathname === window.location.pathname && url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(url.pathname + url.search + url.hash);
    }
  };
  return <PublicLayout><style>{css}</style><main id="public-main" className={`pub-design pub-design-${page}`} onClick={followInternalLink} dangerouslySetInnerHTML={{ __html: html }} /></PublicLayout>;
}

export const DesignHome = () => <DesignPage page="home" />;
export const DesignExplore = () => <DesignPage page="explore" />;
export const DesignLearning = () => <DesignPage page="learning" />;
export const DesignSchools = () => <DesignPage page="schools" />;
export const DesignPricing = () => <DesignPage page="pricing" />;
export const DesignAbout = () => <DesignPage page="about" />;
export const DesignHelp = () => <DesignPage page="help" />;
export const DesignContact = () => <DesignPage page="contact" />;
export const DesignAi = () => <DesignPage page="ai" />;
export const DesignAccessibility = () => <DesignPage page="accessibility" />;
