import { mountInsights } from "./insights.ts";
import { mountShell } from "./shell.ts";
import { mountLanding } from "./landing.ts";
import { mountPages } from "./pages.ts";
import { mountFlow } from "./flow.ts";
import { mountDots } from "./dots.ts";
import { mountHiw } from "./hiw.ts";
import { mountBelt } from "./belt.ts";
import { mountPrivacyScroll } from "./privacy-scroll.ts";
import { mountEd } from "./ed.ts";
import "../styles-v6.css";
import "../styles-v7.css";

mountShell(document, { current: location.pathname });
mountLanding(document);
mountPages(document);
mountFlow(document);
mountDots(document);
mountHiw(document);
mountBelt(document);
mountPrivacyScroll(document);
mountEd(document);

mountInsights();
