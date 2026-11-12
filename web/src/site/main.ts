import { mountShell } from "./shell.ts";
import { mountLanding } from "./landing.ts";
import { mountPages } from "./pages.ts";
import "../styles-v5.css";

mountShell(document, { current: location.pathname });
mountLanding(document);
mountPages(document);
