// =============================================================================
// Folder-based site themes. Each theme is a self-contained module with its OWN
// composition (nav, hero, sections, footer, type, CSS) — not the shared
// 3-layout skeleton in siteLayouts.jsx. Add a theme by dropping a file here and
// registering it below; everything about it stays in that one file, trackable.
//
// A folder theme registered under an existing catalog key SUPERSEDES that key's
// legacy layout. PublicSite / the preview modal render a folder theme when the
// org's theme key matches one here, and fall back to the legacy layouts otherwise.
// =============================================================================
import Atelier, { meta as atelierMeta } from './lumin.jsx';
import BoutiqueNoir, { meta as boutiqueMeta } from './boutique.jsx';
import MarketFresh, { meta as marketMeta } from './market.jsx';
import LaunchBold, { meta as launchMeta } from './launchBold.jsx';
import StartupGradient, { meta as gradientMeta } from './startupGradient.jsx';
import MinimalPitch, { meta as minimalMeta } from './minimalPitch.jsx';
import FeatureFocus, { meta as featureMeta } from './featureFocus.jsx';

const reg = (m, C) => [m.key, { ...m, Component: C }];

export const SITE_THEMES = Object.fromEntries([
  reg(atelierMeta, Atelier),
  reg(boutiqueMeta, BoutiqueNoir),
  reg(marketMeta, MarketFresh),
  reg(launchMeta, LaunchBold),
  reg(gradientMeta, StartupGradient),
  reg(minimalMeta, MinimalPitch),
  reg(featureMeta, FeatureFocus),
]);

export const getSiteTheme = (key) => (key ? SITE_THEMES[key] || null : null);
export const SITE_THEME_LIST = Object.values(SITE_THEMES);
