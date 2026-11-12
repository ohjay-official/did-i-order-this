import { InboxApp } from "./ui/InboxApp.ts";
import { mountShell } from "./site/shell.ts";
import "./styles.css";

mountShell(document, { current: "/app/" });

const root = document.getElementById("app");
if (!root) {
  throw new Error("The app root is missing.");
}

void new InboxApp(root).start();
