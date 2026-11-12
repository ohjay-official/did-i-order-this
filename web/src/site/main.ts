import { mountShell } from "./shell.ts";
import { mountLanding } from "./landing.ts";
import { mountPages } from "./pages.ts";
import "../styles.css";

mountShell(document, { current: location.pathname });
mountLanding(document);
mountPages(document);
