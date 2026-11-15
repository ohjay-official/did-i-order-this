import { mountShell } from "./shell.ts";
import { mountLanding } from "./landing.ts";
import { mountPages } from "./pages.ts";
import { mountFlow } from "./flow.ts";
import "../styles-v6.css";

mountShell(document, { current: location.pathname });
mountLanding(document);
mountPages(document);
mountFlow(document);
