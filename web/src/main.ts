import { InboxApp } from "./ui/InboxApp.ts";
import "./styles-v5.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("The app root is missing.");
}

void new InboxApp(root).start();
