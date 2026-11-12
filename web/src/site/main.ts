import "../styles.css";
import { mountShell } from "./shell.ts";

mountShell(document, { current: document.location.pathname });
